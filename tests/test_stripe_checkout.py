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
    async def test_resolve_vehicle_category_name_prefers_id_lookup(self):
        vehicle_categories = SimpleNamespace(find_one=AsyncMock(return_value={"id": "uuid-1", "name": "Green"}))
        fake_db = SimpleNamespace(vehicle_categories=vehicle_categories)

        with patch.object(server, "db", fake_db):
            resolved = await server.resolve_vehicle_category_name("uuid-1")

        self.assertEqual(resolved, "Green")
        vehicle_categories.find_one.assert_awaited_once_with({"id": "uuid-1"})

    async def test_resolve_vehicle_category_name_falls_back_to_name_lookup(self):
        vehicle_categories = SimpleNamespace(
            find_one=AsyncMock(side_effect=[None, {"id": "uuid-2", "name": "Berline"}])
        )
        fake_db = SimpleNamespace(vehicle_categories=vehicle_categories)

        with patch.object(server, "db", fake_db):
            resolved = await server.resolve_vehicle_category_name("Berline")

        self.assertEqual(resolved, "Berline")
        self.assertEqual(vehicle_categories.find_one.await_count, 2)
        self.assertEqual(
            vehicle_categories.find_one.await_args_list[0].args[0],
            {"id": "Berline"},
        )
        self.assertEqual(
            vehicle_categories.find_one.await_args_list[1].args[0],
            {"name": "Berline"},
        )

    async def test_resolve_vehicle_category_name_returns_reference_as_last_resort(self):
        vehicle_categories = SimpleNamespace(find_one=AsyncMock(side_effect=[None, None, None]))
        fake_db = SimpleNamespace(vehicle_categories=vehicle_categories)

        with patch.object(server, "db", fake_db):
            resolved = await server.resolve_vehicle_category_name("Confort Premium")

        self.assertEqual(resolved, "Confort Premium")
        self.assertEqual(vehicle_categories.find_one.await_count, 3)
        self.assertEqual(
            vehicle_categories.find_one.await_args_list[0].args[0],
            {"id": "Confort Premium"},
        )
        self.assertEqual(
            vehicle_categories.find_one.await_args_list[1].args[0],
            {"name": "Confort Premium"},
        )
        self.assertEqual(
            vehicle_categories.find_one.await_args_list[2].args[0],
            {"name": {"$regex": "^Confort\\ Premium$", "$options": "i"}},
        )

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

    async def test_refund_booking_payment_full_refund_without_amount_param(self):
        booking = {
            "id": "booking_refund_full",
            "payment_status": "paid",
            "stripe_payment_intent_id": "pi_full_1",
            "paid_amount": 100.0,
            "paid_currency": "EUR",
        }

        with patch.object(server, "STRIPE_SECRET_KEY", "sk_test_123"), \
             patch.object(server.stripe.Refund, "create", return_value={
                 "id": "re_full_1",
                 "status": "succeeded",
                 "currency": "eur",
                 "amount": 10000,
                 "created": 1710000000,
             }) as create_refund:
            refund_trace = await server._refund_booking_payment(booking, None, "admin:1")

        create_refund.assert_called_once_with(payment_intent="pi_full_1")
        self.assertEqual(refund_trace["stripe_refund_id"], "re_full_1")
        self.assertEqual(refund_trace["refund_amount"], 100.0)
        self.assertEqual(refund_trace["refund_currency"], "EUR")
        self.assertEqual(refund_trace["refund_status"], "succeeded")
        self.assertEqual(refund_trace["refund_initiated_by"], "admin:1")

    async def test_refund_booking_payment_partial_refund_uses_cents(self):
        booking = {
            "id": "booking_refund_partial",
            "payment_status": "paid",
            "stripe_payment_intent_id": "pi_partial_1",
            "paid_amount": 100.0,
            "paid_currency": "EUR",
        }

        with patch.object(server, "STRIPE_SECRET_KEY", "sk_test_123"), \
             patch.object(server.stripe.Refund, "create", return_value={
                 "id": "re_partial_1",
                 "status": "succeeded",
                 "currency": "eur",
                 "amount": 2550,
             }) as create_refund:
            refund_trace = await server._refund_booking_payment(booking, 25.50, "admin_decision")

        create_refund.assert_called_once_with(payment_intent="pi_partial_1", amount=2550)
        self.assertEqual(refund_trace["refund_amount"], 25.5)
        self.assertEqual(refund_trace["refund_status"], "succeeded")

    async def test_refund_booking_payment_rejects_invalid_amounts(self):
        booking = {
            "id": "booking_refund_invalid",
            "payment_status": "paid",
            "stripe_payment_intent_id": "pi_invalid_1",
            "paid_amount": 40.0,
            "paid_currency": "EUR",
        }

        with patch.object(server, "STRIPE_SECRET_KEY", "sk_test_123"), \
             patch.object(server.stripe.Refund, "create") as create_refund:
            with self.assertRaises(server.HTTPException) as zero_error:
                await server._refund_booking_payment(booking, 0, "admin:1")
            with self.assertRaises(server.HTTPException) as too_high_error:
                await server._refund_booking_payment(booking, 41.0, "admin:1")

        self.assertEqual(zero_error.exception.status_code, 400)
        self.assertEqual(too_high_error.exception.status_code, 400)
        create_refund.assert_not_called()

    async def test_refund_booking_payment_is_idempotent_for_existing_refund(self):
        booking = {
            "id": "booking_refund_idempotent",
            "payment_status": "refunded",
            "stripe_refund_id": "re_existing",
            "refund_amount": 15.0,
            "refund_status": "succeeded",
            "refund_currency": "EUR",
            "refunded_at": server.datetime.now(server.timezone.utc),
            "refund_initiated_by": "admin:legacy",
            "stripe_payment_intent_id": "pi_existing",
        }

        with patch.object(server.stripe.Refund, "create") as create_refund:
            refund_trace = await server._refund_booking_payment(booking, None, "admin:1")

        create_refund.assert_not_called()
        self.assertEqual(refund_trace["stripe_refund_id"], "re_existing")
        self.assertEqual(refund_trace["refund_status"], "succeeded")
        self.assertEqual(refund_trace["refund_amount"], 15.0)

    async def test_cancel_booking_admin_non_paid_does_not_call_stripe_refund(self):
        bookings = InMemoryBookingsCollection()
        booking_id = "booking_non_paid_cancel"
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
            "payment_status": "not_required",
            "status": "received",
            "estimated_price": 80.0,
            "stripe_checkout_session_id": None,
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
            "stripe_refund_id": None,
            "refund_status": None,
            "refund_currency": None,
            "refund_initiated_by": None,
            "payment_completed_at": None,
            "created_at": server.datetime.now(server.timezone.utc),
            "assigned_at": None,
        })
        fake_db = SimpleNamespace(bookings=bookings)

        with patch.object(server, "db", fake_db), \
             patch.object(server, "require_admin", AsyncMock(return_value={"id": "admin1", "role": "admin"})), \
             patch.object(server.stripe.Refund, "create") as create_refund:
            response = await server.cancel_booking_admin(
                booking_id,
                server.AdminCancellationRequest(cancellation_reason="Test", refund_amount=None),
                request=object()
            )

        create_refund.assert_not_called()
        self.assertEqual(response["status"], "cancelled")
        self.assertEqual(response["refund"]["refund_status"], "none")
        self.assertEqual(bookings.docs[booking_id]["status"], "cancelled")


if __name__ == "__main__":
    unittest.main()
