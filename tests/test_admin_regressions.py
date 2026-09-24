import os
import sys
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, backend_dir)

import server  # noqa: E402


class _Cursor:
    def __init__(self, documents):
        self.documents = [dict(document) for document in documents]

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, _limit):
        return [dict(document) for document in self.documents]


class _VehicleCategoriesCollection:
    def __init__(self, documents=None):
        self.documents = [dict(document) for document in (documents or [])]
        self.inserted_documents = []

    async def count_documents(self, _query):
        return len(self.documents)

    async def insert_many(self, documents):
        docs = [dict(document) for document in documents]
        self.inserted_documents.extend(docs)
        self.documents.extend(docs)

    def find(self, *_args, **_kwargs):
        return _Cursor(self.documents)

    async def update_one(self, query, update):
        category_id = query.get("id")
        for document in self.documents:
            if document.get("id") == category_id:
                document.update(update.get("$set", {}))
                break


class TestAdminRegressions(unittest.IsolatedAsyncioTestCase):
    def test_normalize_driver_document_accepts_historical_shape(self):
        normalized = server.normalize_driver_document({
            "id": "driver-1",
            "email": "driver@example.com",
            "name": "Driver Test",
            "role": "Driver",
            "plate": "AA-123-BB",
            "vehicle": "Tesla Model Y",
            "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        })

        self.assertIsNotNone(normalized)
        self.assertEqual(normalized.role, "driver")
        self.assertEqual(normalized.vehicle_plate, "AA-123-BB")
        self.assertEqual(normalized.vehicle_model, "Tesla Model Y")
        self.assertEqual(normalized.phone, "")

    async def test_get_all_drivers_skips_malformed_documents_without_failing(self):
        users = SimpleNamespace(
            find=lambda *_args, **_kwargs: _Cursor([
                {
                    "id": "driver-1",
                    "email": "driver@example.com",
                    "name": "Driver Test",
                    "role": "DRIVER",
                    "phone": "0600000000",
                    "vehicle_model": "Mercedes Classe E",
                    "vehicle_plate": "AA-123-BB",
                    "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
                },
                {
                    "id": "broken-1",
                    "role": "driver",
                },
            ])
        )

        with patch.object(server, "db", SimpleNamespace(users=users)), \
             patch.object(server, "require_admin", AsyncMock(return_value={"id": "admin-1"})):
            drivers = await server.get_all_drivers(request=object())

        self.assertEqual(len(drivers), 1)
        self.assertEqual(drivers[0].id, "driver-1")

    async def test_ensure_default_vehicle_categories_seeds_missing_collection(self):
        collection = _VehicleCategoriesCollection()

        with patch.object(server, "db", SimpleNamespace(vehicle_categories=collection)):
            await server.ensure_default_vehicle_categories()

        self.assertEqual(len(collection.inserted_documents), 4)
        self.assertEqual(
            sorted(document["name"] for document in collection.inserted_documents),
            ["Berline", "Green", "Luxe", "Van"],
        )

    async def test_ensure_default_vehicle_categories_backfills_metadata_only(self):
        collection = _VehicleCategoriesCollection([
            {
                "id": "green-1",
                "name": "Green",
                "price_per_km": 9.9,
                "min_fare": 120.0,
                "has_wifi": True,
                "max_passengers": 4,
                "max_luggage": 3,
            }
        ])

        with patch.object(server, "db", SimpleNamespace(vehicle_categories=collection)):
            await server.ensure_default_vehicle_categories()

        self.assertEqual(collection.documents[0]["price_per_km"], 9.9)
        self.assertEqual(collection.documents[0]["min_fare"], 120.0)
        self.assertEqual(collection.documents[0]["max_luggage"], 2)


if __name__ == "__main__":
    unittest.main()
