import unittest
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from tests.test_booking_map import BOOKING
from tests.test_charge_drafts import MemoryCollection, LINE
from tests.test_invoice_email import server
from booking_operations import BookingOperations, OperationReview, WaitingRules, stop_waiting_fields, waiting_summary


START = datetime(2026, 11, 17, 10, 0, tzinfo=timezone.utc)


def waiting(ended=False):
    return {
        "id": "wait-1", "started_at": START, "started_by": "driver-1",
        "ended_at": START + timedelta(minutes=7) if ended else None,
        "rules": {"enabled": True, "free_minutes": 5, "price_per_minute": "1.25"}, "review": None,
    }


class TestWaitingArithmetic(unittest.TestCase):
    def test_exact_allowance_and_started_minutes_and_frozen_end(self):
        record = waiting()
        for seconds, minutes, amount, remaining in (
            (0, 0, "0.00", 300), (299, 0, "0.00", 1), (300, 0, "0.00", 0),
            (300.001, 1, "1.25", 0), (301, 1, "1.25", 0), (360, 1, "1.25", 0),
            (360.001, 2, "2.50", 0), (361, 2, "2.50", 0),
        ):
            with self.subTest(seconds=seconds):
                result = waiting_summary(record, START + timedelta(seconds=seconds))
                self.assertEqual((result["billable_minutes"], result["suggested_amount"], result["free_seconds_remaining"]),
                                 (minutes, amount, remaining))
        record["ended_at"] = (START + timedelta(seconds=361)).replace(tzinfo=None)
        self.assertEqual(waiting_summary(record)["suggested_amount"], "2.50")
        self.assertEqual(stop_waiting_fields({"waiting": record}), {})
        record["rules"]["enabled"] = False
        self.assertIsNone(waiting_summary(record)["suggested_amount"])
        self.assertIsNone(waiting_summary(None))

    def test_rules_reject_invalid_values_and_no_tariff_is_guessed(self):
        self.assertFalse(WaitingRules().enabled)
        for payload in (
            {"free_minutes": -1}, {"free_minutes": 1441}, {"free_minutes": True},
            {"price_per_minute": "-1"}, {"price_per_minute": "0.001"},
            {"price_per_minute": "NaN"}, {"price_per_minute": "1001"},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                WaitingRules(**payload)

    def test_booking_response_explicitly_serializes_mongo_naive_timestamps_as_utc(self):
        record = waiting(ended=True)
        record["started_at"] = record["started_at"].replace(tzinfo=None)
        record["ended_at"] = record["ended_at"].replace(tzinfo=None)
        response = server.BookingResponse(
            id="b", client_name="Test", client_email="demo@example.test", status="ASSIGNED", created_at=START,
            waiting=record, route_change={"id": "r", "changed_at": START.replace(tzinfo=None)}, **BOOKING,
        ).model_dump(mode="json")
        for value in (response["waiting"]["started_at"], response["waiting"]["ended_at"], response["route_change"]["changed_at"]):
            self.assertTrue(value.endswith(("Z", "+00:00")), value)


class TestBookingOperations(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.booking = {
            "id": "booking-1", "client_id": "client-1", "driver_id": "driver-1",
            "status": "ASSIGNED", "estimated_price": 80, "vehicle_category_id": "sedan",
            "financial_snapshot": {"driver_net": 60}, "paid_amount": 16, **BOOKING,
        }
        self.bookings = SimpleNamespace(
            find_one=AsyncMock(side_effect=lambda *args, **kwargs: deepcopy(self.booking)),
            update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
        )
        self.db = SimpleNamespace(
            bookings=self.bookings, charge_drafts=MemoryCollection(),
            operational_settings=SimpleNamespace(find_one=AsyncMock(return_value={
                "rules": waiting()["rules"],
            })),
        )
        for context in (
            patch.object(server, "db", self.db),
            patch.object(server, "get_current_user", AsyncMock(return_value={"id": "client-1", "role": "client"})),
            patch.object(server, "enforce_map_limits", AsyncMock()),
            patch.object(server, "calculate_map_route", AsyncMock(return_value={"routes": [{"distance": 50000, "duration": 3600}]})),
            patch.object(server, "estimate_price", AsyncMock(return_value=[SimpleNamespace(category_id="sedan", final_price=110)])),
        ):
            context.start()
            self.addCleanup(context.stop)

    async def test_arrival_records_server_time_once_with_immutable_rules_and_cas(self):
        result = await BookingOperations(self.db).arrive(self.booking, "driver-1")
        self.assertEqual(result["started_by"], "driver-1")
        self.assertIsNone(result["ended_at"])
        self.assertLess(abs((datetime.now(timezone.utc) - result["started_at"]).total_seconds()), 2)
        query, update = self.bookings.update_one.await_args.args
        self.assertEqual(query, {"id": "booking-1", "driver_id": "driver-1", "status": "ASSIGNED", "waiting": None})
        self.assertEqual(set(update["$set"]), {"waiting"})
        self.booking["waiting"] = update["$set"]["waiting"]
        second = await BookingOperations(self.db).arrive(self.booking, "driver-1")
        self.assertEqual(second["id"], result["id"])
        self.bookings.update_one.assert_awaited_once()
        self.bookings.update_one.return_value.matched_count = 0
        self.booking.pop("waiting")
        with self.assertRaises(HTTPException) as exc:
            await BookingOperations(self.db).arrive(self.booking, "driver-1")
        self.assertEqual(exc.exception.status_code, 409)

    async def test_destination_changes_immediately_even_in_progress_without_changing_money(self):
        for status in ("QUOTE_ACCEPTED", "ORDER_ISSUED", "ASSIGNED", "IN_PROGRESS"):
            self.booking["status"] = status
            self.booking["route_change"] = {"id": "prior", "review": None}
            payload = {key: value for key, value in BOOKING.items() if key.endswith(("_lat", "_lng"))}
            payload.update(dropoff_address="Orly", dropoff_lat=48.72, distance_km=1, duration_minutes=1,
                           estimated_price=1, paid_amount=0, driver_id="attacker", status="PAID")
            await server.update_booking("booking-1", payload, object())
            query, update = self.bookings.update_one.await_args.args
            stored = update["$set"]
            self.assertEqual(stored["dropoff_address"], "Orly")
            self.assertEqual((stored["distance_km"], stored["duration_minutes"]), (50, 60))
            self.assertEqual(stored["route_change"]["suggested_total"], 110)
            self.assertEqual(stored["route_change"]["initial_price"], 80)
            self.assertIsNone(stored["route_change"]["review"])
            self.assertFalse(set(stored) & {"estimated_price", "financial_snapshot", "paid_amount", "driver_id", "status"})
            self.assertEqual(query["driver_id"], "driver-1")
            self.assertEqual(update["$push"]["route_change_history"]["$each"][0]["id"], "prior")

    async def test_route_guards_reject_stale_writes_locked_pickup_and_foreign_booking(self):
        self.booking["waiting"] = waiting()
        with self.assertRaises(HTTPException) as exc:
            await server.update_booking("booking-1", {"pickup_time": "12:00"}, object())
        self.assertEqual(exc.exception.status_code, 422)
        self.bookings.update_one.assert_not_awaited()
        self.booking["client_id"] = "other"
        with self.assertRaises(HTTPException) as exc:
            await server.update_booking("booking-1", {"notes": "Test"}, object())
        self.assertEqual(exc.exception.status_code, 403)
        self.booking["client_id"] = "client-1"
        self.bookings.update_one.return_value.matched_count = 0
        with self.assertRaises(HTTPException) as exc:
            await server.update_booking("booking-1", {"notes": "Test"}, object())
        self.assertEqual(exc.exception.status_code, 409)

    async def test_departure_freezes_waiting_atomically_and_conflicts_are_explicit(self):
        self.booking["waiting"] = waiting()
        with patch.object(server, "require_driver", AsyncMock(return_value={"id": "driver-1"})), \
                patch.object(server, "log_booking_status_transition", AsyncMock()):
            await server.update_booking_status_driver("booking-1", server.BookingStatusUpdate(status="IN_PROGRESS"), object())
        query, update = self.bookings.update_one.await_args.args
        self.assertEqual(query["waiting"], self.booking["waiting"])
        self.assertIn("waiting.ended_at", update["$set"])
        self.assertEqual(update["$set"]["status"], "IN_PROGRESS")

    async def test_cancellation_freezes_waiting_but_cancellation_request_does_not(self):
        self.booking["waiting"] = waiting()
        await server.request_booking_cancellation("booking-1", server.BookingCancelRequest(cancellation_reason="Annuler"), object())
        self.assertNotIn("waiting.ended_at", self.bookings.update_one.await_args.args[1]["$set"])
        with patch.object(server, "require_admin", AsyncMock(return_value={"id": "admin-1"})), \
                patch.object(server, "_refund_booking_payment", AsyncMock(return_value={})):
            await server.cancel_booking_admin("booking-1", server.AdminCancellationRequest(), object())
            self.assertIn("waiting.ended_at", self.bookings.update_one.await_args.args[1]["$set"])
            self.booking["status"] = "cancellation_requested"
            await server.handle_booking_cancellation("booking-1", server.BookingCancellationDecision(approved=True), object())
            self.assertIn("waiting.ended_at", self.bookings.update_one.await_args.args[1]["$set"])

    async def test_review_uses_same_transaction_for_draft_and_decision_and_rolls_back(self):
        self.booking["waiting"] = waiting(ended=True)
        session = object()

        async def transaction(database, callback, **kwargs):
            self.assertFalse(kwargs["require_enabled"])
            before = deepcopy(database.charge_drafts.docs)
            try:
                return await callback(session)
            except Exception:
                database.charge_drafts.docs = before
                raise

        with patch("booking_operations.billing_transaction", transaction):
            body = OperationReview(decision="approve", line=LINE)
            await BookingOperations(self.db).review("booking-1", "wait-1", body, "admin-1")
            self.assertEqual(len(self.db.charge_drafts.docs["booking-1"]["lines"]), 1)
            self.assertIs(self.bookings.update_one.await_args.kwargs["session"], session)
            self.assertEqual(self.bookings.update_one.await_args.args[1]["$set"]["waiting.review"]["reviewed_by"], "admin-1")
            self.booking["waiting"]["review"] = {"decision": "approve"}
            with self.assertRaises(HTTPException) as exc:
                await BookingOperations(self.db).review("booking-1", "wait-1", body, "admin-1")
            self.assertEqual(exc.exception.status_code, 409)
            self.booking["waiting"]["review"] = None
            self.bookings.update_one.return_value.matched_count = 0
            with self.assertRaises(HTTPException):
                await BookingOperations(self.db).review("booking-1", "wait-1", body, "admin-1")
            self.assertEqual(len(self.db.charge_drafts.docs["booking-1"]["lines"]), 1)

    async def test_review_guards_pending_stale_or_invalid_decisions_never_add_fees(self):
        self.booking["waiting"] = waiting()

        async def transaction(database, callback, **kwargs):
            return await callback(object())

        with patch("booking_operations.billing_transaction", transaction):
            cases = (
                ("wait-1", OperationReview(decision="approve", line=LINE), 409),
                ("old-operation", OperationReview(decision="reject"), 409),
            )
            for operation_id, body, code in cases:
                with self.assertRaises(HTTPException) as exc:
                    await BookingOperations(self.db).review("booking-1", operation_id, body, "admin")
                self.assertEqual(exc.exception.status_code, code)
            self.booking["waiting"] = None
            self.booking["route_change"] = {"id": "route-1", "review": None}
            for body in (OperationReview(decision="approve"), OperationReview(decision="reject", line=LINE)):
                with self.assertRaises(HTTPException) as exc:
                    await BookingOperations(self.db).review("booking-1", "route-1", body, "admin")
                self.assertEqual(exc.exception.status_code, 422)
            await BookingOperations(self.db).review("booking-1", "route-1", OperationReview(decision="reject"), "admin")
        self.assertFalse(self.db.charge_drafts.docs)

    async def test_review_without_transactions_never_writes_a_partial_draft_or_decision(self):
        with patch("supplementary_billing.billing_capabilities", AsyncMock(return_value={
            "transactions": "unavailable", "enabled": False, "reason": "Replica set requis",
        })):
            with self.assertRaises(HTTPException) as exc:
                await BookingOperations(self.db).review("booking-1", "wait-1", OperationReview(decision="approve", line=LINE), "admin")
        self.assertEqual(exc.exception.status_code, 503)
        self.assertFalse(self.db.charge_drafts.docs)
        self.bookings.update_one.assert_not_awaited()


class TestDispositionPricing(unittest.IsolatedAsyncioTestCase):
    class Cursor:
        def __init__(self, docs):
            self.docs = docs
        def sort(self, *args):
            return self
        async def to_list(self, limit):
            return deepcopy(self.docs)[:limit]

    async def test_distance_and_hourly_package_both_feed_disposition_estimate(self):
        database = SimpleNamespace(
            vehicle_categories=SimpleNamespace(find=lambda *args: self.Cursor([{
                "id": "berline", "name": "Berline", "description": "Test",
                "price_per_km": 2.5, "min_fare": 40, "is_active": True, "order": 1,
            }])),
            disposition_rates=SimpleNamespace(find=lambda *args: self.Cursor([{
                "vehicle_category_name": "Berline", "duration_hours": 5,
                "price": 35, "is_active": True,
            }])),
        )
        with patch.object(server, "db", database), patch.object(server, "ensure_default_vehicle_categories", AsyncMock()):
            estimates = await server.estimate_price(distance_km=28.5, duration_minutes=36,
                                                     transfer_type="disposition", disposition_hours=5)
        self.assertEqual(len(estimates), 1)
        self.assertEqual(estimates[0].distance_km, 28.5)
        self.assertEqual(estimates[0].pricing_basis, "hourly")
        self.assertEqual(estimates[0].final_price, 175)
        self.assertIn("28.5 km", estimates[0].rate_label)

    async def test_missing_disposition_package_falls_back_to_distance_and_minimum(self):
        database = SimpleNamespace(
            vehicle_categories=SimpleNamespace(find=lambda *args: self.Cursor([{
                "id": "berline", "name": "Berline", "description": "Test",
                "price_per_km": 2.5, "min_fare": 40, "is_active": True, "order": 1,
            }])),
            disposition_rates=SimpleNamespace(find=lambda *args: self.Cursor([])),
        )
        with patch.object(server, "db", database), patch.object(server, "ensure_default_vehicle_categories", AsyncMock()):
            estimates = await server.estimate_price(distance_km=28.5, duration_minutes=36,
                                                     transfer_type="disposition", disposition_hours=5)
        self.assertEqual(estimates[0].final_price, 71.25)
        self.assertIn("distance estimée", estimates[0].rate_label)


class TestOperationsAuthorization(unittest.TestCase):
    def test_api_only_assigned_driver_can_arrive_and_only_admin_can_manage_pricing(self):
        booking = {"id": "b", "driver_id": "driver-1", "client_id": "client-1", "status": "ASSIGNED"}
        database = SimpleNamespace(bookings=SimpleNamespace(find_one=AsyncMock(return_value=booking)))
        user = AsyncMock()
        with patch.object(server, "db", database), patch.object(server, "get_current_user", user), \
                patch.object(server.BookingOperations, "arrive", AsyncMock(return_value={"id": "wait-1"})) as arrive:
            client = TestClient(server.app)
            for role, identity, status in (("client", "client-1", 403), ("driver", "other", 403),
                                           ("admin", "admin-1", 403), ("driver", "driver-1", 200)):
                user.return_value = {"id": identity, "role": role}
                self.assertEqual(client.post("/api/bookings/b/arrive").status_code, status)
                if role != "admin":
                    self.assertEqual(client.get("/api/admin/waiting-rules").status_code, 403)
                    self.assertEqual(client.put("/api/admin/waiting-rules", json={}).status_code, 403)
                    self.assertEqual(client.post("/api/admin/bookings/b/operations/w/review", json={"decision": "reject"}).status_code, 403)
            arrive.assert_awaited_once()
