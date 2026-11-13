"""Administrator-only charge drafts; saving a draft never issues an invoice."""

from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError

from booking_charges import BookingCharge


class ChargeDraftUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0, strict=True)
    lines: list[BookingCharge] = Field(max_length=40)


class ChargeDrafts:
    def __init__(self, collection):
        self.collection = collection

    async def get(self, booking_id: str) -> dict:
        try:
            await self.collection.update_one(
                {"_id": booking_id},
                {"$setOnInsert": {"revision": 0, "lines": [], "updated_at": None, "updated_by": None}},
                upsert=True,
            )
        except DuplicateKeyError:
            pass
        document = await self.collection.find_one({"_id": booking_id})
        if document is None:
            raise RuntimeError("Initialisation du brouillon de frais impossible")
        return {key: document[key] for key in ("revision", "lines", "updated_at", "updated_by")}

    async def save(self, booking_id: str, payload: ChargeDraftUpdate, actor_id: str) -> dict:
        await self.get(booking_id)
        updated_at = datetime.now(timezone.utc)
        result = await self.collection.update_one(
            {"_id": booking_id, "revision": payload.revision},
            {"$set": {"lines": [line.model_dump(mode="json") for line in payload.lines],
                      "updated_at": updated_at, "updated_by": actor_id}, "$inc": {"revision": 1}},
        )
        if result.matched_count != 1:
            raise HTTPException(409, "Brouillon modifié par un autre administrateur. Rechargez avant de réessayer.")
        return await self.get(booking_id)
