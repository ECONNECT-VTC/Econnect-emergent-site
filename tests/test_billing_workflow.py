import asyncio
import os
import unittest
import uuid
from copy import deepcopy
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import stripe
from fastapi import HTTPException

from tests.test_supplementary_billing import BillingDatabaseCase
from billing_operations import (
    checkout_invoice, invoice_record, reconcile_checkout, refund_payment, send_billing_email,
    resolve_checkout,
)
from billing_reporting import public_invoice, supplementary_report
from initial_charge_invoice import issue_initial_with_charges
from supplementary_billing import CreditRequest, SupplementaryIssue, credit_invoice, issue_supplementary_invoice
from supplementary_billing import InitialChargeIssue
from supplementary_ledger import SupplementaryLedger


OPERATOR = {"name": "Econnect", "address": "Paris", "siret": "123", "vat_number": "FR123"}


@unittest.skipUnless(os.getenv("MONGO_TEST_URL"), "Requires an isolated test replica set")
class TestBillingWorkflow(BillingDatabaseCase):
    async def issue(self):
        return await issue_supplementary_invoice(
            self.database, "booking", **self.args, operator=OPERATOR, commission_vat_rate=Decimal("0.2"),
        )

    def stripe_mock(self, invoice):
        request_id = str(uuid.uuid4())
        session = {
            "id": "cs_test", "status": "open", "payment_status": "unpaid", "currency": "eur", "amount_total": 2000,
            "payment_intent": None, "url": "https://checkout.stripe.com/test",
            "metadata": {"payment_scope": "supplementary", "booking_id": "booking",
                         "invoice_id": invoice["id"], "request_id": request_id},
        }
        api = SimpleNamespace(
            error=stripe.error,
            checkout=SimpleNamespace(Session=SimpleNamespace(
                create=Mock(return_value=deepcopy(session)), retrieve=Mock(return_value=deepcopy(session)),
            )),
            Refund=SimpleNamespace(
                create=Mock(return_value={"id": "re_test", "amount": 2000, "currency": "eur",
                                          "status": "succeeded", "payment_intent": "pi_test"}),
                retrieve=Mock(),
            ),
        )
        return request_id, session, api

    async def checkout(self, invoice):
        request_id, session, api = self.stripe_mock(invoice)
        await checkout_invoice(
            self.database, "booking", invoice["id"], request_id, stripe_api=api,
            frontend_url="https://example.test", client_email="client@example.test",
        )
        return request_id, session, api

    async def credit(self, invoice, revision=None):
        document = await self.database.charge_drafts.find_one({"_id": "booking"})
        return await credit_invoice(self.database, "booking", invoice["id"], CreditRequest(
            revision=document["revision"] if revision is None else revision,
            request_id=uuid.uuid4(), reason="Correction demandée",
        ), "admin")

    async def test_documents_and_commission_are_frozen_at_issue_even_before_payment(self):
        invoice = await self.issue()
        self.assertEqual(invoice["commission_ht_cents"], 167)
        self.assertEqual(invoice["commission_vat_cents"], 33)
        self.assertEqual(invoice["commission_invoice_number"], "000003")
        for kind in ("driver", "commission"):
            document = await self.database.billing_documents.find_one({"_id": f"{invoice['id']}:{kind}"})
            self.assertTrue(document["pdf"].startswith(b"%PDF-"))
        report = await supplementary_report(self.database)
        self.assertEqual(report["totals"]["commission_cents"], 200)
        self.assertEqual(report["totals"]["remaining_cents"], 2000)
        self.assertEqual(report["totals"]["received_cents"], 0)
        self.assertEqual(report["totals"]["driver_cents"], 1800)
        original_pdf = await SupplementaryLedger(self.database.charge_drafts).get_pdf("booking", invoice["id"])
        credit = await self.credit(invoice)
        self.assertEqual(credit["credit"]["commission_invoice_number"], "000005")
        self.assertEqual(await SupplementaryLedger(self.database.charge_drafts).get_pdf("booking", invoice["id"]), original_pdf)
        report = await supplementary_report(self.database)
        self.assertEqual(report["totals"]["amount_ttc_cents"], 0)
        self.assertEqual(report["totals"]["driver_cents"], 0)
        self.assertEqual(report["totals"]["commission_cents"], 0)
        self.assertEqual(report["totals"]["remaining_cents"], 0)

    async def test_missing_operator_identity_rolls_back_invoice_number_and_documents(self):
        with self.assertRaises(HTTPException):
            await issue_supplementary_invoice(
                self.database, "booking", **self.args, operator={}, commission_vat_rate=Decimal("0.2"),
            )
        self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], 1)
        self.assertEqual(await self.database.billing_documents.count_documents({}), 0)
        self.assertEqual(await SupplementaryLedger(self.database.charge_drafts).list_issued("booking"), [])

    async def test_paid_stripe_session_is_verified_and_recorded_once_without_touching_booking(self):
        invoice = await self.issue()
        before = await self.database.bookings.find_one({"id": "booking"})
        request_id, session, api = await self.checkout(invoice)
        create = api.checkout.Session.create.call_args.kwargs
        self.assertEqual(create["line_items"][0]["price_data"]["unit_amount"], 2000)
        self.assertIn(request_id, create["idempotency_key"])
        self.assertEqual(create["metadata"]["payment_scope"], "supplementary")
        with self.assertRaises(HTTPException):
            await SupplementaryLedger(self.database.charge_drafts).record_payment(
                "booking", invoice["id"], revision=3, request_id=str(uuid.uuid4()), amount_cents=100, actor_id="admin",
            )
        with self.assertRaises(HTTPException):
            await self.credit(invoice)
        complete_unpaid = {**session, "status": "complete"}
        self.assertFalse(await reconcile_checkout(self.database, complete_unpaid))
        current = await invoice_record(self.database, "booking", invoice["id"])
        self.assertEqual(current["paid_cents"], 0)
        paid = {**session, "status": "complete", "payment_status": "paid", "payment_intent": "pi_test"}
        await asyncio.gather(reconcile_checkout(self.database, paid), reconcile_checkout(self.database, paid))
        current = await invoice_record(self.database, "booking", invoice["id"])
        self.assertEqual(current["paid_cents"], 2000)
        self.assertEqual(len(current["payments"]), 1)
        self.assertNotIn("active_operation", current)
        self.assertEqual(await self.database.bookings.find_one({"id": "booking"}), before)

    async def test_wrong_amount_or_currency_never_marks_invoice_paid(self):
        invoice = await self.issue()
        _, session, _ = await self.checkout(invoice)
        for changes in ({"amount_total": 1}, {"currency": "usd"}, {"id": "cs_wrong"}):
            with self.subTest(changes=changes), self.assertRaises(HTTPException):
                await reconcile_checkout(self.database, {
                    **session, "payment_status": "paid", "payment_intent": "pi_test", **changes,
                })
        self.assertEqual((await invoice_record(self.database, "booking", invoice["id"]))["paid_cents"], 0)

    async def test_expired_checkout_unlocks_invoice_but_cannot_be_reused(self):
        invoice = await self.issue()
        request_id, session, api = await self.checkout(invoice)
        await reconcile_checkout(self.database, {**session, "status": "expired"})
        with self.assertRaises(HTTPException):
            await checkout_invoice(
                self.database, "booking", invoice["id"], request_id, stripe_api=api,
                frontend_url="https://example.test", client_email="client@example.test",
            )
        self.assertNotIn("active_operation", await invoice_record(self.database, "booking", invoice["id"]))

    async def test_stripe_creation_timeout_preserves_reservation_and_same_idempotency_key(self):
        invoice = await self.issue()
        request_id, _, api = self.stripe_mock(invoice)
        api.checkout.Session.create.side_effect = stripe.error.APIConnectionError("test")
        for _ in range(2):
            with self.assertRaises(HTTPException):
                await checkout_invoice(
                    self.database, "booking", invoice["id"], request_id, stripe_api=api,
                    frontend_url="https://example.test", client_email="client@example.test",
                )
        keys = [call.kwargs["idempotency_key"] for call in api.checkout.Session.create.call_args_list]
        self.assertEqual(keys[0], keys[1])
        self.assertEqual((await invoice_record(self.database, "booking", invoice["id"]))["active_operation"]["request_id"], request_id)

    async def test_credit_then_stripe_refund_is_separate_and_idempotent(self):
        invoice = await self.issue()
        payment_id, session, api = await self.checkout(invoice)
        await reconcile_checkout(self.database, {
            **session, "status": "complete", "payment_status": "paid", "payment_intent": "pi_test",
        })
        refund_id = str(uuid.uuid4())
        with self.assertRaises(HTTPException):
            await refund_payment(self.database, "booking", invoice["id"], payment_id, refund_id, "admin", stripe_api=api)
        await self.credit(invoice)
        report = await supplementary_report(self.database)
        self.assertEqual(report["totals"]["refundable_cents"], 2000)
        for _ in range(2):
            await refund_payment(self.database, "booking", invoice["id"], payment_id, refund_id, "admin", stripe_api=api)
        api.Refund.create.assert_called_once()
        self.assertEqual(api.Refund.create.call_args.kwargs["amount"], 2000)
        report = await supplementary_report(self.database)
        self.assertEqual(report["totals"]["refundable_cents"], 0)
        self.assertEqual(report["totals"]["received_cents"], 0)
        self.assertEqual(report["totals"]["refunded_cents"], 2000)

    async def test_manual_refund_never_calls_stripe_and_cannot_repeat_with_new_id(self):
        invoice = await self.issue()
        payment_id = str(uuid.uuid4())
        await SupplementaryLedger(self.database.charge_drafts).record_payment(
            "booking", invoice["id"], revision=2, request_id=payment_id, amount_cents=701, actor_id="admin",
        )
        await self.credit(invoice)
        api = Mock()
        await refund_payment(self.database, "booking", invoice["id"], payment_id, str(uuid.uuid4()), "admin", stripe_api=api)
        with self.assertRaises(HTTPException):
            await refund_payment(self.database, "booking", invoice["id"], payment_id, str(uuid.uuid4()), "admin", stripe_api=api)
        api.Refund.create.assert_not_called()
        self.assertEqual((await invoice_record(self.database, "booking", invoice["id"]))["refunded_cents"], 701)

    async def test_mismatched_refund_neither_records_money_nor_releases_the_reservation(self):
        invoice = await self.issue()
        payment_id, session, api = await self.checkout(invoice)
        await reconcile_checkout(self.database, {
            **session, "status": "complete", "payment_status": "paid", "payment_intent": "pi_test",
        })
        await self.credit(invoice)
        refund_id = str(uuid.uuid4())
        valid = deepcopy(api.Refund.create.return_value)
        for changes in ({"amount": 1}, {"currency": "usd"}, {"payment_intent": "pi_other"},
                        {"payment_intent": "pi_other", "status": "failed"}):
            api.Refund.create.return_value = {**valid, **changes}
            with self.subTest(changes=changes), self.assertRaises(HTTPException):
                await refund_payment(self.database, "booking", invoice["id"], payment_id, refund_id, "admin", stripe_api=api)
            current = await invoice_record(self.database, "booking", invoice["id"])
            self.assertEqual(current.get("refunded_cents", 0), 0)
            self.assertEqual(current["active_operation"]["request_id"], refund_id)
            self.assertNotIn("stripe_refund_id", current["active_operation"])

    async def test_pending_refund_resumes_by_provider_reference_without_creating_another(self):
        invoice = await self.issue()
        payment_id, session, api = await self.checkout(invoice)
        await reconcile_checkout(self.database, {
            **session, "status": "complete", "payment_status": "paid", "payment_intent": "pi_test",
        })
        await self.credit(invoice)
        refund_id = str(uuid.uuid4())
        api.Refund.retrieve.return_value = deepcopy(api.Refund.create.return_value)
        api.Refund.create.return_value["status"] = "pending"
        with self.assertRaises(HTTPException):
            await refund_payment(self.database, "booking", invoice["id"], payment_id, refund_id, "admin", stripe_api=api)
        await refund_payment(self.database, "booking", invoice["id"], payment_id, refund_id, "admin", stripe_api=api)
        api.Refund.create.assert_called_once()
        api.Refund.retrieve.assert_called_once_with("re_test")
        self.assertEqual((await invoice_record(self.database, "booking", invoice["id"]))["refunded_cents"], 2000)

    async def test_email_concurrency_sends_only_one_archived_invoice(self):
        invoice = await self.issue()
        send = AsyncMock(return_value=True)
        results = await asyncio.gather(*[
            send_billing_email(self.database, "booking", invoice["id"], recipient="client@example.test", send=send)
            for _ in range(2)
        ], return_exceptions=True)
        self.assertTrue(any(isinstance(result, dict) for result in results))
        send.assert_awaited_once()
        self.assertEqual(send.await_args.kwargs["template_key"], "supplementary_invoice")
        self.assertTrue(send.await_args.kwargs["attachment_bytes"].startswith(b"%PDF-"))
        await send_billing_email(self.database, "booking", invoice["id"], recipient="client@example.test", send=send)
        send.assert_awaited_once()
        await self.credit(invoice)
        await send_billing_email(self.database, "booking", invoice["id"], recipient="client@example.test", send=send, kind="credit")
        self.assertEqual(send.await_args.kwargs["template_key"], "credit_note")

    async def test_unknown_email_outcome_blocks_automatic_retry(self):
        invoice = await self.issue()
        send = AsyncMock(return_value=False)
        for _ in range(2):
            with self.assertRaises(HTTPException):
                await send_billing_email(self.database, "booking", invoice["id"], recipient="client@example.test", send=send)
        send.assert_awaited_once()
        self.assertEqual((await invoice_record(self.database, "booking", invoice["id"]))["email"]["status"], "unknown")

    async def test_initial_fees_are_included_once_with_course_fixed_commission_preserved(self):
        await self.database.invoices.delete_one({"booking_id": "booking"})
        payload = SupplementaryIssue(
            revision=1, request_id=uuid.uuid4(), client={"name": "Client", "address": "Lyon"}, due_date="2026-12-13",
        )
        arguments = {
            "issuer": OPERATOR, "operator": OPERATOR, "commission_rate": Decimal("0.1"),
            "commission_vat_rate": Decimal("0.2"), "client_vat_rate": Decimal("0.1"),
            "base_breakdown": {"commission_ttc": 5, "driver_earning": 95},
        }
        first = await issue_initial_with_charges(self.database, "booking", payload, "admin", **arguments)
        retry = await issue_initial_with_charges(self.database, "booking", payload, "admin", **arguments)
        self.assertEqual(first["invoice_number"], retry["invoice_number"])
        self.assertEqual(first["amount_ttc"], 120)
        self.assertEqual(first["charge_snapshot"]["commission_cents"], 700)
        self.assertEqual(first["charge_snapshot"]["driver_cents"], 11300)
        self.assertEqual(len(first["charge_snapshot"]["lines"]), 2)
        booking = await self.database.bookings.find_one({"id": "booking"})
        self.assertEqual(booking["estimated_price"], 120)
        self.assertEqual(booking["paid_amount"], 100)
        self.assertEqual(booking["payment_status"], "partially_paid")
        self.assertEqual(booking["financial_snapshot"]["commission_ttc"], 7)
        draft = await self.database.charge_drafts.find_one({"_id": "booking"})
        self.assertEqual(draft["lines"], [])
        self.assertEqual((await supplementary_report(self.database))["totals"]["amount_ttc_cents"], 0)
        self.assertTrue((await self.database.invoices.find_one({"booking_id": "booking"}))["pdf_snapshot"].startswith(b"%PDF-"))
        from tests.test_charge_drafts import server
        counter = (await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"]
        with patch.object(server, "db", self.database):
            pdf, metadata = await server.generate_and_store_document(booking, {}, "commission")
        commission = await self.database.billing_documents.find_one({"_id": f"{first['id']}:commission"})
        self.assertEqual(pdf, commission["pdf"])
        self.assertEqual(metadata["invoice_number"], commission["snapshot"]["invoice_number"])
        self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], counter)
        with self.assertRaises(HTTPException):
            await issue_initial_with_charges(
                self.database, "booking", payload.model_copy(update={"request_id": uuid.uuid4()}), "admin", **arguments,
            )

    async def test_public_views_do_not_expose_admin_or_stripe_internal_state(self):
        invoice = await self.issue()
        invoice.update(active_operation={"kind": "checkout", "request_id": "request", "session_id": "private"},
                       email={"token": "private", "recipient": "private"}, payments=[{"payment_intent": "private"}])
        public = public_invoice(invoice, "client")
        self.assertNotIn("commission_cents", public)
        self.assertNotIn("payments", public)
        self.assertNotIn("private", str(public))
        self.assertEqual(public["checkout_request_id"], "request")

    async def test_cancelled_course_can_invoice_only_explicit_operator_fees_not_transport(self):
        await self.database.invoices.delete_one({"booking_id": "booking"})
        await self.database.bookings.update_one({"id": "booking"}, {"$set": {
            "status": "cancelled", "driver_id": None, "refund_status": "succeeded", "refund_amount": 100,
        }})
        payload = InitialChargeIssue(
            revision=1, request_id=uuid.uuid4(), client={"name": "Client", "address": "Lyon"},
            due_date="2026-12-13", include_transport=False, operator_only=True,
        )
        invoice = await issue_initial_with_charges(
            self.database, "booking", payload, "admin", issuer=OPERATOR, operator=OPERATOR,
            commission_rate=Decimal("0.1"), commission_vat_rate=Decimal("0.2"), client_vat_rate=Decimal("0.1"),
            base_breakdown={"commission_ttc": 10, "driver_earning": 90},
        )
        self.assertEqual(invoice["amount_ttc"], 20)
        self.assertEqual(invoice["charge_snapshot"]["commission_cents"], 0)
        self.assertEqual(invoice["charge_snapshot"]["driver_cents"], 0)
        self.assertEqual(invoice["charge_snapshot"]["admin_retained_cents"], 2000)
        booking = await self.database.bookings.find_one({"id": "booking"})
        self.assertEqual(booking["paid_amount"], 0)
        self.assertEqual(booking["payment_status"], "pending")
        self.assertTrue(booking["has_issued_invoice"])

    async def test_manual_reconciliation_can_attach_a_session_after_lost_create_response(self):
        invoice = await self.issue()
        request_id, session, api = self.stripe_mock(invoice)
        api.checkout.Session.create.side_effect = stripe.error.APIConnectionError("test")
        with self.assertRaises(HTTPException):
            await checkout_invoice(
                self.database, "booking", invoice["id"], request_id, stripe_api=api,
                frontend_url="https://example.test", client_email="client@example.test",
            )
        api.checkout.Session.retrieve.return_value = {**session, "payment_status": "paid", "payment_intent": "pi_test"}
        result = await resolve_checkout(self.database, "booking", invoice["id"], session["id"], api)
        self.assertEqual(result["paid_cents"], 2000)
        self.assertNotIn("active_operation", result)

    async def test_reports_use_issued_amounts_and_include_paid_courses(self):
        from tests.test_charge_drafts import server
        invoice = await self.issue()
        await self.database.bookings.update_one({"id": "booking"}, {"$set": {"status": "PAID"}})
        with patch.object(server, "db", self.database), \
                patch.object(server, "require_admin", AsyncMock(return_value={"id": "admin"})), \
                patch.object(server, "get_commission_settings", AsyncMock(return_value={
                    "commission_rate": 0.1, "tva_client_rate": 0.1, "tva_commission_rate": 0.2,
                })):
            stats = await server.get_financial_stats(None)
            self.assertEqual(stats.total_revenue_ttc, 120)
            self.assertEqual(stats.total_commission_ttc, 12)
            self.assertEqual(stats.total_driver_earnings, 108)
            await self.credit(invoice)
            stats = await server.get_financial_stats(None)
            self.assertEqual(stats.total_revenue_ttc, 100)
            self.assertEqual(stats.total_commission_ttc, 10)
            self.assertEqual(stats.total_driver_earnings, 90)

    async def test_transactional_legacy_document_publication_is_concurrent_and_pdf_stable(self):
        from tests.test_charge_drafts import server
        booking = await self.database.bookings.find_one({"id": "booking"})
        settings = {"commission_rate": 0.1, "tva_client_rate": 0.1, "tva_commission_rate": 0.2, "company_name": "Econnect"}
        with patch.object(server, "db", self.database), \
                patch.object(server, "get_document_driver_profile", AsyncMock(return_value=None)), \
                patch.object(server, "build_document_issuer_profile", AsyncMock(return_value=OPERATOR)), \
                patch.object(server, "generate_financial_pdf", return_value=b"%PDF-frozen") as render:
            results = await asyncio.gather(*[
                server.generate_and_store_document(booking, settings, "quote") for _ in range(2)
            ])
            self.assertEqual(results[0][1]["invoice_number"], results[1][1]["invoice_number"])
            self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], 2)
            render.reset_mock()
            pdf, _ = await server.generate_and_store_document({**booking, "estimated_price": 999}, settings, "quote")
            self.assertEqual(pdf, b"%PDF-frozen")
            render.assert_not_called()

    async def test_prepared_fees_cannot_be_silently_omitted_from_initial_invoice(self):
        from tests.test_charge_drafts import server
        await self.database.invoices.delete_one({"booking_id": "booking"})
        with patch.object(server, "db", self.database), patch.object(server, "generate_financial_pdf") as render:
            with self.assertRaises(HTTPException) as error:
                await server.generate_and_store_document({"id": "booking"}, {}, "invoice")
            self.assertEqual(error.exception.status_code, 409)
            render.assert_not_called()
        self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], 1)

    async def test_cancellation_requires_explicit_choice_for_uncredited_fees(self):
        from tests.test_charge_drafts import server
        invoice = await self.issue()
        booking = await self.database.bookings.find_one({"id": "booking"})
        with patch.object(server, "db", self.database):
            with self.assertRaises(HTTPException) as error:
                await server.require_cancellation_billing_choice(booking, False)
            self.assertEqual(error.exception.status_code, 409)
            await server.require_cancellation_billing_choice(booking, True)
            await self.credit(invoice)
            await server.require_cancellation_billing_choice(booking, False)

    async def test_partner_publication_rechecks_fees_prepared_after_its_initial_read(self):
        from tests.test_charge_drafts import server
        await self.database.invoices.delete_one({"booking_id": "booking"})
        booking = await self.database.bookings.find_one({"id": "booking"})
        draft = await self.database.charge_drafts.find_one({"_id": "booking"})
        settings = {"commission_rate": 0.1, "tva_client_rate": 0.1, "tva_commission_rate": 0.2, "company_name": "Econnect"}

        async def prepare_fees(*args, **kwargs):
            await self.database.charge_drafts.update_one(
                {"_id": "booking"}, {"$set": {"lines": draft["lines"]}, "$inc": {"revision": 1}},
            )
            return OPERATOR

        for kind in ("invoice", "driver", "activity", "commission"):
            await self.database.charge_drafts.update_one({"_id": "booking"}, {"$set": {"lines": []}})
            with self.subTest(kind=kind), patch.object(server, "db", self.database), \
                    patch.object(server, "get_document_driver_profile", AsyncMock(return_value=None)), \
                    patch.object(server, "build_document_issuer_profile", side_effect=prepare_fees), \
                    patch.object(server, "generate_financial_pdf") as render:
                with self.assertRaises(HTTPException) as error:
                    await server.generate_and_store_document(booking, settings, kind)
                self.assertEqual(error.exception.status_code, 409)
                render.assert_not_called()
        self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], 1)
