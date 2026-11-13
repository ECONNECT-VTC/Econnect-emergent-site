"""Transactional supplementary issuance; never falls back to standalone writes."""

import asyncio
import logging
import os
from datetime import date
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pymongo.errors import PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from supplementary_ledger import SupplementaryLedger
from supplementary_ledger import MAX_PDF_BYTES, _without_pdf
from supplementary_invoice_pdf import generate_supplementary_invoice_pdf


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


class InitialChargeIssue(SupplementaryIssue):
    include_transport: bool = Field(default=True, strict=True)
    operator_only: bool = Field(default=False, strict=True)


class SupplementaryPayment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0, strict=True)
    request_id: UUID
    amount_cents: int = Field(gt=0, strict=True)


class BillingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID


class CreditRequest(BillingRequest):
    revision: int = Field(ge=0, strict=True)
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]


async def next_billing_number(database, session) -> str:
    counter = await database.counters.find_one_and_update(
        {"_id": "invoice_seq"}, {"$inc": {"seq": 1}}, return_document=True, session=session,
    )
    if counter is None:
        raise HTTPException(409, "Compteur de facturation manquant ; faites vérifier la numérotation")
    sequence = counter["seq"]
    if isinstance(sequence, bool) or not isinstance(sequence, int) or not 1 <= sequence <= 999999:
        raise HTTPException(409, "Limite ou état de numérotation des factures invalide")
    return str(sequence).zfill(6)


async def billing_transaction(database, callback, *, require_enabled=True):
    capabilities = await billing_capabilities(database)
    if capabilities["transactions"] != "available" or (require_enabled and not capabilities["enabled"]):
        raise HTTPException(503, capabilities["reason"] or UNAVAILABLE)
    try:
        async with await database.client.start_session() as session:
            return await session.with_transaction(
                callback, read_concern=ReadConcern("snapshot"), write_concern=WriteConcern("majority"),
                max_commit_time_ms=10000,
            )
    except PyMongoError as exc:
        logger.error("Billing transaction failed (%s)", type(exc).__name__)
        raise HTTPException(
            503, "Opération non confirmée. Réessayez avec le même identifiant de demande ; aucun paiement déclenché par cette transaction.",
        ) from exc


def commission_totals(invoice, rate: Decimal):
    if not rate.is_finite() or not 0 <= rate <= 1:
        raise HTTPException(422, "Taux de TVA de commission invalide")
    from decimal import ROUND_HALF_UP
    ht = int((Decimal(invoice["commission_cents"]) / (1 + rate)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return {"commission_ht_cents": ht, "commission_vat_cents": invoice["commission_cents"] - ht,
            "commission_vat_rate": str(rate)}


async def store_billing_pdf(database, session, invoice_id: str, kind: str, snapshot: dict):
    snapshot = _without_pdf(snapshot)
    pdf = generate_supplementary_invoice_pdf(snapshot)
    if len(pdf) > MAX_PDF_BYTES:
        raise HTTPException(422, "Document de facturation trop volumineux")
    await database.billing_documents.insert_one(
        {"_id": f"{invoice_id}:{kind}", "pdf": pdf, "snapshot": snapshot}, session=session,
    )


async def archive_partner_documents(database, session, invoice, operator):
    if invoice["fulfilled_by_admin"]:
        return
    if any(not isinstance(operator.get(key), str) or not operator[key].strip()
           or operator[key].strip().casefold() in {"à compléter", "n/a"}
           for key in ("name", "address", "siret", "vat_number")):
        raise HTTPException(422, "Identité légale Econnect incomplète pour la facture de commission")
    number = await next_billing_number(database, session)
    rate = Decimal(invoice["commission_vat_rate"])
    line = {
        "description": f"Commission sur facture {invoice['invoice_number']}", "quantity": "1",
        "unit_price_ttc": str(Decimal(invoice["commission_cents"]) / 100),
        "tax_treatment": "vat", "vat_percent": str(rate * 100), "tax_reason": None,
        "amount_ttc_cents": invoice["commission_cents"], "amount_ht_cents": invoice["commission_ht_cents"],
        "vat_cents": invoice["commission_vat_cents"],
    }
    commission = {
        **invoice, "title": "FACTURE DE COMMISSION", "invoice_number": number,
        "original_invoice_number": invoice["invoice_number"], "issuer": operator, "client": invoice["issuer"],
        "lines": [line], "amount_ttc_cents": line["amount_ttc_cents"],
        "amount_ht_cents": line["amount_ht_cents"], "vat_cents": line["vat_cents"],
    }
    await store_billing_pdf(database, session, invoice["id"], "commission", commission)
    invoice["commission_invoice_number"] = number
    statement = {
        **invoice, "title": "RELEVÉ CHAUFFEUR — NON FISCAL",
        "reason": f"Commission TTC : {invoice['commission_cents'] / 100:.2f} EUR ; net chauffeur : {invoice['driver_cents'] / 100:.2f} EUR",
    }
    await store_billing_pdf(database, session, invoice["id"], "driver", statement)


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
            else "Émission désactivée par la configuration ; validez le parcours sur un environnement de test avant activation."
        ),
    }


async def issue_supplementary_invoice(database, booking_id: str, *, operator=None,
                                     commission_vat_rate=None, **invoice_args) -> dict:
    capabilities = await billing_capabilities(database)
    if not capabilities["issuance_available"]:
        raise HTTPException(503, capabilities["reason"])

    async def publish(session):
        booking = await database.bookings.find_one({"id": booking_id}, session=session)
        if not booking:
            raise HTTPException(404, "Réservation introuvable")
        original = await database.invoices.find_one(
            {"booking_id": booking_id, "type": "invoice"},
            {"invoice_number": 1}, session=session,
        )
        if not original or not original.get("invoice_number"):
            raise HTTPException(409, "Émettez d’abord la facture initiale ; aucun numéro complémentaire réservé")
        ledger = SupplementaryLedger(database.charge_drafts, session=session)
        previous = await database.charge_drafts.find_one({"_id": booking_id}, session=session)
        invoice = await ledger.issue(
            booking_id, original_number=original["invoice_number"],
            allocate_number=lambda: next_billing_number(database, session), **invoice_args,
        )
        if any(item["id"] == invoice["id"] for item in (previous or {}).get("issued", [])):
            return invoice
        if (bool(booking.get("fulfilled_by_admin")) != invoice_args["fulfilled_by_admin"]
                or (not invoice_args["fulfilled_by_admin"] and booking.get("driver_id") != invoice_args["driver_id"])):
            raise HTTPException(409, "Affectation de la course modifiée pendant l’émission ; rechargez")
        if commission_vat_rate is not None:
            invoice.update(commission_totals(invoice, commission_vat_rate))
            await archive_partner_documents(database, session, invoice, operator or {})
            await database.charge_drafts.update_one(
                {"_id": booking_id, "issued.id": invoice["id"]},
                {"$set": {f"issued.$.{key}": invoice[key] for key in
                          ("commission_ht_cents", "commission_vat_cents", "commission_vat_rate", "commission_invoice_number")
                          if key in invoice}}, session=session,
            )
        await database.bookings.update_one(
            {"id": booking_id}, {"$set": {"has_supplementary_invoices": True}}, session=session,
        )
        return invoice

    return await billing_transaction(database, publish)


async def credit_invoice(database, booking_id, invoice_id, payload, actor_id):
    async def publish(session):
        ledger = SupplementaryLedger(database.charge_drafts, session=session)
        document = await ledger._document(booking_id)
        invoice = next((item for item in document.get("issued", []) if item["id"] == invoice_id), None)
        if invoice is None:
            raise HTTPException(404, "Facture complémentaire introuvable")
        if invoice.get("credit"):
            if (invoice["credit"]["request_id"] != str(payload.request_id)
                    or invoice["credit"]["reason"] != payload.reason):
                raise HTTPException(409, "Cette facture possède déjà un avoir intégral")
            return _without_pdf(invoice)
        if document["revision"] != payload.revision or invoice.get("active_operation"):
            raise HTTPException(409, "Registre modifié ou paiement en cours ; rechargez et réconciliez avant l’avoir")
        number = await next_billing_number(database, session)
        credit = {**invoice, "title": "AVOIR INTÉGRAL", "invoice_number": number,
                  "original_invoice_number": invoice["invoice_number"], "issued_at": datetime.now(timezone.utc),
                  "request_id": str(payload.request_id), "reason": payload.reason}
        await store_billing_pdf(database, session, invoice_id, "credit", credit)
        invoice["credit"] = {key: credit[key] for key in ("invoice_number", "issued_at", "request_id", "reason")}
        invoice["credit"]["issued_by"] = actor_id
        commission_doc = await database.billing_documents.find_one({"_id": f"{invoice_id}:commission"}, session=session)
        if commission_doc:
            commission_credit = {
                **commission_doc["snapshot"], "title": "AVOIR DE COMMISSION",
                "invoice_number": await next_billing_number(database, session),
                "original_invoice_number": commission_doc["snapshot"]["invoice_number"],
                "reason": payload.reason, "issued_at": credit["issued_at"],
            }
            await store_billing_pdf(database, session, invoice_id, "commission-credit", commission_credit)
            invoice["credit"]["commission_invoice_number"] = commission_credit["invoice_number"]
        await database.charge_drafts.update_one(
            {"_id": booking_id, "revision": payload.revision},
            {"$set": {"issued": document["issued"]}, "$inc": {"revision": 1}}, session=session,
        )
        return _without_pdf(invoice)
    return await billing_transaction(database, publish)
