import base64
import hashlib
import json
import os
import subprocess
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import booking_terms
import email_service
import server
from tests.test_invoice_email import _make_brevo_sdk
from tests.legal_document_fakes import legal_database, published_database


VERSION = "2026-11-04"
BOOKING = {
    "pickup_address": "Paris", "dropoff_address": "Orly",
    "pickup_lat": 48.85, "pickup_lng": 2.35,
    "dropoff_lat": 48.72, "dropoff_lng": 2.37,
    "pickup_date": "2026-12-01", "pickup_time": "10:00",
    "transfer_type": "simple", "estimated_price": 100,
}


class TestCanonicalBookingTerms(unittest.TestCase):
    def test_asset_is_pinned_and_validated(self):
        source = booking_terms._ASSETS[VERSION].read_bytes()
        self.assertEqual(
            hashlib.sha256(source).hexdigest(),
            "a90a4188648095f69b47626900d747fdaad614643b21b6634ef3229cef69c4a4",
            "Do not edit an existing version; publish a new asset/version instead.",
        )
        document = booking_terms.TermsDocument.model_validate_json(source)
        self.assertEqual(document.version, VERSION)
        self.assertIn("PROJET", document.sections[0].paragraphs[0])
        for invalid in (
            {"version": "bad"}, {"title": ""}, {"sections": []},
            {"extra": "not allowed"}, {"sections": [{"heading": "", "paragraphs": []}]},
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                booking_terms.TermsDocument.model_validate_json(
                    json.dumps({**json.loads(source), **invalid})
                )
        with self.assertRaises(ValidationError):
            document.title = "Changed"
        with self.assertRaises(TypeError):
            booking_terms.TERMS_DOCUMENTS["other"] = document

    def test_auto_mode_requires_publication_and_false_is_kill_switch(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(booking_terms.booking_terms_enabled())
            self.assertTrue(booking_terms.booking_terms_enabled(True))
        with patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": "true"}):
            self.assertFalse(booking_terms.booking_terms_enabled())
            self.assertTrue(booking_terms.booking_terms_enabled(True))
        with patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": "false"}):
            self.assertFalse(booking_terms.booking_terms_enabled(True))

    def test_environment_true_no_longer_requires_static_allowlist_at_startup(self):
        result = subprocess.run(
            [sys.executable, "-c", "import server"],
            cwd=Path(server.__file__).parent,
            env={**os.environ, "BOOKING_TERMS_ENABLED": "true"},
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_public_document_and_pdf_are_canonical_when_disabled(self):
        with patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": "false"}), \
                patch.object(server, "db", legal_database()):
            client = TestClient(server.app)
            response = client.get("/api/booking-terms")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json(),
                {"enabled": False, **booking_terms.TERMS_DOCUMENTS[VERSION].model_dump(mode="json")},
            )
            response = client.get(f"/api/booking-terms/{VERSION}/pdf")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["content-type"], "application/pdf")
            self.assertIn(f'filename="cgv-{VERSION}.pdf"', response.headers["content-disposition"])
            self.assertTrue(response.content.startswith(b"%PDF-"))
            for version in ("2099-01-01", "server.py", "..%2Fserver.py"):
                with self.subTest(version=version):
                    self.assertEqual(client.get(f"/api/booking-terms/{version}/pdf").status_code, 404)

    def test_public_pdf_errors_propagate(self):
        with patch.object(server, "generate_booking_terms_pdf", side_effect=RuntimeError("PDF failed")):
            with self.assertRaisesRegex(RuntimeError, "PDF failed"):
                TestClient(server.app).get(f"/api/booking-terms/{VERSION}/pdf")


class TestBookingConsent(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": "true"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.bookings = SimpleNamespace(insert_one=AsyncMock(), update_one=AsyncMock())
        self.database = patch.object(
            server, "db", published_database(VERSION, bookings=self.bookings),
        )
        self.auth = patch.object(
            server, "get_current_user",
            AsyncMock(return_value={"id": "u1", "name": "Client", "email": "client@example.com"}),
        )
        self.category = patch.object(server, "resolve_vehicle_category_name", AsyncMock(return_value=None))
        self.stripe_config = patch.object(server, "STRIPE_SECRET_KEY", "sk_test")
        self.stripe = patch.object(
            server.stripe.checkout.Session, "create",
            return_value={"id": "cs_test", "url": "https://checkout.stripe.test/session"},
        )
        for context in (self.database, self.auth, self.category, self.stripe_config, self.stripe):
            context.start()
            self.addCleanup(context.stop)

    async def test_enabled_acceptance_persisted_by_both_routes(self):
        before = datetime.now(timezone.utc)
        for route, model in (
            (server.create_booking, server.BookingCreate),
            (server.create_booking_checkout, server.BookingCheckoutCreate),
        ):
            with self.subTest(route=route.__name__):
                payload = model(**BOOKING, terms_accepted=True, terms_version=VERSION,
                                terms_accepted_at="1900-01-01T00:00:00Z")
                result = await route(payload, request=object())
                stored = self.bookings.insert_one.await_args.args[0]
                self.assertIs(stored["terms_accepted"], True)
                self.assertEqual(stored["terms_version"], VERSION)
                self.assertGreaterEqual(stored["terms_accepted_at"], before)
                self.assertLessEqual(stored["terms_accepted_at"], datetime.now(timezone.utc))
                self.assertEqual(stored["terms_accepted_at"].tzinfo, timezone.utc)
                if route is server.create_booking:
                    self.assertEqual(result.terms_accepted_at, stored["terms_accepted_at"])
                    self.assertTrue(result.terms_accepted)

    async def test_public_document_exposes_enabled_for_approved_version(self):
        response = TestClient(server.app).get("/api/booking-terms")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["enabled"])
        self.assertEqual(response.json()["version"], VERSION)

    async def test_missing_false_and_stale_consent_rejected_before_side_effects(self):
        for path in ("/api/bookings", "/api/bookings/checkout"):
            for consent in (
                {}, {"terms_accepted": False, "terms_version": VERSION},
                {"terms_accepted": True},
                {"terms_accepted": True, "terms_version": "2025-01-01"},
            ):
                with self.subTest(path=path, consent=consent):
                    response = TestClient(server.app).post(path, json={**BOOKING, **consent})
                    self.assertEqual(response.status_code, 422)
                    self.assertTrue(all(error["loc"][0] == "body" for error in response.json()["detail"]))
        self.bookings.insert_one.assert_not_awaited()
        server.stripe.checkout.Session.create.assert_not_called()
        server.get_current_user.assert_not_awaited()
        server.resolve_vehicle_category_name.assert_not_awaited()

    async def test_disabled_ignores_even_supplied_consent_both_routes(self):
        with patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": "false"}):
            for route, model in (
                (server.create_booking, server.BookingCreate),
                (server.create_booking_checkout, server.BookingCheckoutCreate),
            ):
                for consent in ({}, {"terms_accepted": True, "terms_version": VERSION}):
                    with self.subTest(route=route.__name__, consent=consent):
                        await route(model(**BOOKING, **consent), request=object())
                        stored = self.bookings.insert_one.await_args.args[0]
                        self.assertEqual(
                            {key: stored[key] for key in ("terms_accepted", "terms_version", "terms_accepted_at")},
                            {"terms_accepted": False, "terms_version": None, "terms_accepted_at": None},
                        )

    async def test_strict_schema_both_routes(self):
        for enabled in ("false", "true"):
            with patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": enabled}):
                for path in ("/api/bookings", "/api/bookings/checkout"):
                    for invalid in (
                        {"terms_accepted": "true"}, {"terms_accepted": 1},
                        {"terms_accepted": None}, {"terms_version": 123},
                        {"terms_version": "x" * 33},
                    ):
                        with self.subTest(path=path, enabled=enabled, invalid=invalid):
                            self.assertEqual(
                                TestClient(server.app).post(path, json={**BOOKING, **invalid}).status_code,
                                422,
                            )
        self.bookings.insert_one.assert_not_awaited()

    async def test_admin_model_does_not_acquire_consent(self):
        admin = server.AdminBookingCreate(
            **BOOKING, client_name="Guest", client_email="guest@example.com",
            terms_accepted=True, terms_version=VERSION,
        )
        self.assertNotIn("terms_accepted", admin.model_dump())
        self.assertNotIn("terms_version", admin.model_dump())


class TestTermsConfirmationEmail(unittest.IsolatedAsyncioTestCase):
    def booking(self, **overrides):
        return {
            "id": "abcdef123", "client_email": "client@example.com",
            "estimated_price": 100, **BOOKING, **overrides,
        }

    async def test_saved_version_attachments_reach_brevo_with_template_and_fallback(self):
        booking = self.booking(
            terms_accepted=True, terms_version=VERSION,
            terms_accepted_at=datetime.now(timezone.utc),
            paid_amount=20,
        )
        for template in ("", "123"):
            payloads = []
            with patch.dict(os.environ, {
                "BOOKING_TERMS_ENABLED": "false", "BREVO_API_KEY": "test-key",
                "BREVO_TEMPLATE_PAYMENT_CONFIRMED": template,
                "BACKEND_URL": "https://api.example.com/",
            }), patch.object(server, "CURRENT_TERMS_VERSION", "2099-01-01"), \
                    patch.object(server, "get_commission_settings", AsyncMock(return_value={})), \
                    patch.object(server, "generate_and_store_document", AsyncMock(return_value=(b"%PDF-quote", {}))), \
                    patch.object(email_service, "sib_api_v3_sdk", _make_brevo_sdk(payloads)), \
                    patch.object(email_service.asyncio, "to_thread", side_effect=lambda fn: fn()):
                await server.send_booking_confirmation_to_client(booking)
            sent = payloads[0]
            self.assertEqual([item["name"] for item in sent["attachment"]],
                             ["devis-ABCDEF.pdf", f"cgv-{VERSION}.pdf"])
            self.assertEqual(base64.b64decode(sent["attachment"][0]["content"]), b"%PDF-quote")
            self.assertTrue(base64.b64decode(sent["attachment"][1]["content"]).startswith(b"%PDF-"))
            url = f"https://api.example.com/api/booking-terms/{VERSION}/pdf"
            if template:
                self.assertEqual(sent["params"]["CGV_VERSION"], VERSION)
                self.assertEqual(sent["params"]["CGV_URL"], url)
                self.assertEqual(sent["params"]["TOTAL_AMOUNT"], "100.00 €")
                self.assertEqual(sent["params"]["PAID_AMOUNT"], "20.00 €")
                self.assertEqual(sent["params"]["AMOUNT"], "20.00 €")
                self.assertEqual(sent["params"]["REMAINING_BALANCE"], "80.00 €")
                self.assertIn("pas automatiquement", sent["params"]["CANCELLATION_SUMMARY"])
            else:
                self.assertIn(VERSION, sent["html_content"])
                self.assertIn(url, sent["html_content"])
                self.assertIn("Montant total : 100.00 €", sent["html_content"])
                self.assertIn("Montant payé : 20.00 €", sent["html_content"])
                self.assertIn("Solde restant : 80.00 €", sent["html_content"])
                self.assertIn("pas automatiquement", sent["html_content"])

    async def test_accepted_recap_zero_missing_and_invalid_amounts(self):
        for total, paid, expected in (
            (100, 0, ("100.00 €", "0.00 €", "100.00 €")),
            (0, 0, ("0.00 €", "0.00 €", "0.00 €")),
            (100, 120, ("100.00 €", "120.00 €", "0.00 €")),
            (100, None, ("100.00 €", "Montant indisponible", "Montant indisponible")),
            (None, 20, ("Montant indisponible", "20.00 €", "Montant indisponible")),
            ("bad", 20, None), (100, float("nan"), None),
            (float("inf"), 20, None), (100, -1, None), (True, 20, None),
        ):
            with self.subTest(total=total, paid=paid), \
                    patch.object(server, "get_commission_settings", AsyncMock(return_value={})), \
                    patch.object(server, "generate_and_store_document", AsyncMock(return_value=(b"%PDF-quote", {}))), \
                    patch.object(server, "send_notification_email", AsyncMock()) as send:
                booking = self.booking(
                    terms_accepted=True, terms_version=VERSION,
                    terms_accepted_at=datetime.now(timezone.utc),
                    estimated_price=total, paid_amount=paid,
                )
                if expected is None:
                    with self.assertRaisesRegex(ValueError, "confirmation amount"):
                        await server.send_booking_confirmation_to_client(booking)
                    send.assert_not_awaited()
                else:
                    await server.send_booking_confirmation_to_client(booking)
                    params = send.await_args.kwargs["template_params"]
                    self.assertEqual(tuple(params[key] for key in (
                        "TOTAL_AMOUNT", "PAID_AMOUNT", "REMAINING_BALANCE",
                    )), expected)
                    self.assertEqual(params["AMOUNT"], expected[1])

    async def test_legacy_and_disabled_bookings_have_no_terms_claim(self):
        for consent in (
            {}, {"terms_accepted": False, "terms_version": VERSION},
            {"terms_version": VERSION, "terms_accepted_at": datetime.now(timezone.utc)},
        ):
            with patch.object(server, "send_notification_email", AsyncMock()) as send, \
                    patch.object(server, "generate_booking_terms_pdf") as pdf:
                await server.send_booking_confirmation_to_client(self.booking(**consent))
            pdf.assert_not_called()
            kwargs = send.await_args.kwargs
            self.assertEqual(kwargs["attachments"], [])
            self.assertNotIn("CGV_VERSION", kwargs["template_params"])
            self.assertNotIn("CGV_URL", kwargs["template_params"])
            for key in ("TOTAL_AMOUNT", "PAID_AMOUNT", "REMAINING_BALANCE", "CANCELLATION_SUMMARY"):
                self.assertNotIn(key, kwargs["template_params"])
            self.assertNotIn("/api/booking-terms/", send.await_args.args[2])

    async def test_pdf_generation_failures_not_swallowed_and_no_email_sent(self):
        booking = self.booking(
            terms_accepted=True, terms_version=VERSION,
            terms_accepted_at=datetime.now(timezone.utc),
        )
        with patch.object(server, "generate_booking_terms_pdf", side_effect=RuntimeError("PDF failed")), \
                patch.object(server, "send_notification_email", AsyncMock()) as send:
            with self.assertRaisesRegex(RuntimeError, "PDF failed"):
                await server.send_booking_confirmation_to_client(booking)
        send.assert_not_awaited()
        with patch.object(server, "get_commission_settings", AsyncMock(return_value={})), \
                patch.object(server, "generate_and_store_document", AsyncMock(side_effect=RuntimeError("Quote failed"))), \
                patch.object(server, "send_notification_email", AsyncMock()) as send:
            with self.assertRaisesRegex(RuntimeError, "Quote failed"):
                await server.send_booking_confirmation_to_client(booking)
        send.assert_not_awaited()

    async def test_incomplete_or_unknown_saved_acceptance_is_not_replaced_by_current(self):
        for overrides in (
            {"terms_version": "2099-01-01", "terms_accepted_at": datetime.now(timezone.utc)},
            {"terms_version": VERSION}, {"terms_accepted_at": datetime.now(timezone.utc)},
        ):
            with self.subTest(overrides=overrides), \
                    patch.object(server, "db", legal_database()), \
                    patch.object(server, "send_notification_email", AsyncMock()) as send:
                with self.assertRaisesRegex(ValueError, "evidence"):
                    await server.send_booking_confirmation_to_client(
                        self.booking(terms_accepted=True, **overrides)
                    )
                send.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
