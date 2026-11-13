"""Frozen supplementary invoices and separate, revision-controlled payments."""

import uuid
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException

from booking_charges import BookingCharge, calculate_charges
from charge_drafts import ChargeDrafts
from supplementary_invoice_pdf import generate_supplementary_invoice_pdf


MAX_ISSUED = 80
MAX_PDF_BYTES = 128 * 1024


def _request_id(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(422, "Identifiant de demande invalide") from exc


def _without_pdf(invoice: dict) -> dict:
    return {key: deepcopy(value) for key, value in invoice.items() if key not in {"pdf_snapshot", "documents"}}


def remaining_cents(invoice: dict) -> int:
    return 0 if invoice.get("credit") else invoice["amount_ttc_cents"] - invoice["paid_cents"]


class SupplementaryLedger:
    def __init__(self, collection, *, session=None):
        self.collection = collection
        self.session = session
        self.options = {"session": session} if session is not None else {}

    async def _document(self, booking_id: str) -> dict:
        await ChargeDrafts(self.collection, session=self.session).get(booking_id)
        document = await self.collection.find_one({"_id": booking_id}, **self.options)
        if document is None:
            raise RuntimeError("Registre de frais introuvable")
        return document

    async def list_issued(self, booking_id: str) -> list[dict]:
        return (await self.state(booking_id))["invoices"]

    async def state(self, booking_id: str) -> dict:
        document = await self._document(booking_id)
        return {
            "revision": document["revision"],
            "invoices": [_without_pdf(invoice) for invoice in document.get("issued", [])],
        }

    async def issue(self, booking_id: str, *, revision: int, request_id: str, original_number: str,
                    issuer: dict, client: dict, due_date: str, actor_id: str, commission_rate: Decimal,
                    driver_id: str | None, fulfilled_by_admin: bool, allocate_number, booking_reference: str) -> dict:
        if self.session is None or not self.session.in_transaction:
            raise RuntimeError("L’émission exige une transaction MongoDB active")
        request_id = _request_id(request_id)
        document = await self._document(booking_id)
        for invoice in document.get("issued", []):
            if invoice["request_id"] == request_id:
                if (invoice["source_revision"] != revision or invoice["client"] != client
                        or invoice["due_date"] != due_date):
                    raise HTTPException(409, "Identifiant déjà utilisé pour une autre demande d’émission")
                return _without_pdf(invoice)
        if document["revision"] != revision:
            raise HTTPException(409, "Brouillon modifié ; rechargez avant émission")
        if len(document.get("issued", [])) >= MAX_ISSUED:
            raise HTTPException(409, "Limite de factures complémentaires atteinte")
        if not original_number or not actor_id or not booking_reference or not due_date:
            raise HTTPException(422, "Informations de facture incomplètes")
        if not fulfilled_by_admin and not driver_id:
            raise HTTPException(422, "Affectez un chauffeur ou précisez que la course est réalisée par l’administrateur")
        for person, keys in ((issuer, ("name", "address", "siret", "vat_number")), (client, ("name", "address"))):
            if not isinstance(person, dict) or any(
                not isinstance(person.get(key), str) or not person[key].strip()
                or person[key].strip().casefold() in {"à compléter", "n/a"}
                for key in keys
            ):
                raise HTTPException(422, "Identité et adresse de facturation incomplètes")
        try:
            totals = calculate_charges([BookingCharge.model_validate(line) for line in document["lines"]],
                                       commission_rate, fulfilled_by_admin)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        number = await allocate_number()
        issued_at = datetime.now(timezone.utc)
        invoice = {
            **totals, "id": str(uuid.uuid4()), "request_id": request_id, "source_revision": revision,
            "booking_id": booking_id, "booking_reference": booking_reference, "invoice_number": number,
            "original_invoice_number": original_number, "issuer": deepcopy(issuer), "client": deepcopy(client),
            "due_date": due_date, "issued_at": issued_at, "issued_by": actor_id, "driver_id": driver_id,
            "fulfilled_by_admin": fulfilled_by_admin, "payments": [], "paid_cents": 0,
        }
        pdf = generate_supplementary_invoice_pdf(invoice)
        if not pdf.startswith(b"%PDF-") or len(pdf) > MAX_PDF_BYTES:
            raise RuntimeError("PDF de facture complémentaire invalide ou trop volumineux")
        invoice["pdf_snapshot"] = pdf
        result = await self.collection.update_one(
            {"_id": booking_id, "revision": revision},
            {"$push": {"issued": invoice}, "$set": {"lines": [], "updated_at": issued_at, "updated_by": actor_id},
             "$inc": {"revision": 1}},
            **self.options,
        )
        if result.matched_count != 1:
            raise HTTPException(409, "Brouillon modifié pendant l’émission ; aucune nouvelle facture publiée")
        return _without_pdf(invoice)

    async def get_pdf(self, booking_id: str, invoice_id: str) -> bytes:
        document = await self._document(booking_id)
        for invoice in document.get("issued", []):
            if invoice["id"] == invoice_id:
                pdf = invoice.get("pdf_snapshot")
                if not isinstance(pdf, bytes) or not pdf.startswith(b"%PDF-"):
                    raise RuntimeError("Archive PDF de facture complémentaire invalide")
                return bytes(pdf)
        raise HTTPException(404, "Facture complémentaire introuvable")

    async def record_payment(self, booking_id: str, invoice_id: str, *, revision: int, request_id: str,
                             amount_cents: int, actor_id: str) -> dict:
        request_id = _request_id(request_id)
        if isinstance(amount_cents, bool) or not isinstance(amount_cents, int) or amount_cents <= 0 or not actor_id:
            raise HTTPException(422, "Montant ou administrateur invalide")
        document = await self._document(booking_id)
        invoices = deepcopy(document.get("issued", []))
        invoice = next((item for item in invoices if item["id"] == invoice_id), None)
        if invoice is None:
            raise HTTPException(404, "Facture complémentaire introuvable")
        for payment in invoice["payments"]:
            if payment["request_id"] == request_id:
                if payment["amount_cents"] != amount_cents:
                    raise HTTPException(409, "Identifiant déjà utilisé pour un autre montant")
                return _without_pdf(invoice)
        if document["revision"] != revision:
            raise HTTPException(409, "Registre modifié ; rechargez avant d’enregistrer le paiement")
        if invoice.get("active_operation"):
            raise HTTPException(409, "Une opération de paiement ou de remboursement est en cours ; réconciliez-la avant de continuer")
        if amount_cents > remaining_cents(invoice):
            raise HTTPException(422, "Le paiement dépasse le solde de la facture complémentaire")
        invoice["payments"].append({"request_id": request_id, "amount_cents": amount_cents,
                                    "received_at": datetime.now(timezone.utc), "recorded_by": actor_id})
        invoice["paid_cents"] += amount_cents
        result = await self.collection.update_one(
            {"_id": booking_id, "revision": revision},
            {"$set": {"issued": invoices}, "$inc": {"revision": 1}},
            **self.options,
        )
        if result.matched_count != 1:
            latest = await self._document(booking_id)
            for existing in latest.get("issued", []):
                if existing["id"] == invoice_id:
                    for payment in existing["payments"]:
                        if payment["request_id"] == request_id and payment["amount_cents"] == amount_cents:
                            return _without_pdf(existing)
            raise HTTPException(409, "Registre modifié pendant l’enregistrement du paiement")
        return _without_pdf(invoice)
