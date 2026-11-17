"""Recorded waiting and route changes; financial effects require administrator review."""

import math
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from booking_charges import BookingCharge
from charge_drafts import ChargeDrafts, ChargeDraftUpdate
from supplementary_billing import billing_transaction


EDITABLE_STATUSES = {"DRAFT", "QUOTE_SENT", "QUOTE_ACCEPTED", "ORDER_ISSUED", "ASSIGNED", "IN_PROGRESS"}


class WaitingRules(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = False
    free_minutes: int = Field(default=0, ge=0, le=1440, strict=True)
    price_per_minute: Decimal = Field(default=Decimal("0"), ge=0, le=1000, decimal_places=2, allow_inf_nan=False)


class OperationReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approve", "reject"]
    line: BookingCharge | None = None


def utc(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def waiting_summary(waiting, now=None):
    if not waiting:
        return None
    end = utc(waiting["ended_at"]) if waiting.get("ended_at") else (now or datetime.now(timezone.utc))
    elapsed = max(0, (end - utc(waiting["started_at"])).total_seconds())
    seconds = math.floor(elapsed)
    rules = WaitingRules(**waiting["rules"])
    billable_seconds = max(0, elapsed - rules.free_minutes * 60)
    minutes = math.ceil(billable_seconds / 60)
    amount = (rules.price_per_minute * minutes).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {
        **waiting, "started_at": utc(waiting["started_at"]),
        "ended_at": utc(waiting["ended_at"]) if waiting.get("ended_at") else None, "elapsed_seconds": seconds,
        "free_seconds_remaining": max(0, rules.free_minutes * 60 - seconds),
        "billable_minutes": minutes, "suggested_amount": str(amount) if rules.enabled else None,
    }


class BookingOperations:
    def __init__(self, database):
        self.db = database

    async def rules(self):
        stored = await self.db.operational_settings.find_one({"_id": "waiting"})
        return WaitingRules(**(stored or {}).get("rules", {}))

    async def arrive(self, booking, actor_id):
        if booking["status"] != "ASSIGNED":
            raise HTTPException(409, "L’attente ne peut commencer que sur une course assignée non démarrée.")
        if booking.get("waiting"):
            return waiting_summary(booking["waiting"])
        rules = await self.rules()
        waiting = {
            "id": uuid.uuid4().hex, "started_at": datetime.now(timezone.utc), "started_by": actor_id,
            "ended_at": None, "rules": rules.model_dump(mode="json"), "review": None,
        }
        result = await self.db.bookings.update_one(
            {"id": booking["id"], "driver_id": booking.get("driver_id"), "status": booking["status"],
             "waiting": None},
            {"$set": {"waiting": waiting}},
        )
        if result.matched_count != 1:
            raise HTTPException(409, "La course a changé. Rechargez avant de réessayer.")
        return waiting_summary(waiting)

    async def review(self, booking_id, operation_id, payload, actor_id):
        async def execute(session):
            booking = await self.db.bookings.find_one({"id": booking_id}, session=session)
            if not booking:
                raise HTTPException(404, "Course introuvable.")
            if (booking.get("waiting") or {}).get("id") == operation_id:
                operation = booking["waiting"]
                if not operation.get("ended_at"):
                    raise HTTPException(409, "Terminez l’attente avant de valider des frais.")
                target = "waiting.review"
            elif (booking.get("route_change") or {}).get("id") == operation_id:
                operation = booking["route_change"]
                target = "route_change.review"
            else:
                raise HTTPException(409, "Cette proposition n’est plus la proposition courante.")
            if operation.get("review"):
                raise HTTPException(409, "Cette proposition a déjà été traitée.")
            if payload.decision == "approve" and payload.line is None:
                raise HTTPException(422, "Indiquez le supplément et son traitement de TVA.")
            if payload.decision == "reject" and payload.line is not None:
                raise HTTPException(422, "Un refus ne doit pas ajouter de frais.")
            if payload.decision == "approve":
                drafts = ChargeDrafts(self.db.charge_drafts, session=session)
                draft = await drafts.get(booking_id)
                if len(draft["lines"]) >= 40:
                    raise HTTPException(409, "Le brouillon contient déjà 40 lignes. Traitez-le avant cet ajout.")
                await drafts.save(booking_id, ChargeDraftUpdate(
                    revision=draft["revision"], lines=[*draft["lines"], payload.line],
                ), actor_id)
            result = await self.db.bookings.update_one(
                {"id": booking_id, target: None, target.rsplit(".", 1)[0] + ".id": operation_id},
                {"$set": {target: {
                    "decision": payload.decision, "reviewed_at": datetime.now(timezone.utc),
                    "reviewed_by": actor_id, "line": payload.line.model_dump(mode="json") if payload.line else None,
                }}}, session=session,
            )
            if result.matched_count != 1:
                raise HTTPException(409, "Proposition modifiée entre-temps.")
            return {"message": "Supplément ajouté au brouillon de frais, non facturé." if payload.decision == "approve"
                    else "Proposition refusée. Le prix initial reste inchangé."}
        return await billing_transaction(self.db, execute, require_enabled=False)


def stop_waiting_fields(booking):
    if booking.get("waiting") and not booking["waiting"].get("ended_at"):
        return {"waiting.ended_at": datetime.now(timezone.utc)}
    return {}
