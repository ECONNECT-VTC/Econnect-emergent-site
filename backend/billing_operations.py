"""Durable external operations: lock the invoice before calling a provider."""

import asyncio
import logging
import uuid
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from html import escape

from fastapi import HTTPException

from supplementary_ledger import SupplementaryLedger, _without_pdf, remaining_cents


logger = logging.getLogger(__name__)


async def change_invoice(database, booking_id, invoice_id, change):
    for _ in range(5):
        collection = database.charge_drafts
        document = await collection.find_one({"_id": booking_id})
        if not document:
            raise HTTPException(404, "Registre de facturation introuvable")
        invoices = deepcopy(document.get("issued", []))
        invoice = next((item for item in invoices if item["id"] == invoice_id), None)
        if invoice is None:
            raise HTTPException(404, "Facture complémentaire introuvable")
        result = change(invoice)
        updated = await collection.update_one(
            {"_id": booking_id, "revision": document["revision"]},
            {"$set": {"issued": invoices}, "$inc": {"revision": 1}},
        )
        if updated.matched_count == 1:
            return result
    raise HTTPException(409, "Registre modifié simultanément ; réessayez la même demande")


async def invoice_record(database, booking_id, invoice_id):
    document = await database.charge_drafts.find_one({"_id": booking_id})
    for invoice in (document or {}).get("issued", []):
        if invoice["id"] == invoice_id:
            return invoice
    initial = await database.invoices.find_one({"id": invoice_id, "booking_id": booking_id, "type": "invoice"})
    if initial and initial.get("charge_snapshot"):
        return {**initial["charge_snapshot"], "is_initial": True}
    raise HTTPException(404, "Facture complémentaire introuvable")


def _recent(operation):
    created = operation["created_at"]
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(hours=20):
        raise HTTPException(409, "Opération ancienne non confirmée : vérifiez-la chez le prestataire avant toute nouvelle tentative")


async def checkout_invoice(database, booking_id, invoice_id, request_id, *, stripe_api, frontend_url, client_email):
    request_id = str(request_id)

    def reserve(invoice):
        active = invoice.get("active_operation")
        if active:
            if active["kind"] != "checkout" or active["request_id"] != request_id:
                raise HTTPException(409, "Une opération est déjà en cours ; reprenez ou vérifiez cette opération")
            return active
        if any(payment["request_id"] == request_id for payment in invoice["payments"]):
            raise HTTPException(409, "Ce paiement est déjà enregistré ; rechargez la facture")
        if request_id in invoice.get("expired_checkouts", []):
            raise HTTPException(409, "Cette session a expiré ; lancez une nouvelle demande")
        balance = remaining_cents(invoice)
        if balance <= 0:
            raise HTTPException(409, "Facture déjà soldée ou créditée")
        operation = {
            "kind": "checkout", "request_id": request_id, "amount_cents": balance,
            "created_at": datetime.now(timezone.utc), "invoice_number": invoice["invoice_number"],
        }
        invoice["active_operation"] = operation
        return operation

    operation = await change_invoice(database, booking_id, invoice_id, reserve)
    try:
        if operation.get("session_id"):
            session = await asyncio.to_thread(stripe_api.checkout.Session.retrieve, operation["session_id"])
        else:
            _recent(operation)
            session = await asyncio.to_thread(
                stripe_api.checkout.Session.create,
                mode="payment", payment_method_types=["card"], customer_email=client_email,
                line_items=[{"quantity": 1, "price_data": {
                    "currency": "eur", "unit_amount": operation["amount_cents"],
                    "product_data": {"name": f"Facture complémentaire {operation['invoice_number']}"},
                }}],
                metadata={"payment_scope": "supplementary", "booking_id": booking_id,
                          "invoice_id": invoice_id, "request_id": request_id},
                success_url=f"{frontend_url}/fr/client/bookings?billing_return=1",
                cancel_url=f"{frontend_url}/fr/client/bookings?billing_return=1",
                idempotency_key=f"billing-checkout-{invoice_id}-{request_id}",
            )
    except stripe_api.error.StripeError as exc:
        logger.error("Supplementary checkout unconfirmed (%s)", type(exc).__name__)
        raise HTTPException(502, "Session Stripe non confirmée ; reprenez la même demande sans enregistrer de paiement manuel") from exc

    def attach(invoice):
        active = invoice.get("active_operation")
        if active and active["request_id"] == request_id:
            active["session_id"] = session["id"]
    await change_invoice(database, booking_id, invoice_id, attach)
    await reconcile_checkout(database, session)
    if session.get("status") != "open" or not session.get("url"):
        raise HTTPException(409, "Session terminée ; rechargez le solde de la facture")
    return {"checkout_url": session["url"], "session_id": session["id"], "request_id": request_id}


async def reconcile_checkout(database, session):
    metadata = session.get("metadata") or {}
    if metadata.get("payment_scope") != "supplementary":
        return False
    booking_id, invoice_id = metadata.get("booking_id"), metadata.get("invoice_id")
    request_id = metadata.get("request_id")
    if not all((booking_id, invoice_id, request_id)):
        raise HTTPException(409, "Métadonnées de paiement complémentaire incomplètes")

    def apply(invoice):
        existing = next((item for item in invoice["payments"] if item["request_id"] == request_id), None)
        if existing:
            if existing.get("session_id") != session.get("id"):
                raise HTTPException(409, "Référence de session incompatible avec le paiement enregistré")
            return True
        active = invoice.get("active_operation")
        if (not active or active["kind"] != "checkout" or active["request_id"] != request_id
                or active.get("session_id") not in (None, session.get("id"))):
            raise HTTPException(409, "Session non réservée pour cette facture ; réconciliation requise")
        if session.get("currency") != "eur" or session.get("amount_total") != active["amount_cents"]:
            raise HTTPException(409, "Montant ou devise Stripe incompatible avec la facture")
        if session.get("payment_status") == "paid":
            if not session.get("payment_intent") or invoice.get("credit") or remaining_cents(invoice) < active["amount_cents"]:
                raise HTTPException(409, "Paiement à réconcilier ; facture créditée ou solde incompatible")
            invoice["payments"].append({
                "request_id": request_id, "amount_cents": active["amount_cents"],
                "received_at": datetime.now(timezone.utc), "recorded_by": "stripe",
                "payment_intent": session["payment_intent"], "session_id": session["id"],
            })
            invoice["paid_cents"] += active["amount_cents"]
            invoice.pop("active_operation", None)
            return True
        if session.get("status") == "expired":
            invoice.setdefault("expired_checkouts", []).append(request_id)
            invoice.pop("active_operation", None)
        return False

    return await change_invoice(database, booking_id, invoice_id, apply)


async def sync_checkout(database, booking_id, invoice_id, stripe_api):
    invoice = await invoice_record(database, booking_id, invoice_id)
    active = invoice.get("active_operation")
    if not active or active["kind"] != "checkout":
        return _without_pdf(invoice)
    if not active.get("session_id"):
        raise HTTPException(409, "Création Stripe non confirmée ; reprenez la même demande de paiement")
    try:
        session = await asyncio.to_thread(stripe_api.checkout.Session.retrieve, active["session_id"])
    except stripe_api.error.StripeError as exc:
        logger.error("Checkout reconciliation failed (%s)", type(exc).__name__)
        raise HTTPException(502, "Vérification Stripe impossible ; opération conservée") from exc
    await reconcile_checkout(database, session)
    return _without_pdf(await invoice_record(database, booking_id, invoice_id))


async def resolve_checkout(database, booking_id, invoice_id, session_id, stripe_api):
    invoice = await invoice_record(database, booking_id, invoice_id)
    active = invoice.get("active_operation")
    if not active or active["kind"] != "checkout":
        raise HTTPException(409, "Aucune session complémentaire à réconcilier")
    try:
        session = await asyncio.to_thread(stripe_api.checkout.Session.retrieve, session_id)
    except stripe_api.error.StripeError as exc:
        logger.error("Manual checkout reconciliation failed (%s)", type(exc).__name__)
        raise HTTPException(502, "Session Stripe introuvable ou inaccessible") from exc
    metadata = session.get("metadata") or {}
    if (metadata.get("payment_scope") != "supplementary" or metadata.get("booking_id") != booking_id
            or metadata.get("invoice_id") != invoice_id or metadata.get("request_id") != active["request_id"]
            or session.get("amount_total") != active["amount_cents"] or session.get("currency") != "eur"):
        raise HTTPException(409, "La session ne correspond pas à cette opération réservée")
    def attach(current):
        operation = current.get("active_operation")
        if not operation or operation["request_id"] != active["request_id"]:
            raise HTTPException(409, "Opération modifiée pendant la vérification")
        if operation.get("session_id") not in (None, session["id"]):
            raise HTTPException(409, "Une autre session est déjà liée à cette opération")
        operation["session_id"] = session["id"]
    await change_invoice(database, booking_id, invoice_id, attach)
    await reconcile_checkout(database, session)
    return _without_pdf(await invoice_record(database, booking_id, invoice_id))


async def refund_payment(database, booking_id, invoice_id, payment_id, request_id, actor_id, *, stripe_api):
    request_id = str(request_id)

    def reserve(invoice):
        previous = next((item for item in invoice.get("refunds", []) if item["request_id"] == request_id), None)
        if previous:
            if previous["payment_id"] != payment_id:
                raise HTTPException(409, "Identifiant utilisé pour un autre remboursement")
            return {**previous, "done": True}
        if not invoice.get("credit"):
            raise HTTPException(409, "Émettez un avoir avant de rembourser une facture")
        payment = next((item for item in invoice["payments"] if item["request_id"] == payment_id), None)
        if payment is None:
            raise HTTPException(404, "Encaissement introuvable")
        if any(item["payment_id"] == payment_id for item in invoice.get("refunds", [])):
            raise HTTPException(409, "Encaissement déjà remboursé")
        if any(item["request_id"] == request_id for item in invoice.get("failed_refunds", [])):
            raise HTTPException(409, "Demande Stripe échouée ; utilisez un nouvel identifiant")
        active = invoice.get("active_operation")
        if active:
            if active["kind"] != "refund" or active["request_id"] != request_id or active["payment_id"] != payment_id:
                raise HTTPException(409, "Une autre opération est en cours")
            return active
        operation = {
            "kind": "refund", "request_id": request_id, "payment_id": payment_id,
            "amount_cents": payment["amount_cents"], "payment_intent": payment.get("payment_intent"),
            "created_at": datetime.now(timezone.utc), "recorded_by": actor_id,
        }
        invoice["active_operation"] = operation
        return operation

    operation = await change_invoice(database, booking_id, invoice_id, reserve)
    if operation.get("done"):
        return operation
    if operation.get("payment_intent"):
        try:
            if operation.get("stripe_refund_id"):
                refund = await asyncio.to_thread(stripe_api.Refund.retrieve, operation["stripe_refund_id"])
            else:
                _recent(operation)
                refund = await asyncio.to_thread(
                    stripe_api.Refund.create, payment_intent=operation["payment_intent"],
                    amount=operation["amount_cents"], idempotency_key=f"billing-refund-{invoice_id}-{request_id}",
                    metadata={"invoice_id": invoice_id, "request_id": request_id},
                )
        except stripe_api.error.StripeError as exc:
            logger.error("Supplementary refund unconfirmed (%s)", type(exc).__name__)
            raise HTTPException(502, "Remboursement Stripe non confirmé ; réessayez la même demande") from exc

        if (refund.get("amount") != operation["amount_cents"] or refund.get("currency") != "eur"
                or refund.get("payment_intent") != operation["payment_intent"]
                or (operation.get("stripe_refund_id") and refund.get("id") != operation["stripe_refund_id"])):
            raise HTTPException(409, "Référence, montant ou devise de remboursement Stripe incompatible ; réconciliation requise")
        def attach(invoice):
            active = invoice.get("active_operation")
            if active and active["request_id"] == request_id:
                active["stripe_refund_id"] = refund["id"]
        await change_invoice(database, booking_id, invoice_id, attach)
        if refund.get("status") in {"failed", "canceled"}:
            def failed(invoice):
                active = invoice.get("active_operation")
                if active and active["request_id"] == request_id:
                    invoice.setdefault("failed_refunds", []).append({
                        **active, "status": refund["status"], "checked_at": datetime.now(timezone.utc),
                    })
                    invoice.pop("active_operation", None)
            await change_invoice(database, booking_id, invoice_id, failed)
            raise HTTPException(409, "Échec de remboursement confirmé par Stripe ; rechargez puis créez une nouvelle demande")
        if refund.get("status") != "succeeded":
            raise HTTPException(409, "Remboursement Stripe non finalisé ; vérifiez puis reprenez la même demande")
        operation["stripe_refund_id"] = refund["id"]

    def finish(invoice):
        if any(item["request_id"] == request_id for item in invoice.get("refunds", [])):
            return _without_pdf(invoice)
        active = invoice.get("active_operation")
        if not active or active["request_id"] != request_id:
            raise HTTPException(409, "Réservation de remboursement introuvable")
        invoice.setdefault("refunds", []).append({
            **operation, "refunded_at": datetime.now(timezone.utc),
            "method": "stripe" if operation.get("payment_intent") else "manual",
        })
        invoice["refunded_cents"] = invoice.get("refunded_cents", 0) + operation["amount_cents"]
        invoice.pop("active_operation", None)
        return _without_pdf(invoice)
    return await change_invoice(database, booking_id, invoice_id, finish)


async def send_billing_email(database, booking_id, invoice_id, *, recipient, send, kind="invoice"):
    if kind not in {"invoice", "credit"}:
        raise HTTPException(422, "Type de courriel invalide")
    token = str(uuid.uuid4())
    field = "email" if kind == "invoice" else "credit_email"

    def reserve(invoice):
        if kind == "credit" and not invoice.get("credit"):
            raise HTTPException(409, "Aucun avoir émis")
        state = invoice.get(field, {})
        if state.get("status") == "sent":
            return False
        if state.get("status") in {"sending", "unknown"}:
            raise HTTPException(409, "Envoi déjà lancé ou incertain : confirmez son état dans Brevo avant une nouvelle tentative")
        invoice[field] = {"status": "sending", "token": token, "started_at": datetime.now(timezone.utc), "recipient": recipient}
        return True
    if not recipient:
        raise HTTPException(422, "Adresse courriel du client manquante")
    # Load and validate attachments before reserving the external send.
    invoice = await invoice_record(database, booking_id, invoice_id)
    if kind == "invoice":
        pdf = await SupplementaryLedger(database.charge_drafts).get_pdf(booking_id, invoice_id)
        number = invoice["invoice_number"]
    else:
        document = await database.billing_documents.find_one({"_id": f"{invoice_id}:credit"})
        if not document:
            raise HTTPException(404, "Avoir archivé introuvable")
        pdf = document["pdf"]
        number = invoice["credit"]["invoice_number"]
    if not await change_invoice(database, booking_id, invoice_id, reserve):
        return {"status": "sent", "already_sent": True}
    title = "Votre facture complémentaire" if kind == "invoice" else "Votre avoir"
    try:
        sent = await send(
            recipient, f"{title} Econnect VTC n° {number}",
            f"<p>{escape(title)} n° {escape(number)} est en pièce jointe.</p>",
            attachment_bytes=pdf, attachment_filename=f"{kind}-{number}.pdf",
            template_key="supplementary_invoice" if kind == "invoice" else "credit_note",
            template_params={"INVOICE_NUMBER": number, "ORIGINAL_INVOICE_NUMBER": (
                invoice["invoice_number"] if kind == "credit" else invoice["original_invoice_number"]),
                             "AMOUNT": f"{invoice['amount_ttc_cents'] / 100:.2f} EUR"},
        )
    except Exception as exc:
        logger.error("Billing email outcome unknown (%s)", type(exc).__name__)
        sent = False

    def finish(invoice):
        state = invoice.get(field, {})
        if state.get("token") != token:
            raise HTTPException(409, "État d’envoi modifié ; vérifiez Brevo")
        state.update(status="sent" if sent else "unknown", finished_at=datetime.now(timezone.utc))
    await change_invoice(database, booking_id, invoice_id, finish)
    if not sent:
        raise HTTPException(502, "Envoi non confirmé. Vérifiez Brevo ; aucun renvoi automatique ne sera effectué")
    return {"status": "sent"}
