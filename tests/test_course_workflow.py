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
        booking = {"id": "course_1", "status": "DRAFT"}
        await self.bookings.insert_one(booking)

        with patch.object(server, "db", self.fake_db), patch.object(
            server, "require_admin", AsyncMock(return_value={"id": "admin_1"})
        ):
            doc = await server.create_course_quote("course_1", request=object())

        self.assertEqual(doc.type, "quote")
        self.assertEqual(doc.status, "sent")
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


if __name__ == "__main__":
    unittest.main()
