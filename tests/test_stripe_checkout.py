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


class _UpdateResult:
    def __init__(self, modified_count):
        self.modified_count = modified_count


class InMemoryBookingsCollection:
    def __init__(self):
        self.docs = {}

    async def insert_one(self, doc):
        self.docs[doc["id"]] = dict(doc)
        return _InsertResult()

    async def update_one(self, query, update):
        booking_id = query.get("id")
        doc = self.docs.get(booking_id)
        if not doc:
            return _UpdateResult(0)

        payment_filter = query.get("payment_status", {})
        if isinstance(payment_filter, dict) and "$ne" in payment_filter and doc.get("payment_status") == payment_filter["$ne"]:
            return _UpdateResult(0)

        doc.update(update.get("$set", {}))
        self.docs[booking_id] = doc
        return _UpdateResult(1)

    async def find_one(self, query, projection=None):
        booking_id = query.get("id")
        doc = self.docs.get(booking_id)
        if not doc:
            return None
        return dict(doc)


class TestStripeCheckoutFlow(unittest.IsolatedAsyncioTestCase):
    async def test_create_booking_checkout_creates_session(self):
        bookings = InMemoryBookingsCollection()
        vehicle_categories = SimpleNamespace(find_one=AsyncMock(return_value={"id": "berline", "name": "Berline"}))

        fake_db = SimpleNamespace(bookings=bookings, vehicle_categories=vehicle_categories)
        payload = server.BookingCheckoutCreate(
            pickup_address="Aéroport CDG",
            dropoff_address="Paris",
            pickup_date="20/06/2026",
            pickup_time="10:30",
            transfer_type="simple",
            vehicle_category_id="berline",
            distance_km=30.0,
            estimated_price=95.0,
            success_path="/fr/booking/confirmation",
            cancel_path="/fr/booking/cancel",
        )

        with patch.object(server, "db", fake_db), \
             patch.object(server, "STRIPE_SECRET_KEY", "sk_test_123"), \
             patch.object(server, "STRIPE_PUBLISHABLE_KEY", "pk_test_123"), \
             patch.object(server, "get_current_user", AsyncMock(return_value={"id": "u1", "name": "Client", "email": "client@test.com"})), \
             patch.object(server.stripe.checkout.Session, "create", return_value={"id": "cs_test_1", "url": "https://checkout.stripe.test/1"}):
            result = await server.create_booking_checkout(payload, request=object())

        self.assertEqual(result.session_id, "cs_test_1")
        self.assertEqual(result.publishable_key, "pk_test_123")
        self.assertEqual(len(bookings.docs), 1)
        created_booking = next(iter(bookings.docs.values()))
        self.assertEqual(created_booking["payment_status"], "pending")
        self.assertEqual(created_booking["stripe_checkout_session_id"], "cs_test_1")

    async def test_checkout_webhook_is_idempotent(self):
        bookings = InMemoryBookingsCollection()
        booking_id = "booking_1"
        await bookings.insert_one({
            "id": booking_id,
            "client_email": "client@test.com",
            "pickup_date": "20/06/2026",
            "pickup_time": "10:30",
            "pickup_address": "A",
            "dropoff_address": "B",
            "payment_status": "pending",
            "status": "pending",
            "estimated_price": 100.0,
        })
        fake_db = SimpleNamespace(bookings=bookings)

        checkout_session = {
            "id": "cs_test_paid",
            "payment_intent": "pi_test_1",
            "amount_total": 10000,
            "currency": "eur",
            "metadata": {"booking_id": booking_id},
        }

        with patch.object(server, "db", fake_db), \
             patch.object(server, "send_booking_confirmation_to_client", AsyncMock()) as send_email:
            await server._handle_checkout_session_completed(checkout_session)
            await server._handle_checkout_session_completed(checkout_session)

        updated = bookings.docs[booking_id]
        self.assertEqual(updated["payment_status"], "paid")
        self.assertEqual(updated["status"], "received")
        self.assertEqual(updated["paid_amount"], 100.0)
        self.assertEqual(send_email.await_count, 1)


if __name__ == "__main__":
    unittest.main()
