import asyncio
import unittest
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from tests.test_charge_drafts import LINE, MemoryCollection, server
from charge_drafts import ChargeDrafts, ChargeDraftUpdate
from supplementary_ledger import SupplementaryLedger


class TestSupplementaryAPI(unittest.TestCase):
    def setUp(self):
        self.collection = MemoryCollection()
        self.user = AsyncMock(return_value={"id": "admin", "role": "admin"})
        self.bookings = SimpleNamespace(find_one=AsyncMock(return_value={
            "id": "booking", "fulfilled_by_admin": True, "commission_override": 999,
        }))
        self.database = SimpleNamespace(
            bookings=self.bookings, charge_drafts=self.collection,
            invoices=SimpleNamespace(find_one=AsyncMock(return_value=None)),
            billing_documents=SimpleNamespace(find_one=AsyncMock(return_value={"pdf": b"%PDF-archived"})),
        )
        self.settings = {
            "commission_rate": 0.1, "tva_commission_rate": 0.2, "company_name": "Econnect", "company_address": "Paris",
            "company_siret": "123", "company_vat_number": "FR123",
        }
        self.issue = AsyncMock(return_value={"id": "issued", "invoice_number": "000002"})
        for context in (
            patch.object(server, "db", self.database),
            patch.object(server, "get_current_user", self.user),
            patch.object(server, "get_commission_settings", AsyncMock(return_value=self.settings)),
            patch.object(server, "issue_supplementary_invoice", self.issue),
        ):
            context.start()
            self.addCleanup(context.stop)
        self.client = TestClient(server.app)
        self.url = "/api/admin/bookings/booking/supplementary-invoices"
        self.payload = {
            "revision": 1, "request_id": str(uuid.uuid4()), "due_date": "2026-12-13",
            "client": {"name": "Client", "address": "Lyon"},
        }

    def test_only_admins_can_access_every_billing_operation(self):
        operations = [
            ("get", "/api/admin/billing-capabilities", None),
            ("get", self.url, None),
            ("post", self.url, self.payload),
            ("get", self.url + "/invoice/pdf", None),
            ("post", self.url + "/invoice/payments", {
                "revision": 1, "request_id": str(uuid.uuid4()), "amount_cents": 100,
            }),
            ("post", self.url + "/invoice/credit", {
                "revision": 1, "request_id": str(uuid.uuid4()), "reason": "Correction",
            }),
            ("post", self.url + "/invoice/refund/payment", {"request_id": str(uuid.uuid4())}),
            ("post", self.url + "/invoice/email/invoice", {}),
            ("post", self.url + "/invoice/email/invoice/resolve", {"sent": False, "evidence": "Vérifié Brevo"}),
            ("post", self.url + "/invoice/resolve-checkout", {"session_id": "cs_test"}),
            ("post", "/api/admin/bookings/booking/initial-invoice-with-charges", self.payload),
            ("get", "/api/admin/financial/supplementary", None),
        ]
        for role in ("client", "driver"):
            self.user.return_value = {"id": "outsider", "role": role}
            for method, url, payload in operations:
                with self.subTest(role=role, method=method, url=url):
                    response = self.client.request(method, url, **({"json": payload} if payload is not None else {}))
                    self.assertEqual(response.status_code, 403)
        self.user.side_effect = HTTPException(401, "Non connecté")
        for method, url, payload in operations:
            self.assertEqual(self.client.request(method, url, **({"json": payload} if payload else {})).status_code, 401)
        self.assertEqual(self.collection.docs, {})
        self.bookings.find_one.assert_not_awaited()
        self.issue.assert_not_awaited()

    def test_customer_and_driver_document_access_is_scoped_to_invoice_owner(self):
        self.bookings.find_one.return_value = {"id": "booking", "client_id": "client-1"}
        invoice = {
            "id": "invoice", "booking_id": "booking", "driver_id": "driver-1", "invoice_number": "000002",
            "amount_ttc_cents": 2000, "paid_cents": 0, "commission_cents": 200,
        }
        url = "/api/billing/bookings/booking/invoices/invoice/documents"
        with patch.object(server, "invoice_record", AsyncMock(return_value=invoice)):
            for role, user_id in (("client", "client-2"), ("driver", "driver-2")):
                self.user.return_value = {"id": user_id, "role": role}
                self.assertEqual(self.client.get(url + "/commission").status_code, 403)
                self.assertEqual(self.client.post(
                    "/api/billing/bookings/booking/invoices/invoice/checkout",
                    json={"request_id": str(uuid.uuid4())},
                ).status_code, 403)
            self.user.return_value = {"id": "client-1", "role": "client"}
            self.assertEqual(self.client.get(url + "/commission").status_code, 403)
            self.assertEqual(self.client.get(url + "/driver").status_code, 403)
            self.user.return_value = {"id": "driver-1", "role": "driver"}
            self.assertEqual(self.client.get(url + "/invoice").status_code, 403)
            self.assertEqual(self.client.get(url + "/commission").content, b"%PDF-archived")

    def test_uncertain_email_resolution_requires_evidence_and_cannot_override_active_send(self):
        invoice = {"id": "invoice", "email": {"status": "unknown", "token": "test"}}
        self.collection.docs["booking"] = {"_id": "booking", "revision": 1, "issued": [invoice]}
        url = self.url + "/invoice/email/invoice/resolve"
        self.assertEqual(self.client.post(url, json={"sent": False, "evidence": ""}).status_code, 422)
        response = self.client.post(url, json={"sent": False, "evidence": "Brevo : aucun envoi constaté"})
        self.assertEqual(response.status_code, 200)
        updated = self.collection.docs["booking"]["issued"][0]
        self.assertEqual(updated["email"]["status"], "retry_allowed")
        self.assertEqual(updated["email_resolutions"][0]["resolved_by"], "admin")

    def test_issues_with_general_commission_and_explicit_client_address_only(self):
        response = self.client.post(self.url, json=self.payload)
        self.assertEqual(response.status_code, 200)
        args = self.issue.await_args.kwargs
        self.assertEqual(args["commission_rate"], Decimal("0.1"))
        self.assertEqual(args["client"], {"name": "Client", "address": "Lyon"})
        self.assertEqual(args["actor_id"], "admin")
        self.assertTrue(args["fulfilled_by_admin"])
        self.assertIsNone(args["driver_id"])
        self.assertNotIn("commission_override", args)
        self.assertNotIn("original_number", args)

    def test_partner_identity_cannot_fall_back_to_operator_details(self):
        self.bookings.find_one.return_value = {"id": "booking", "driver_id": "driver"}
        with patch.object(server, "get_document_driver_profile", AsyncMock(return_value={
            "id": "driver", "name": "Partner", "company_address": "Marseille",
        })):
            self.assertEqual(self.client.post(self.url, json=self.payload).status_code, 200)
        args = self.issue.await_args.kwargs
        self.assertIsNone(args["issuer"]["siret"])
        self.assertIsNone(args["issuer"]["vat_number"])
        self.assertEqual(args["issuer"]["name"], "Partner")
        # The transactional ledger rejects the incomplete identity; it is never filled with operator data.

    def test_missing_booking_and_malformed_requests_do_not_issue(self):
        self.bookings.find_one.return_value = None
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.post(self.url, json=self.payload).status_code, 404)
        for changes in (
            {"revision": True}, {"request_id": "bad"}, {"due_date": "bad"},
            {"client": {"name": "Client", "address": " "}}, {"original_number": "forged"},
        ):
            self.assertEqual(self.client.post(self.url, json={**self.payload, **changes}).status_code, 422)
        self.issue.assert_not_awaited()

    def test_lists_archives_and_records_only_supplementary_payments(self):
        async def seed():
            await ChargeDrafts(self.collection).save("booking", ChargeDraftUpdate(revision=0, lines=[LINE]), "admin")
            return await SupplementaryLedger(self.collection, session=SimpleNamespace(in_transaction=True)).issue(
                "booking", revision=1, request_id=str(uuid.uuid4()), original_number="000001",
                issuer={"name": "Econnect", "address": "Paris", "siret": "123", "vat_number": "FR123"},
                client={"name": "Client", "address": "Lyon"}, due_date="2026-12-13", actor_id="admin",
                commission_rate=Decimal("0.1"), driver_id="driver", fulfilled_by_admin=False,
                allocate_number=AsyncMock(return_value="000002"), booking_reference="BOOKIN",
            )
        issued = asyncio.run(seed())
        state = self.client.get(self.url).json()
        self.assertEqual(state["revision"], 2)
        self.assertNotIn("pdf_snapshot", state["invoices"][0])
        pdf_url = f"{self.url}/{issued['id']}/pdf"
        pdf = self.client.get(pdf_url)
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b"%PDF-"))
        payment_url = f"{self.url}/{issued['id']}/payments"
        payload = {"revision": 2, "request_id": str(uuid.uuid4()), "amount_cents": 701}
        paid = self.client.post(payment_url, json=payload)
        self.assertEqual(paid.status_code, 200)
        self.assertEqual(paid.json()["paid_cents"], 701)
        self.assertEqual(self.client.post(payment_url, json=payload).json()["paid_cents"], 701)
        self.assertEqual(self.client.get(pdf_url).content, pdf.content)
        self.assertEqual(self.client.get(self.url).json()["revision"], 3)
        self.assertEqual(self.client.post(payment_url, json={
            "revision": 3, "request_id": str(uuid.uuid4()), "amount_cents": 1300,
        }).status_code, 422)
        self.assertEqual(self.client.post(payment_url, json={**payload, "amount_cents": 7.01}).status_code, 422)
        self.assertEqual(self.client.get(self.url + "/missing/pdf").status_code, 404)
        self.issue.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
