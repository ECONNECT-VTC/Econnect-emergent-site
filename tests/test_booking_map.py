import asyncio
import os
import sys
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import ConnectionFailure

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import server
from booking_map import BookingCoordinates, MapService, enforce_map_limits, upstream_url


COORDINATES = {"pickup_lat": 48.85, "pickup_lng": 2.35, "dropoff_lat": 49.01, "dropoff_lng": 2.55}
BOOKING = {
    "pickup_address": "Paris", "dropoff_address": "CDG", "pickup_date": "10/11/2026",
    "pickup_time": "10:30", "transfer_type": "simple", "distance_km": 28.5,
    "duration_minutes": 36, **COORDINATES,
}


class Counters:
    def __init__(self):
        self.docs = {}

    async def find_one_and_update(self, query, update, **kwargs):
        key = query["_id"]
        doc = self.docs.setdefault(key, dict(update["$setOnInsert"], count=0))
        doc["count"] += 1
        return dict(doc)


class TestMapProtection(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.counters = Counters()
        self.db = SimpleNamespace(map_request_limits=self.counters)
        self.now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)

    async def test_exact_ip_threshold_and_new_window(self):
        for _ in range(30):
            await enforce_map_limits(self.db, "test-ip", None, "secret", now=self.now)
        with self.assertRaises(HTTPException) as caught:
            await enforce_map_limits(self.db, "test-ip", None, "secret", now=self.now)
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.headers["Retry-After"], "60")
        await enforce_map_limits(self.db, "test-ip", None, "secret", now=self.now.replace(minute=1))
        self.assertNotIn("test-ip", str(self.counters.docs))

    async def test_account_limit_survives_rotating_ips(self):
        for index in range(30):
            await enforce_map_limits(self.db, f"ip-{index}", "account-1", "secret", now=self.now)
        with self.assertRaises(HTTPException) as caught:
            await enforce_map_limits(self.db, "ip-new", "account-1", "secret", now=self.now)
        self.assertEqual(caught.exception.status_code, 429)

    async def test_global_limit_shared_even_with_different_process_secrets(self):
        for index in range(300):
            await enforce_map_limits(self.db, f"ip-{index}", None, str(index), now=self.now)
        with self.assertRaises(HTTPException) as caught:
            await enforce_map_limits(self.db, "another-ip", None, "another-secret", now=self.now)
        self.assertEqual(caught.exception.status_code, 429)

    async def test_daily_ip_and_global_budgets(self):
        for index in range(1000):
            await enforce_map_limits(self.db, "test-ip", None, "secret", now=self.now.replace(minute=index // 30))
        with self.assertRaises(HTTPException) as caught:
            await enforce_map_limits(self.db, "test-ip", None, "secret", now=self.now.replace(minute=34))
        self.assertEqual(caught.exception.status_code, 429)
        self.counters.docs.clear()
        for index in range(10000):
            await enforce_map_limits(self.db, f"ip-{index}", None, "secret", now=self.now.replace(minute=index // 300))
        with self.assertRaises(HTTPException) as caught:
            await enforce_map_limits(self.db, "last-ip", None, "secret", now=self.now.replace(minute=34))
        self.assertEqual(caught.exception.status_code, 429)

    async def test_account_daily_budget_and_utc_day_reset(self):
        for index in range(1000):
            await enforce_map_limits(self.db, f"ip-{index}", "account-1", "secret", now=self.now.replace(minute=index // 30))
        with self.assertRaises(HTTPException) as caught:
            await enforce_map_limits(self.db, "next-ip", "account-1", "secret", now=self.now.replace(minute=34))
        self.assertEqual(caught.exception.status_code, 429)
        await enforce_map_limits(self.db, "next-ip", "account-1", "secret", now=self.now.replace(day=2))

    async def test_database_failure_is_closed(self):
        self.db.map_request_limits = SimpleNamespace(find_one_and_update=AsyncMock(side_effect=ConnectionFailure()))
        with self.assertRaises(HTTPException) as caught:
            await enforce_map_limits(self.db, "test-ip", None, "secret")
        self.assertEqual(caught.exception.status_code, 503)

    async def test_http_limiter_stops_requests_before_provider(self):
        provider = AsyncMock(return_value={"features": []})
        with patch.object(server, "db", self.db), patch.object(server.map_service, "request", provider):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://test") as client:
                for _ in range(30):
                    response = await client.post("/api/map/search", json={"q": "Paris"})
                    self.assertEqual(response.status_code, 200)
                response = await client.post("/api/map/search", json={"q": "Paris"})
        self.assertEqual(response.status_code, 429)
        self.assertIn("retry-after", response.headers)
        self.assertEqual(provider.await_count, 30)

    async def test_validation_blocks_arbitrary_urls_invalid_coordinates_and_large_bodies(self):
        provider = AsyncMock(return_value={"features": []})
        with patch.object(server, "db", self.db), patch.object(server.map_service, "request", provider):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://test") as client:
                for payload in [
                    {"q": "x"}, {"q": "x" * 201}, {"q": "Paris", "url": "http://127.0.0.1"},
                    {"q": "Paris\n"},
                ]:
                    response = await client.post("/api/map/search", json=payload)
                    # Whitespace is trimmed, but embedded controls are rejected below.
                    if payload["q"] == "Paris\n":
                        self.assertEqual(response.status_code, 200)
                    else:
                        self.assertEqual(response.status_code, 422)
                response = await client.post("/api/map/search", json={"q": "Pa\nris"})
                self.assertEqual(response.status_code, 422)
                response = await client.post("/api/map/reverse", json={"lat": 91, "lng": 2})
                self.assertEqual(response.status_code, 422)
                response = await client.post("/api/map/route", json={
                    "pickup": {"lat": 48, "lng": 2}, "dropoff": {"lat": 49, "lng": 3},
                    "url": "http://127.0.0.1",
                })
                self.assertEqual(response.status_code, 422)
                response = await client.post("/api/map/route", content=b"x" * 4097)
                self.assertEqual(response.status_code, 413)
                response = await client.post("/api/estimate-price", content=b"x" * 4097)
                self.assertEqual(response.status_code, 413)
        self.assertEqual(provider.await_count, 1)

    async def test_fixed_provider_paths_and_coordinate_order(self):
        provider = AsyncMock(return_value={
            "code": "Ok", "routes": [{"distance": 28500, "duration": 2100}],
        })
        with patch.object(server, "db", self.db), patch.object(server.map_service, "request", provider):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://test") as client:
                response = await client.post("/api/map/route", json={
                    "pickup": {"lat": 48.85, "lng": 2.35}, "dropoff": {"lat": 49.01, "lng": 2.55},
                })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(provider.await_args.args[0], "/route/v1/driving/2.35,48.85;2.55,49.01")
        self.assertTrue(provider.await_args.kwargs["routing"])

    async def test_untrusted_origin_is_rejected_before_provider_or_database(self):
        provider = AsyncMock()
        with patch.object(server, "db", self.db), patch.object(server.map_service, "request", provider):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://test") as client:
                response = await client.post("/api/map/search", json={"q": "Paris"}, headers={"Origin": "https://untrusted.example"})
        self.assertEqual(response.status_code, 403)
        provider.assert_not_awaited()
        self.assertFalse(self.counters.docs)

    async def test_estimation_uses_the_same_quota_as_map_calls(self):
        provider = AsyncMock(return_value={"features": []})
        with patch.object(server, "db", self.db), patch.object(server.map_service, "request", provider):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://test") as client:
                for _ in range(30):
                    await client.post("/api/map/search", json={"q": "Paris"})
                response = await client.post("/api/estimate-price?distance_km=20&transfer_type=simple", headers={"Origin": "https://econnect-vtc.com"})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["access-control-allow-origin"], "https://econnect-vtc.com")
        self.assertEqual(response.headers["access-control-allow-credentials"], "true")

    async def test_redirects_and_oversized_provider_responses_are_not_accepted(self):
        for response in (
            httpx.Response(302, headers={"location": "https://untrusted.example"}),
            httpx.Response(200, content=b"x" * 512001),
            httpx.Response(200, content=b"not-json"),
        ):
            client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: response))
            service = MapService()
            with patch("booking_map.httpx.AsyncClient", return_value=client):
                with self.assertRaises(HTTPException) as caught:
                    await service.request("/api/", {"q": "Paris"})
            self.assertIn(caught.exception.status_code, (502, 503))
            self.assertFalse(service.cache)

    async def test_busy_provider_slots_return_429(self):
        service = MapService()
        for _ in range(4):
            await service.slots.acquire()
        with self.assertRaises(HTTPException) as caught:
            await service.request("/api/", {"q": "Paris"})
        self.assertEqual(caught.exception.status_code, 429)

    async def test_cache_is_bounded_and_uses_no_plaintext_addresses_as_keys(self):
        service = MapService()
        fetch = AsyncMock(return_value={"features": []})
        with patch.object(service, "fetch", fetch):
            await service.request("/api/", {"q": "Paris"})
            await service.request("/api/", {"q": "Paris"})
            self.assertEqual(fetch.await_count, 1)
            for index in range(130):
                await service.request("/api/", {"q": f"Paris {index}"})
        self.assertEqual(len(service.cache), 128)
        self.assertNotIn("Paris", str(list(service.cache)))

    async def test_provider_timeout_returns_service_error_and_releases_slot(self):
        service = MapService()
        with patch.object(service, "fetch", AsyncMock(side_effect=asyncio.TimeoutError())):
            with self.assertRaises(HTTPException) as caught:
                await service.request("/api/", {"q": "Paris"})
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(service.slots._value, 4)
        self.assertFalse(service.cache)

    def test_unsafe_config_and_coordinate_values_rejected(self):
        for url in ("http://example.com", "https://user:pass@example.com", "https://example.com?q=test"):
            with patch.dict(os.environ, {"MAP_GEOCODER_URL": url}):
                with self.assertRaises(RuntimeError):
                    upstream_url("MAP_GEOCODER_URL", "https://example.com")
        for payload in ({"pickup_lat": 48}, {"pickup_lat": 100, "pickup_lng": 2},
                        {"distance_km": float("nan")}, {"duration_minutes": -1}):
            with self.assertRaises(ValidationError):
                BookingCoordinates(**payload)


class TestMapBookingPersistence(unittest.IsolatedAsyncioTestCase):
    async def test_client_and_admin_create_save_identical_location_fields(self):
        bookings = SimpleNamespace(insert_one=AsyncMock())
        db = SimpleNamespace(
            bookings=bookings, users=SimpleNamespace(find_one=AsyncMock(return_value={"id": "client-1"})),
        )
        user = {"id": "client-1", "name": "Client", "email": "client@example.com"}
        with patch.object(server, "db", db), \
             patch.object(server, "get_current_user", AsyncMock(return_value=user)), \
             patch.object(server, "require_admin", AsyncMock(return_value={"id": "admin-1"})), \
             patch.object(server, "resolve_vehicle_category_name", AsyncMock(return_value=None)), \
             patch.object(server, "_send_admin_booking_notification", AsyncMock()):
            client = await server.create_booking(server.BookingCreate(**BOOKING), object())
            admin = await server.create_admin_booking(server.AdminBookingCreate(
                **BOOKING, client_name="Client", client_email="client@example.com",
            ), object())
            await asyncio.sleep(0)
        for key in (*COORDINATES, "distance_km", "duration_minutes"):
            self.assertEqual(getattr(client, key), BOOKING[key])
            self.assertEqual(getattr(admin, key), BOOKING[key])
        self.assertEqual(bookings.insert_one.await_count, 2)

    def test_missing_coordinates_block_new_bookings_but_legacy_data_remains_readable(self):
        legacy = {key: value for key, value in BOOKING.items() if key not in COORDINATES}
        booking = server.BookingCreate(**legacy)
        with self.assertRaises(HTTPException) as caught:
            server.require_booking_coordinates(booking)
        self.assertEqual(caught.exception.status_code, 422)

    async def test_client_and_admin_edits_save_coordinates_and_metrics(self):
        original = {"id": "booking-1", "client_id": "client-1", "status": "DRAFT", **BOOKING}
        update = {"pickup_address": "Orly", **COORDINATES, "pickup_lat": 48.72, "distance_km": 50, "duration_minutes": 60}
        bookings = SimpleNamespace(find_one=AsyncMock(return_value=original), update_one=AsyncMock())
        with patch.object(server, "db", SimpleNamespace(bookings=bookings)), \
             patch.object(server, "get_current_user", AsyncMock(return_value={"id": "client-1"})), \
             patch.object(server, "require_admin", AsyncMock(return_value={"id": "admin-1"})):
            await server.update_booking("booking-1", update, object())
            await server.admin_update_booking("booking-1", update, object())
        for call in bookings.update_one.await_args_list:
            self.assertEqual(call.args[1]["$set"], update)

    def test_address_change_cannot_leave_stale_coordinates(self):
        with self.assertRaises(HTTPException) as caught:
            server.validate_booking_location_update(BOOKING, {"pickup_address": "Orly"})
        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(server.validate_booking_location_update(BOOKING, {"notes": "Bagages"}), {"notes": "Bagages"})
        with self.assertRaises(HTTPException):
            server.validate_booking_location_update(BOOKING, {"pickup_lat": 48.72})


if __name__ == "__main__":
    unittest.main()
