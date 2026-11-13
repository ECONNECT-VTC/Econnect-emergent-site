"""Include saved charges in the first invoice without reissuing an existing one."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException

from booking_charges import BookingCharge, calculate_charges
from supplementary_billing import (
    archive_partner_documents, billing_transaction, commission_totals, next_billing_number,
)
from supplementary_invoice_pdf import generate_supplementary_invoice_pdf


async def issue_initial_with_charges(database, booking_id, payload, actor_id, *, issuer, operator,
                                     commission_rate, commission_vat_rate, client_vat_rate,
                                     base_breakdown, expected_booking=None):
    async def publish(session):
        include_transport = getattr(payload, "include_transport", True)
        operator_only = getattr(payload, "operator_only", False)
        if include_transport and operator_only:
            raise HTTPException(422, "Le mode frais Econnect seuls ne doit pas inclure de transport")
        existing = await database.invoices.find_one(
            {"booking_id": booking_id, "type": "invoice"}, {"_id": 0, "pdf_snapshot": 0}, session=session,
        )
        if existing:
            snapshot = existing.get("charge_snapshot", {})
            if (snapshot.get("request_id") == str(payload.request_id)
                    and snapshot.get("source_revision") == payload.revision
                    and snapshot.get("client") == payload.client.model_dump()
                    and snapshot.get("due_date") == payload.due_date.isoformat()
                    and snapshot.get("include_transport", True) == include_transport
                    and snapshot.get("operator_only", False) == operator_only):
                return existing
            raise HTTPException(409, "Facture initiale déjà émise ; utilisez une facture complémentaire")
        prior_partner_document = await database.invoices.find_one(
            {"booking_id": booking_id, "type": {"$in": ["driver", "commission", "activity"]}},
            {"id": 1}, session=session,
        )
        if prior_partner_document:
            raise HTTPException(409, "Documents financiers déjà émis : conservez-les et facturez les nouveaux frais séparément après la facture initiale")
        booking = await database.bookings.find_one({"id": booking_id}, session=session)
        if not booking:
            raise HTTPException(404, "Réservation introuvable")
        if expected_booking and any(booking.get(key) != expected_booking.get(key) for key in
                                    ("estimated_price", "driver_id", "fulfilled_by_admin", "commission_override")):
            raise HTTPException(409, "Course modifiée pendant l’émission ; rechargez")
        status = str(booking.get("status", "")).upper()
        if status not in {"COMPLETED", "INVOICED", "PAID", "CANCELLED"} or (status == "CANCELLED" and include_transport):
            raise HTTPException(409, "La course doit être terminée avant émission de la facture initiale")
        draft = await database.charge_drafts.find_one({"_id": booking_id}, session=session)
        if not draft or draft["revision"] != payload.revision or not draft["lines"]:
            raise HTTPException(409, "Brouillon absent, vide ou modifié ; rechargez avant émission")
        fulfilled_by_admin = operator_only or bool(booking.get("fulfilled_by_admin"))
        for person in (issuer, operator if not fulfilled_by_admin else issuer):
            if any(not isinstance(person.get(key), str) or not person[key].strip()
                   or person[key].strip().casefold() in {"à compléter", "n/a"}
                   for key in ("name", "address", "siret", "vat_number")):
                raise HTTPException(422, "Coordonnées légales de facturation incomplètes")
        fees = calculate_charges(
            [BookingCharge.model_validate(line) for line in draft["lines"]],
            commission_rate, fulfilled_by_admin,
        )
        base_totals = {"lines": [], "amount_ttc_cents": 0, "amount_ht_cents": 0, "vat_cents": 0}
        if include_transport:
            base = BookingCharge(
                description="Transport — réservation " + booking_id[:6].upper(), quantity=Decimal(1),
                unit_price_ttc=Decimal(str(booking["estimated_price"])),
                tax_treatment="vat", vat_percent=client_vat_rate * 100,
                tax_reason="Taux de TVA de la réservation" if client_vat_rate == 0 else None,
            )
            base_totals = calculate_charges([base], commission_rate, fulfilled_by_admin)
        snapshot = {
            **fees, "id": str(uuid.uuid4()), "title": "FACTURE CLIENT",
            "booking_id": booking_id, "booking_reference": booking_id[:6].upper(),
            "invoice_number": await next_billing_number(database, session),
            "original_invoice_number": "Sans objet — facture initiale", "issued_at": datetime.now(timezone.utc),
            "request_id": str(payload.request_id), "source_revision": payload.revision, "issued_by": actor_id,
            "issuer": issuer, "client": payload.client.model_dump(), "due_date": payload.due_date.isoformat(),
            "driver_id": None if operator_only else booking.get("driver_id"), "fulfilled_by_admin": fulfilled_by_admin,
            "lines": base_totals["lines"] + fees["lines"],
            "include_transport": include_transport,
            "operator_only": operator_only,
        }
        for key in ("amount_ttc_cents", "amount_ht_cents", "vat_cents"):
            snapshot[key] += base_totals[key]
        # A fixed course commission applies to transport only, never to the added lines.
        if include_transport:
            snapshot["commission_cents"] += int(Decimal(str(base_breakdown["commission_ttc"])) * 100)
            if not fulfilled_by_admin:
                snapshot["driver_cents"] += int(Decimal(str(base_breakdown["driver_earning"])) * 100)
        snapshot["admin_retained_cents"] = snapshot["amount_ttc_cents"] - snapshot["driver_cents"]
        snapshot.update(commission_totals(snapshot, commission_vat_rate))
        await archive_partner_documents(database, session, snapshot, operator)
        pdf = generate_supplementary_invoice_pdf(snapshot)
        financial = {
            "price_ttc": snapshot["amount_ttc_cents"] / 100, "price_ht": snapshot["amount_ht_cents"] / 100,
            "tva_client": snapshot["vat_cents"] / 100, "commission_ttc": snapshot["commission_cents"] / 100,
            "commission_ht": snapshot["commission_ht_cents"] / 100,
            "tva_commission": snapshot["commission_vat_cents"] / 100, "driver_earning": snapshot["driver_cents"] / 100,
        }
        metadata = {
            "id": snapshot["id"], "invoice_number": snapshot["invoice_number"], "booking_id": booking_id,
            "client_name": snapshot["client"]["name"], "client_email": booking.get("client_email"),
            "amount_ttc": financial["price_ttc"], "amount_ht": financial["price_ht"],
            "tva_amount": financial["tva_client"], "tva_rate": None, "type": "invoice",
            "driver_id": snapshot["driver_id"], "driver_name": booking.get("driver_name"),
            "created_at": snapshot["issued_at"], "charge_snapshot": snapshot, "financial_snapshot": financial,
        }
        await database.invoices.insert_one({**metadata, "pdf_snapshot": pdf}, session=session)
        await database.charge_drafts.update_one(
            {"_id": booking_id, "revision": payload.revision},
            {"$set": {"lines": [], "initial_invoice_id": snapshot["id"]}, "$inc": {"revision": 1}}, session=session,
        )
        paid = booking.get("paid_amount")
        if paid is None:
            paid = sum(payment["amount"] for payment in booking.get("manual_payments", []))
            if not paid and booking.get("payment_status") == "paid":
                paid = booking["estimated_price"]
        if booking.get("refund_status") not in (None, "succeeded", "failed", "canceled"):
            raise HTTPException(409, "Réconciliez le remboursement de la course avant d’affecter ses encaissements")
        if booking.get("refund_status") == "succeeded":
            paid = max(0, Decimal(str(paid)) - Decimal(str(booking.get("refund_amount") or 0)))
        paid = float(paid)
        await database.bookings.update_one(
            {"id": booking_id},
            {"$set": {"base_price_before_charges": booking["estimated_price"],
                      "estimated_price": financial["price_ttc"], "financial_snapshot": financial,
                      "has_issued_invoice": True,
                      "initial_charge_invoice_id": snapshot["id"],
                      "paid_amount": paid,
                      "payment_status": "paid" if paid >= financial["price_ttc"] else "partially_paid" if paid else "pending",
                      "payment_completed_at": booking.get("payment_completed_at") if paid >= financial["price_ttc"] else None}},
            session=session,
        )
        return metadata

    return await billing_transaction(database, publish)
