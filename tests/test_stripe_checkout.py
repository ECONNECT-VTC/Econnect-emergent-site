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

    async def test_mark_booking_paid_is_idempotent(self):
        bookings = InMemoryBookingsCollection()
        booking_id = "booking_1"
        await bookings.insert_one({
            "id": booking_id,
            "client_id": "u1",
            "client_name": "Client Test",
            "client_email": "client@test.com",
            "client_phone": None,
            "pickup_date": "20/06/2026",
            "pickup_time": "10:30",
            "pickup_address": "A",
            "dropoff_address": "B",
            "transfer_type": "simple",
            "vehicle_category_id": None,
            "vehicle_category_name": None,
            "distance_km": 12.0,
            "duration_minutes": None,
            "notes": None,
            "disposition_hours": None,
            "payment_status": "pending",
            "status": "pending",
            "estimated_price": 100.0,
            "stripe_checkout_session_id": "cs_test_paid",
            "stripe_payment_intent_id": None,
            "paid_amount": None,
            "paid_currency": None,
            "driver_id": None,
            "driver_name": None,
            "driver_display_name": None,
            "commission_override": None,
            "fulfilled_by_admin": None,
            "cancellation_reason": None,
            "driver_cancellation_reason": None,
            "cancellation_previous_status": None,
            "refund_amount": None,
            "refunded_at": None,
            "payment_completed_at": None,
            "created_at": server.datetime.now(server.timezone.utc),
            "assigned_at": None,
        })
        fake_db = SimpleNamespace(bookings=bookings)

        checkout_session = {
            "id": "cs_test_paid",
            "status": "complete",
            "payment_intent": "pi_test_1",
            "amount_total": 10000,
            "currency": "eur",
            "metadata": {"booking_id": booking_id},
        }

        with patch.object(server, "db", fake_db), \
             patch.object(server, "send_booking_confirmation_to_client", AsyncMock()) as send_email:
            booking, was_updated = await server._mark_booking_paid(checkout_session)
            booking_repeat, was_updated_repeat = await server._mark_booking_paid(checkout_session)

        updated_booking = bookings.docs[booking_id]
        self.assertEqual(updated_booking["payment_status"], "paid")
        self.assertEqual(updated_booking["status"], "received")
        self.assertEqual(updated_booking["paid_amount"], 100.0)
        self.assertTrue(was_updated)
        self.assertFalse(was_updated_repeat)
        self.assertEqual(booking["id"], booking_id)
        self.assertEqual(booking_repeat["id"], booking_id)
        self.assertEqual(send_email.await_count, 1)

    async def test_confirm_booking_payment_retrieves_and_validates_session(self):
        bookings = InMemoryBookingsCollection()
        booking_id = "booking_2"
        await bookings.insert_one({
            "id": booking_id,
            "client_id": "u1",
            "client_name": "Client Test",
            "client_email": "client@test.com",
            "client_phone": None,
            "pickup_date": "20/06/2026",
            "pickup_time": "10:30",
            "pickup_address": "A",
            "dropoff_address": "B",
            "transfer_type": "simple",
            "vehicle_category_id": None,
            "vehicle_category_name": None,
            "distance_km": 12.0,
            "duration_minutes": None,
            "notes": None,
            "disposition_hours": None,
            "payment_status": "pending",
            "status": "pending",
            "estimated_price": 120.0,
            "stripe_checkout_session_id": "cs_test_confirm",
            "stripe_payment_intent_id": None,
            "paid_amount": None,
            "paid_currency": None,
            "driver_id": None,
            "driver_name": None,
            "driver_display_name": None,
            "commission_override": None,
            "fulfilled_by_admin": None,
            "cancellation_reason": None,
            "driver_cancellation_reason": None,
            "cancellation_previous_status": None,
            "refund_amount": None,
            "refunded_at": None,
            "payment_completed_at": None,
            "created_at": server.datetime.now(server.timezone.utc),
            "assigned_at": None,
        })
        fake_db = SimpleNamespace(bookings=bookings)
        checkout_session = {
            "id": "cs_test_confirm",
            "payment_status": "paid",
            "payment_intent": "pi_test_2",
            "amount_total": 12000,
            "currency": "eur",
            "metadata": {"booking_id": booking_id},
        }

        with patch.object(server, "db", fake_db), \
             patch.object(server, "STRIPE_SECRET_KEY", "sk_test_123"), \
             patch.object(server, "get_current_user", AsyncMock(return_value={"id": "u1"})), \
             patch.object(server, "send_booking_confirmation_to_client", AsyncMock()) as send_email, \
             patch.object(server.stripe.checkout.Session, "retrieve", return_value=checkout_session):
            response = await server.confirm_booking_payment(
                booking_id,
                server.BookingPaymentConfirmationRequest(session_id="cs_test_confirm"),
                request=object()
            )

        self.assertTrue(response.verified)
        self.assertEqual(response.payment_status, "paid")
        self.assertEqual(response.booking.id, booking_id)
        self.assertEqual(bookings.docs[booking_id]["status"], "received")
        self.assertEqual(send_email.await_count, 1)


if __name__ == "__main__":
    unittest.main()
