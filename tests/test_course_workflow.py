import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, backend_dir)

import server  # noqa: E402


class _InsertResult:
    inserted_id = "fake"


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, _limit):
        return [dict(doc) for doc in self._docs]


class _Collection:
    def __init__(self):
        self.docs = {}

    async def insert_one(self, doc):
        self.docs[doc["id"]] = dict(doc)
        return _InsertResult()

    async def find_one(self, query, _projection=None):
        for doc in self.docs.values():
            if all(doc.get(key) == value for key, value in query.items()):
                return dict(doc)
        return None

    async def update_one(self, query, update):
        for key, doc in self.docs.items():
            if all(doc.get(qk) == qv for qk, qv in query.items()):
                self.docs[key] = {**doc, **update.get("$set", {})}
                return

    def find(self, query, _projection=None):
        docs = []
        for doc in self.docs.values():
            match = True
            for key, value in query.items():
                if doc.get(key) != value:
                    match = False
                    break
            if match:
                docs.append(dict(doc))
        return _Cursor(docs)


class TestCourseWorkflow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.bookings = _Collection()
        self.documents = _Collection()
        self.history = _Collection()
        self.fake_db = SimpleNamespace(
            bookings=self.bookings,
            course_documents=self.documents,
            booking_status_history=self.history,
        )

    async def test_validate_transition_blocks_invalid_jump(self):
        with self.assertRaises(server.HTTPException):
            server.validate_booking_status_transition("DRAFT", "COMPLETED")

    async def test_create_course_quote_sets_quote_sent_and_creates_document(self):
        booking = {"id": "course_1", "status": "DRAFT", "estimated_price": 120.0}
        await self.bookings.insert_one(booking)

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "require_admin", AsyncMock(return_value={"id": "admin_1"})
        ), patch.object(server, "get_commission_settings", AsyncMock(return_value={})), patch.object(
            server, "generate_and_store_document", AsyncMock(return_value=(b"pdf", {}))
        ):
            doc = await server.create_course_quote("course_1", request=object())

        self.assertEqual(doc.type, "quote")
        self.assertEqual(doc.status, "sent")
        self.assertEqual(doc.url, "/api/admin/quotes/course_1/pdf")
        updated = await self.bookings.find_one({"id": "course_1"})
        self.assertEqual(updated["status"], "QUOTE_SENT")

    async def test_create_order_form_requires_quote_accepted(self):
        booking = {"id": "course_2", "status": "QUOTE_SENT"}
        await self.bookings.insert_one(booking)

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "require_admin", AsyncMock(return_value={"id": "admin_1"})
        ):
            with self.assertRaises(server.HTTPException):
                await server.create_course_order_form("course_2", request=object())

    async def test_create_invoice_sets_invoiced_after_completed(self):
        booking = {"id": "course_3", "status": "COMPLETED"}
        await self.bookings.insert_one(booking)

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "require_admin", AsyncMock(return_value={"id": "admin_1"})
        ), patch.object(server, "get_commission_settings", AsyncMock(return_value={})), patch.object(
            server, "generate_and_store_document", AsyncMock(return_value=(b"pdf", {}))
        ):
            doc = await server.create_course_invoice("course_3", request=object())

        self.assertEqual(doc.type, "invoice")
        updated = await self.bookings.find_one({"id": "course_3"})
        self.assertEqual(updated["status"], "INVOICED")

    async def test_client_can_accept_quote_via_course_status_endpoint(self):
        booking = {"id": "course_4", "status": "QUOTE_SENT", "client_id": "client_1"}
        await self.bookings.insert_one(booking)

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "get_current_user", AsyncMock(return_value={"id": "client_1", "role": "client"})
        ):
            response = await server.update_course_status(
                "course_4",
                server.BookingStatusUpdate(status="QUOTE_ACCEPTED"),
                request=object(),
            )

        self.assertEqual(response.status, "QUOTE_ACCEPTED")

    async def test_admin_can_validate_quote_without_client_account(self):
        booking = {"id": "course_5", "status": "QUOTE_SENT"}
        await self.bookings.insert_one(booking)

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "get_current_user", AsyncMock(return_value={"id": "admin_1", "role": "admin"})
        ):
            response = await server.update_course_status(
                "course_5",
                server.BookingStatusUpdate(status="QUOTE_ACCEPTED"),
                request=object(),
            )

        self.assertEqual(response.status, "QUOTE_ACCEPTED")
        updated = await self.bookings.find_one({"id": "course_5"})
        self.assertEqual(updated["status"], "QUOTE_ACCEPTED")

    async def test_client_invoice_download_is_blocked_before_completed(self):
        booking = {"id": "course_6", "status": "QUOTE_ACCEPTED", "client_id": "client_1"}
        await self.bookings.insert_one(booking)

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "get_current_user", AsyncMock(return_value={"id": "client_1", "role": "client"})
        ):
            with self.assertRaises(server.HTTPException) as context:
                await server.download_client_invoice_pdf("course_6", request=object())

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "La facture n'est disponible qu'après une course terminée")

    async def test_client_invoice_download_is_available_after_completed(self):
        booking = {"id": "course_7", "status": "COMPLETED", "client_id": "client_1"}
        await self.bookings.insert_one(booking)

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "get_current_user", AsyncMock(return_value={"id": "client_1", "role": "client"})
        ), patch.object(server, "get_commission_settings", AsyncMock(return_value={})), patch.object(
            server, "generate_and_store_document", AsyncMock(return_value=(b"pdf", {}))
        ):
            response = await server.download_client_invoice_pdf("course_7", request=object())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, "application/pdf")

    async def test_admin_invoice_download_is_blocked_before_completed(self):
        booking = {"id": "course_8", "status": "ASSIGNED"}
        await self.bookings.insert_one(booking)

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "require_admin", AsyncMock(return_value={"id": "admin_1"})
        ):
            with self.assertRaises(server.HTTPException) as context:
                await server.download_admin_invoice_pdf("course_8", request=object())

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "La facture n'est disponible qu'après une course terminée")

    async def test_record_admin_manual_partial_payment_updates_remaining_amount(self):
        await self.bookings.insert_one({
            "id": "course_manual_partial",
            "client_name": "Client Test",
            "client_email": "client@test.com",
            "pickup_address": "Paris",
            "dropoff_address": "Lyon",
            "pickup_date": "24/09/2026",
            "pickup_time": "10:00",
            "transfer_type": "simple",
            "status": "COMPLETED",
            "payment_status": "pending",
            "estimated_price": 150.0,
            "paid_amount": None,
            "manual_payments": [],
            "created_at": server.datetime.now(server.timezone.utc),
        })

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "require_admin", AsyncMock(return_value={"id": "admin_1", "name": "Admin Test", "email": "admin@test.com"})
        ):
            updated = await server.record_admin_booking_payment(
                "course_manual_partial",
                server.BookingManualPaymentUpdate(amount=40, note="Acompte"),
                request=object(),
            )

        stored = await self.bookings.find_one({"id": "course_manual_partial"})
        self.assertEqual(updated.payment_status, "partially_paid")
        self.assertEqual(updated.paid_amount, 40.0)
        self.assertEqual(updated.remaining_amount, 110.0)
        self.assertEqual(stored["status"], "COMPLETED")
        self.assertEqual(len(stored["manual_payments"]), 1)
        self.assertEqual(stored["manual_payments"][0]["note"], "Acompte")

    async def test_record_admin_manual_payment_can_complete_invoice(self):
        paid_at = server.datetime.now(server.timezone.utc)
        await self.bookings.insert_one({
            "id": "course_manual_paid",
            "client_name": "Client Test",
            "client_email": "client@test.com",
            "pickup_address": "Paris",
            "dropoff_address": "Lyon",
            "pickup_date": "24/09/2026",
            "pickup_time": "10:00",
            "transfer_type": "simple",
            "status": "INVOICED",
            "payment_status": "partially_paid",
            "estimated_price": 150.0,
            "paid_amount": 40.0,
            "manual_payments": [{
                "amount": 40.0,
                "paid_at": paid_at,
                "admin_id": "admin_0",
            }],
            "created_at": server.datetime.now(server.timezone.utc),
        })

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "require_admin", AsyncMock(return_value={"id": "admin_1", "name": "Admin Test", "email": "admin@test.com"})
        ):
            updated = await server.record_admin_booking_payment(
                "course_manual_paid",
                server.BookingManualPaymentUpdate(amount=110),
                request=object(),
            )

        stored = await self.bookings.find_one({"id": "course_manual_paid"})
        self.assertEqual(updated.payment_status, "paid")
        self.assertEqual(updated.paid_amount, 150.0)
        self.assertEqual(updated.remaining_amount, 0.0)
        self.assertIsNotNone(updated.payment_completed_at)
        self.assertEqual(len(stored["manual_payments"]), 2)

    async def test_record_admin_manual_payment_rejects_non_positive_amount(self):
        await self.bookings.insert_one({
            "id": "course_manual_invalid",
            "client_name": "Client Test",
            "client_email": "client@test.com",
            "pickup_address": "Paris",
            "dropoff_address": "Lyon",
            "pickup_date": "24/09/2026",
            "pickup_time": "10:00",
            "transfer_type": "simple",
            "status": "COMPLETED",
            "payment_status": "pending",
            "estimated_price": 90.0,
            "created_at": server.datetime.now(server.timezone.utc),
        })

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "require_admin", AsyncMock(return_value={"id": "admin_1"})
        ):
            with self.assertRaises(server.HTTPException) as context:
                await server.record_admin_booking_payment(
                    "course_manual_invalid",
                    server.BookingManualPaymentUpdate(amount=0),
                    request=object(),
                )

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "Le montant reçu doit être supérieur à 0")


if __name__ == "__main__":
    unittest.main()
