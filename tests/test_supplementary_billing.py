import asyncio
import os
import unittest
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import OperationFailure

from tests.test_charge_drafts import LINE
from charge_drafts import ChargeDrafts, ChargeDraftUpdate
from supplementary_billing import billing_capabilities, issue_supplementary_invoice
from supplementary_ledger import SupplementaryLedger


class TestBillingCapabilities(unittest.IsolatedAsyncioTestCase):
    async def test_checks_actual_topology_without_returning_names_or_addresses(self):
        for hello, expected in (
            ({"setName": "private-cluster", "maxWireVersion": 21, "logicalSessionTimeoutMinutes": 30}, "available"),
            ({"msg": "isdbgrid", "maxWireVersion": 8, "logicalSessionTimeoutMinutes": 30}, "available"),
            ({"maxWireVersion": 21, "logicalSessionTimeoutMinutes": 30}, "unsupported"),
            ({"setName": "private-cluster", "maxWireVersion": 6, "logicalSessionTimeoutMinutes": 30}, "unsupported"),
            ({"setName": "private-cluster", "maxWireVersion": 21}, "unsupported"),
        ):
            database = SimpleNamespace(command=AsyncMock(return_value=hello))
            with self.subTest(hello=hello), patch.dict(os.environ, {"SUPPLEMENTARY_INVOICES_ENABLED": "true"}):
                result = await billing_capabilities(database)
            self.assertEqual(result["transactions"], expected)
            self.assertEqual(result["issuance_available"], expected == "available")
            self.assertNotIn("private-cluster", str(result))
            database.command.assert_awaited_once_with("hello")

    async def test_disabled_by_default_even_on_replica_set(self):
        database = SimpleNamespace(command=AsyncMock(return_value={
            "setName": "test", "maxWireVersion": 21, "logicalSessionTimeoutMinutes": 30,
        }))
        with patch.dict(os.environ, {"SUPPLEMENTARY_INVOICES_ENABLED": ""}):
            self.assertFalse((await billing_capabilities(database))["issuance_available"])
            with self.assertRaises(HTTPException) as error:
                await issue_supplementary_invoice(database, "booking")
        self.assertEqual(error.exception.status_code, 503)

    async def test_failure_is_explicit_and_never_logs_driver_connection_details(self):
        for failure in (OperationFailure("connection detail not to log", code=13), asyncio.TimeoutError()):
            database = SimpleNamespace(command=AsyncMock(side_effect=failure))
            with self.subTest(failure=type(failure)), self.assertLogs("supplementary_billing", "WARNING") as logs:
                result = await billing_capabilities(database)
            self.assertEqual(result["transactions"], "unverified")
            self.assertFalse(result["issuance_available"])
            self.assertNotIn("connection detail", str(logs.output))

    async def test_transaction_errors_are_not_replaced_with_nontransactional_writes(self):
        database = SimpleNamespace(
            command=AsyncMock(return_value={
                "setName": "test", "maxWireVersion": 21, "logicalSessionTimeoutMinutes": 30,
            }),
            client=SimpleNamespace(start_session=AsyncMock(side_effect=OperationFailure("private connection", code=20))),
        )
        with patch.dict(os.environ, {"SUPPLEMENTARY_INVOICES_ENABLED": "true"}):
            with self.assertLogs("supplementary_billing", "ERROR") as logs, self.assertRaises(HTTPException) as error:
                await issue_supplementary_invoice(database, "booking")
        self.assertEqual(error.exception.status_code, 503)
        self.assertIn("même identifiant", error.exception.detail)
        self.assertNotIn("private connection", str(logs.output))
        self.assertNotIn("private connection", error.exception.detail)


@unittest.skipUnless(os.getenv("MONGO_TEST_URL"), "Requires an isolated MongoDB replica set")
class TestTransactionalBilling(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncIOMotorClient(os.environ["MONGO_TEST_URL"], serverSelectionTimeoutMS=5000)
        self.database = self.client[f"econnect_billing_test_{uuid.uuid4().hex}"]
        self.addAsyncCleanup(self.cleanup_database)
        self.environment = patch.dict(os.environ, {"SUPPLEMENTARY_INVOICES_ENABLED": "true"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        await self.database.counters.insert_one({"_id": "invoice_seq", "seq": 1})
        await self.database.invoices.insert_one({
            "booking_id": "booking", "type": "invoice", "invoice_number": "000001", "pdf_snapshot": b"%PDF-original",
        })
        await ChargeDrafts(self.database.charge_drafts).save(
            "booking", ChargeDraftUpdate(revision=0, lines=[LINE]), "admin",
        )
        self.args = {
            "revision": 1, "request_id": str(uuid.uuid4()),
            "issuer": {"name": "Econnect", "address": "Paris", "siret": "123", "vat_number": "FR123"},
            "client": {"name": "Client", "address": "Lyon"}, "due_date": "2026-12-13",
            "actor_id": "admin", "commission_rate": Decimal("0.1"), "driver_id": "driver",
            "fulfilled_by_admin": False, "booking_reference": "BOOKIN",
        }

    async def cleanup_database(self):
        try:
            await self.client.drop_database(self.database.name)
        finally:
            self.client.close()

    async def test_real_transaction_commits_number_pdf_and_lines_once_on_concurrent_retry(self):
        first, retry = await asyncio.gather(*[
            issue_supplementary_invoice(self.database, "booking", **self.args) for _ in range(2)
        ])
        self.assertEqual(first["id"], retry["id"])
        self.assertEqual(first["invoice_number"], "000002")
        document = await self.database.charge_drafts.find_one({"_id": "booking"})
        self.assertEqual(len(document["issued"]), 1)
        self.assertEqual(document["lines"], [])
        self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], 2)
        ledger = SupplementaryLedger(self.database.charge_drafts)
        pdf = await ledger.get_pdf("booking", first["id"])
        self.assertTrue(pdf.startswith(b"%PDF-"))
        await ledger.record_payment(
            "booking", first["id"], revision=2, request_id=str(uuid.uuid4()), amount_cents=700, actor_id="admin",
        )
        self.assertEqual(await ledger.get_pdf("booking", first["id"]), pdf)
        original = await self.database.invoices.find_one({"booking_id": "booking"})
        self.assertEqual(original["pdf_snapshot"], b"%PDF-original")
        self.assertEqual((await issue_supplementary_invoice(self.database, "booking", **self.args))["paid_cents"], 700)

    async def test_failed_pdf_rolls_back_number_and_keeps_draft(self):
        with patch("supplementary_ledger.generate_supplementary_invoice_pdf", side_effect=RuntimeError("test PDF failure")):
            with self.assertRaisesRegex(RuntimeError, "test PDF failure"):
                await issue_supplementary_invoice(self.database, "booking", **self.args)
        self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], 1)
        draft = await ChargeDrafts(self.database.charge_drafts).get("booking")
        self.assertEqual(draft["revision"], 1)
        self.assertEqual(draft["lines"][0]["description"], "Attente")
        self.assertEqual(await SupplementaryLedger(self.database.charge_drafts).list_issued("booking"), [])

    async def test_two_distinct_requests_publish_only_one_invoice_without_number_gap(self):
        outcomes = await asyncio.gather(
            issue_supplementary_invoice(self.database, "booking", **self.args),
            issue_supplementary_invoice(self.database, "booking", **{**self.args, "request_id": str(uuid.uuid4())}),
            return_exceptions=True,
        )
        self.assertEqual(sum(isinstance(outcome, dict) for outcome in outcomes), 1)
        failures = [outcome for outcome in outcomes if isinstance(outcome, Exception)]
        self.assertEqual(len(failures), 1)
        self.assertIsInstance(failures[0], HTTPException)
        self.assertEqual(failures[0].status_code, 409)
        self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], 2)

    async def test_missing_original_is_rejected_without_allocating_number(self):
        await self.database.invoices.delete_one({"booking_id": "booking"})
        with self.assertRaises(HTTPException) as error:
            await issue_supplementary_invoice(self.database, "booking", **self.args)
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], 1)

    async def test_missing_counter_is_not_recreated_over_existing_invoices(self):
        await self.database.counters.delete_one({"_id": "invoice_seq"})
        with self.assertRaises(HTTPException) as error:
            await issue_supplementary_invoice(self.database, "booking", **self.args)
        self.assertEqual(error.exception.status_code, 409)
        self.assertIsNone(await self.database.counters.find_one({"_id": "invoice_seq"}))
        self.assertEqual(await SupplementaryLedger(self.database.charge_drafts).list_issued("booking"), [])

    async def test_number_limit_rolls_back_increment(self):
        await self.database.counters.update_one({"_id": "invoice_seq"}, {"$set": {"seq": 999999}})
        with self.assertRaises(HTTPException) as error:
            await issue_supplementary_invoice(self.database, "booking", **self.args)
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual((await self.database.counters.find_one({"_id": "invoice_seq"}))["seq"], 999999)

    async def test_concurrent_manual_payment_retries_record_only_one_receipt(self):
        issued = await issue_supplementary_invoice(self.database, "booking", **self.args)
        ledger = SupplementaryLedger(self.database.charge_drafts)
        payment = {"revision": 2, "request_id": str(uuid.uuid4()), "amount_cents": 701, "actor_id": "admin"}
        outcomes = await asyncio.gather(*[
            ledger.record_payment("booking", issued["id"], **payment) for _ in range(2)
        ])
        self.assertEqual([outcome["paid_cents"] for outcome in outcomes], [701, 701])
        state = await ledger.state("booking")
        self.assertEqual(state["revision"], 3)
        self.assertEqual(len(state["invoices"][0]["payments"]), 1)


@unittest.skipUnless(os.getenv("MONGO_STANDALONE_TEST_URL"), "Requires an isolated standalone MongoDB")
class TestStandaloneBilling(unittest.IsolatedAsyncioTestCase):
    async def test_real_standalone_is_detected_and_never_used_for_issuance(self):
        client = AsyncIOMotorClient(os.environ["MONGO_STANDALONE_TEST_URL"], serverSelectionTimeoutMS=5000)
        database = client[f"econnect_billing_test_{uuid.uuid4().hex}"]
        try:
            with patch.dict(os.environ, {"SUPPLEMENTARY_INVOICES_ENABLED": "true"}):
                result = await billing_capabilities(database)
                self.assertEqual(result["transactions"], "unsupported")
                with self.assertRaises(HTTPException) as error:
                    await issue_supplementary_invoice(database, "booking")
                self.assertEqual(error.exception.status_code, 503)
            self.assertEqual(await database.list_collection_names(), [])
        finally:
            client.close()


if __name__ == "__main__":
    unittest.main()
