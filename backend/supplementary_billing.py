"""Transactional supplementary issuance; never falls back to standalone writes."""

import asyncio
import logging
import os
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pymongo.errors import PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from supplementary_ledger import SupplementaryLedger


logger = logging.getLogger(__name__)
UNAVAILABLE = "Transactions MongoDB non confirmées : émission désactivée. Les brouillons restent disponibles."


class BillingClient(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    address: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]


class SupplementaryIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0, strict=True)
    request_id: UUID
    due_date: date
    client: BillingClient


class SupplementaryPayment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0, strict=True)
    request_id: UUID
    amount_cents: int = Field(gt=0, strict=True)


async def billing_capabilities(database) -> dict:
    enabled = os.getenv("SUPPLEMENTARY_INVOICES_ENABLED", "").lower() == "true"
    try:
        hello = await asyncio.wait_for(database.command("hello"), timeout=5)
        sharded = hello.get("msg") == "isdbgrid"
        supported = (
            bool(hello.get("setName") or sharded)
            and hello.get("logicalSessionTimeoutMinutes") is not None
            and hello.get("maxWireVersion", 0) >= (8 if sharded else 7)
        )
        transactions = "available" if supported else "unsupported"
    except (PyMongoError, asyncio.TimeoutError) as exc:
        logger.warning("MongoDB transaction capability check failed (%s)", type(exc).__name__)
        transactions = "unverified"
    available = enabled and transactions == "available"
    return {
        "enabled": enabled,
        "transactions": transactions,
        "issuance_available": available,
        "reason": (
            None if available else UNAVAILABLE if transactions != "available"
            else "Émission complémentaire désactivée pendant la finalisation du parcours comptable."
        ),
    }


async def issue_supplementary_invoice(database, booking_id: str, **invoice_args) -> dict:
    capabilities = await billing_capabilities(database)
    if not capabilities["issuance_available"]:
        raise HTTPException(503, capabilities["reason"])

    async def publish(session):
        async def allocate_number():
            counter = await database.counters.find_one_and_update(
                {"_id": "invoice_seq"}, {"$inc": {"seq": 1}},
                return_document=True, session=session,
            )
            if counter is None:
                raise HTTPException(409, "Compteur de facturation manquant ; faites vérifier la numérotation")
            sequence = counter["seq"]
            if isinstance(sequence, bool) or not isinstance(sequence, int) or not 1 <= sequence <= 999999:
                raise HTTPException(409, "Limite ou état de numérotation des factures invalide")
            return str(sequence).zfill(6)

        original = await database.invoices.find_one(
            {"booking_id": booking_id, "type": "invoice"},
            {"invoice_number": 1}, session=session,
        )
        if not original or not original.get("invoice_number"):
            raise HTTPException(409, "Émettez d’abord la facture initiale ; aucun numéro complémentaire réservé")
        return await SupplementaryLedger(database.charge_drafts, session=session).issue(
            booking_id, original_number=original["invoice_number"],
            allocate_number=allocate_number, **invoice_args,
        )

    try:
        async with await database.client.start_session() as session:
            return await session.with_transaction(
                publish, read_concern=ReadConcern("snapshot"), write_concern=WriteConcern("majority"),
                max_commit_time_ms=10000,
            )
    except PyMongoError as exc:
        # Do not log the exception text: drivers can include connection details.
        logger.error("Supplementary invoice transaction failed (%s)", type(exc).__name__)
        raise HTTPException(
            503, "Émission non confirmée. Réessayez avec le même identifiant de demande ; aucun paiement déclenché.",
        ) from exc
