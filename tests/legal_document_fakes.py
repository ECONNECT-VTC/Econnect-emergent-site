"""Small copy-on-read Mongo fake for legal document CAS tests."""

from copy import deepcopy
from types import SimpleNamespace

from pymongo.errors import DuplicateKeyError


class LegalCollection:
    def __init__(self):
        self.docs = {}
        self.before_update = None
        self.before_insert = None

    async def find_one(self, query):
        for doc in self.docs.values():
            if all(doc.get(key) == value for key, value in query.items()):
                return deepcopy(doc)
        return None

    async def insert_one(self, document):
        if self.before_insert:
            await self.before_insert(document)
        if document["_id"] in self.docs:
            raise DuplicateKeyError("duplicate _id")
        self.docs[document["_id"]] = deepcopy(document)
        return SimpleNamespace(inserted_id=document["_id"])

    async def update_one(self, query, update, upsert=False):
        if self.before_update:
            await self.before_update(query, update)
        doc = self.docs.get(query["_id"])
        if doc is None and upsert:
            self.docs[query["_id"]] = {"_id": query["_id"], **deepcopy(update["$setOnInsert"])}
            return SimpleNamespace(matched_count=0)
        if doc is None or any(doc.get(key) != value for key, value in query.items()):
            return SimpleNamespace(matched_count=0)
        for key, value in update.get("$set", {}).items():
            doc[key] = deepcopy(value)
        for key, value in update.get("$inc", {}).items():
            doc[key] += value
        for key, value in update.get("$push", {}).items():
            doc[key].append(deepcopy(value))
        return SimpleNamespace(matched_count=1)


def legal_database(**collections):
    return SimpleNamespace(
        legal_documents=LegalCollection(),
        legal_document_versions=LegalCollection(),
        **collections,
    )


def published_database(version="a" * 32, **collections):
    db = legal_database(**collections)
    snapshot = {
        "_id": f"terms:{version}", "kind": "terms", "version": version,
        "title": "CGV relues", "sections": [{"heading": "Objet", "paragraphs": ["Texte validé."]}],
        "published_at": "2026-11-12T12:00:00+00:00", "published_by": "admin-1",
    }
    db.legal_document_versions.docs[snapshot["_id"]] = snapshot
    db.legal_documents.docs["terms"] = {
        "_id": "terms", "revision": 2, "published_version": version,
        "draft": {key: snapshot[key] for key in ("title", "sections")},
        "history": [{key: snapshot[key] for key in ("version", "title", "published_at", "published_by")}],
    }
    db.legal_documents.docs["terms"]["draft"]["review_confirmed"] = True
    return db
