"""Editable drafts and immutable, explicitly published MongoDB legal documents."""

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pymongo.errors import DuplicateKeyError

from booking_terms import CURRENT_TERMS_VERSION, TERMS_DOCUMENTS


KINDS = ("terms", "legal-notice", "privacy")
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=12000)]
GUIDANCE = (
    "Suggestions de rédaction, non conseil juridique. Compléter les marqueurs "
    "[À COMPLÉTER], vérifier les pratiques réelles et faire valider les textes "
    "avant de confirmer la revue et de publier. Les durées de conservation, "
    "bases légales et le consentement aux traceurs doivent être validés."
)
# Only explicit editorial markers are blocked, not guesses about ordinary prose.
PLACEHOLDER = re.compile(
    r"\[\s*(?:À\s+COMPLÉTER|A\s+COMPLETER|TODO|TBD|FIXME)\b"
    r"|\b(?:TODO|TBD|FIXME)\b",
    re.IGNORECASE,
)


class LegalSection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    heading: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    paragraphs: list[Text] = Field(min_length=1, max_length=200)


class DraftContent(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    sections: list[LegalSection] = Field(min_length=1, max_length=100)
    review_confirmed: bool

    @model_validator(mode="after")
    def limit_total_text(self):
        size = len(self.title) + sum(
            len(section.heading) + sum(map(len, section.paragraphs))
            for section in self.sections
        )
        if size > 200000:
            raise ValueError("Le document ne doit pas dépasser 200000 caractères")
        return self


class DraftUpdate(DraftContent):
    revision: int = Field(ge=0, strict=True)


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    revision: int = Field(ge=0, strict=True)


def validate_kind(kind: str) -> None:
    if kind not in KINDS:
        raise HTTPException(status_code=404, detail="Document juridique introuvable")


def seed_draft(kind: str) -> dict:
    validate_kind(kind)
    if kind == "terms":
        source = TERMS_DOCUMENTS[CURRENT_TERMS_VERSION].model_dump(mode="json")
        draft = {key: source[key] for key in ("title", "sections")}
        draft["sections"][0]["paragraphs"].append(
            "[À COMPLÉTER : identité juridique, forme, siège, contacts, "
            "immatriculation professionnelle et fiscale ; médiateur, coordonnées "
            "et saisine ; conditions d'annulation et droits des passagers à valider.]"
        )
    else:
        path = Path(__file__).parent / "assets" / "legal-documents" / f"{kind}.json"
        draft = json.loads(path.read_text(encoding="utf-8"))
    return DraftContent(**draft, review_confirmed=False).model_dump()


def admin_record(document: dict) -> dict:
    return {
        "kind": document["_id"],
        "title": document["draft"]["title"],
        "draft": document["draft"],
        "revision": document["revision"],
        "published_version": document["published_version"],
        "history": document["history"],
        "guidance": GUIDANCE,
    }


class LegalDocuments:
    def __init__(self, database):
        self.documents = database.legal_documents
        self.versions = database.legal_document_versions

    async def get_draft(self, kind: str) -> dict:
        validate_kind(kind)
        initial = {
            "draft": seed_draft(kind), "revision": 0,
            "published_version": None, "history": [],
        }
        try:
            await self.documents.update_one(
                {"_id": kind}, {"$setOnInsert": initial}, upsert=True,
            )
        except DuplicateKeyError:
            # A simultaneous first read may have inserted the same kind.
            pass
        document = await self.documents.find_one({"_id": kind})
        if document is None:
            raise RuntimeError("Legal document initialization failed")
        return admin_record(document)

    async def list_drafts(self) -> dict:
        return {"documents": [await self.get_draft(kind) for kind in KINDS]}

    async def save_draft(self, kind: str, update: DraftUpdate) -> dict:
        await self.get_draft(kind)
        result = await self.documents.update_one(
            {"_id": kind, "revision": update.revision},
            {"$set": {"draft": update.model_dump(exclude={"revision"})},
             "$inc": {"revision": 1}},
        )
        if result.matched_count != 1:
            raise HTTPException(status_code=409, detail="Document modifié ; rechargez avant de réessayer")
        return await self.get_draft(kind)

    async def publish(self, kind: str, request: PublishRequest, publisher: str) -> dict:
        record = await self.get_draft(kind)
        if record["revision"] != request.revision:
            raise HTTPException(status_code=409, detail="Document modifié ; rechargez avant de publier")
        draft = DraftContent(**record["draft"])
        text = [draft.title]
        for section in draft.sections:
            text.extend([section.heading, *section.paragraphs])
        if not draft.review_confirmed or any(PLACEHOLDER.search(part) for part in text):
            raise HTTPException(
                status_code=422,
                detail="Confirmez la revue et complétez tous les marqueurs avant publication",
            )
        version = uuid.uuid4().hex
        snapshot = {
            "_id": f"{kind}:{version}", "kind": kind, "version": version,
            **draft.model_dump(exclude={"review_confirmed"}),
            "published_at": datetime.now(timezone.utc), "published_by": publisher,
        }
        await self.versions.insert_one(snapshot)
        metadata = {key: snapshot[key] for key in (
            "version", "published_at", "published_by", "title",
        )}
        result = await self.documents.update_one(
            {"_id": kind, "revision": request.revision},
            {"$set": {"published_version": version},
             "$push": {"history": metadata}, "$inc": {"revision": 1}},
        )
        if result.matched_count != 1:
            # The unreferenced snapshot is intentionally never readable via the API.
            raise HTTPException(status_code=409, detail="Document modifié ; rechargez avant de publier")
        return await self.get_draft(kind)

    async def get_published(self, kind: str, version: str | None = None, *, admin=False) -> dict:
        validate_kind(kind)
        document = await self.documents.find_one({"_id": kind})
        selected = version if version is not None else (document or {}).get("published_version")
        if version is None and selected and not any(
            item["version"] == selected for item in document["history"]
        ):
            raise RuntimeError("Published legal document pointer is not archived")
        if not selected or not document or not any(
            item["version"] == selected for item in document["history"]
        ):
            raise HTTPException(status_code=404, detail="Version publiée introuvable")
        snapshot = await self.versions.find_one({"_id": f"{kind}:{selected}"})
        if snapshot is None:
            # A referenced snapshot disappearing is corruption, not an unpublished draft.
            raise RuntimeError("Published legal document snapshot is missing")
        return {
            key: value for key, value in snapshot.items()
            if key != "_id" and (admin or key != "published_by")
        }

    async def current_terms(self) -> dict | None:
        try:
            return await self.get_published("terms")
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            return None
