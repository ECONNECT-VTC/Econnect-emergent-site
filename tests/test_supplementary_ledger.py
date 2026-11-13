import sys
import unittest
import uuid
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from charge_drafts import ChargeDrafts, ChargeDraftUpdate
from supplementary_ledger import SupplementaryLedger
from tests.test_charge_drafts import LINE, MemoryCollection


class TestSupplementaryLedger(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.collection = MemoryCollection()
        self.ledger = SupplementaryLedger(self.collection)
        await ChargeDrafts(self.collection).save("booking-1", ChargeDraftUpdate(revision=0, lines=[LINE]), "admin")
        self.allocate = AsyncMock(return_value="000002")
        self.request_id = str(uuid.uuid4())
        self.args = {
            "revision": 1, "request_id": self.request_id, "original_number": "000001",
            "issuer": {"name": "Econnect", "address": "Paris", "siret": "123", "vat_number": "FR123"},
            "client": {"name": "Client", "address": "Lyon"}, "due_date": "13/12/2026",
            "actor_id": "admin", "commission_rate": Decimal("0.1"), "driver_id": "driver-1",
            "fulfilled_by_admin": False, "allocate_number": self.allocate, "booking_reference": "BOOKIN",
        }

    async def test_issue_is_idempotent_and_archives_original_pdf(self):
        issued = await self.ledger.issue("booking-1", **self.args)
        self.assertEqual((issued["amount_ttc_cents"], issued["commission_cents"], issued["driver_cents"]), (2000, 200, 1800))
        pdf = await self.ledger.get_pdf("booking-1", issued["id"])
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertNotIn("pdf_snapshot", issued)
        self.assertNotIn("issued", await ChargeDrafts(self.collection).get("booking-1"))
        self.assertNotIn("pdf_snapshot", (await self.ledger.list_issued("booking-1"))[0])
        self.assertEqual(await self.ledger.issue("booking-1", **self.args), issued)
        self.allocate.assert_awaited_once()
        await ChargeDrafts(self.collection).save(
            "booking-1", ChargeDraftUpdate(revision=2, lines=[{**LINE, "description": "Autre"}]), "admin",
        )
        self.assertEqual(await self.ledger.get_pdf("booking-1", issued["id"]), pdf)
        self.assertEqual((await self.ledger.list_issued("booking-1"))[0]["lines"][0]["description"], "Attente")

    async def test_manual_payments_are_bounded_idempotent_and_do_not_change_invoice_pdf(self):
        issued = await self.ledger.issue("booking-1", **self.args)
        pdf = await self.ledger.get_pdf("booking-1", issued["id"])
        payment_id = str(uuid.uuid4())
        args = {"revision": 2, "request_id": payment_id, "amount_cents": 700, "actor_id": "admin"}
        paid = await self.ledger.record_payment("booking-1", issued["id"], **args)
        self.assertEqual(paid["paid_cents"], 700)
        self.assertEqual(await self.ledger.record_payment("booking-1", issued["id"], **args), paid)
        for bad in (0, -1, 1301):
            with self.subTest(amount=bad), self.assertRaises(HTTPException):
                await self.ledger.record_payment("booking-1", issued["id"], revision=3, request_id=str(uuid.uuid4()), amount_cents=bad, actor_id="admin")
        with self.assertRaises(HTTPException) as error:
            await self.ledger.record_payment("booking-1", issued["id"], **{**args, "amount_cents": 701})
        self.assertEqual(error.exception.status_code, 409)
        paid = await self.ledger.record_payment("booking-1", issued["id"], revision=3, request_id=str(uuid.uuid4()), amount_cents=1300, actor_id="admin")
        self.assertEqual(paid["paid_cents"], 2000)
        self.assertEqual(await self.ledger.get_pdf("booking-1", issued["id"]), pdf)

    async def test_reject_unassigned_and_stale_issue_before_allocating_number(self):
        for changes in ({"driver_id": None}, {"revision": 0}, {"original_number": ""}, {"client": {"name": "Client"}}):
            with self.subTest(changes=changes), self.assertRaises(HTTPException):
                await self.ledger.issue("booking-1", **{**self.args, **changes})
        self.allocate.assert_not_awaited()

    async def test_issuance_racing_an_edit_never_publishes_stale_lines(self):
        original_update = self.collection.update_one
        triggered = False

        async def race(query, update, upsert=False):
            nonlocal triggered
            if "$push" in update and not triggered:
                triggered = True
                await ChargeDrafts(self.collection).save(
                    "booking-1", ChargeDraftUpdate(revision=1, lines=[{**LINE, "description": "Gagnant"}]), "other",
                )
            return await original_update(query, update, upsert=upsert)

        self.collection.update_one = race
        with self.assertRaises(HTTPException) as error:
            await self.ledger.issue("booking-1", **self.args)
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(await self.ledger.list_issued("booking-1"), [])
        self.assertEqual((await ChargeDrafts(self.collection).get("booking-1"))["lines"][0]["description"], "Gagnant")

    async def test_admin_trip_keeps_entire_amount_and_archive_corruption_fails(self):
        issued = await self.ledger.issue("booking-1", **{**self.args, "driver_id": None, "fulfilled_by_admin": True})
        self.assertEqual((issued["commission_cents"], issued["driver_cents"], issued["admin_retained_cents"]), (0, 0, 2000))
        self.collection.docs["booking-1"]["issued"][0]["pdf_snapshot"] = b"invalid"
        with self.assertRaises(RuntimeError):
            await self.ledger.get_pdf("booking-1", issued["id"])


if __name__ == "__main__":
    unittest.main()
