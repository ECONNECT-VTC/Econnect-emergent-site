import os
import sys
import unittest
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import server


LINE = {
    "description": "Attente", "quantity": "2", "unit_price_ttc": "10.00",
    "tax_treatment": "vat", "vat_percent": "20",
}


class MemoryCollection:
    def __init__(self):
        self.docs = {}

    async def find_one(self, query):
        return deepcopy(self.docs.get(query["_id"]))

    async def update_one(self, query, update, upsert=False):
        key = query["_id"]
        if upsert:
            self.docs.setdefault(key, {"_id": key, **deepcopy(update["$setOnInsert"])})
            return SimpleNamespace(matched_count=1)
        document = self.docs.get(key)
        if document is None or document["revision"] != query["revision"]:
            return SimpleNamespace(matched_count=0)
        document.update(deepcopy(update["$set"]))
        document["revision"] += update["$inc"]["revision"]
        return SimpleNamespace(matched_count=1)


class TestChargeDraftAPI(unittest.TestCase):
    def setUp(self):
        self.drafts = MemoryCollection()
        self.bookings = SimpleNamespace(find_one=AsyncMock(return_value={"id": "booking-1"}))
        self.user = AsyncMock(return_value={"id": "admin-1", "role": "admin"})
        for context in (
            patch.object(server, "db", SimpleNamespace(bookings=self.bookings, charge_drafts=self.drafts)),
            patch.object(server, "get_current_user", self.user),
        ):
            context.start()
            self.addCleanup(context.stop)
        self.client = TestClient(server.app)
        self.url = "/api/admin/bookings/booking-1/charge-draft"

    def test_save_reload_and_concurrent_conflict_preserves_winner(self):
        self.assertEqual(self.client.get(self.url).json()["revision"], 0)
        response = self.client.put(self.url, json={"revision": 0, "lines": [LINE]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["updated_by"], "admin-1")
        self.assertEqual(response.json()["lines"][0]["description"], "Attente")
        self.assertEqual(self.client.put(self.url, json={"revision": 0, "lines": []}).status_code, 409)
        self.assertEqual(self.client.get(self.url).json()["lines"][0]["description"], "Attente")
        self.assertEqual(self.client.put(self.url, json={"revision": 1, "lines": []}).status_code, 200)
        self.assertEqual(self.client.get(self.url).json()["lines"], [])

    def test_only_admin_with_existing_booking_can_read_or_write(self):
        for role, status in (("client", 403), ("driver", 403)):
            self.user.return_value = {"id": "other", "role": role}
            self.assertEqual(self.client.get(self.url).status_code, status)
            self.assertEqual(self.client.put(self.url, json={"revision": 0, "lines": [LINE]}).status_code, status)
        self.user.side_effect = HTTPException(401, "Non connecté")
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.user.side_effect = None
        self.user.return_value = {"id": "admin-1", "role": "admin"}
        self.bookings.find_one.return_value = None
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.put(self.url, json={"revision": 0, "lines": [LINE]}).status_code, 404)
        self.assertEqual(self.drafts.docs, {})

    def test_invalid_fees_do_not_change_draft(self):
        invalid = (
            {"revision": True, "lines": []},
            {"revision": 0, "lines": [{**LINE, "quantity": "-1"}]},
            {"revision": 0, "lines": [{**LINE, "tax_treatment": "exempt", "vat_percent": None}]},
            {"revision": 0, "lines": [LINE] * 41},
            {"revision": 0, "lines": [], "issued": True},
        )
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.put(self.url, json=payload).status_code, 422)
        self.assertEqual(self.drafts.docs, {})


if __name__ == "__main__":
    unittest.main()
