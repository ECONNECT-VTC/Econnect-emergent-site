import base64
import os
import sys
import unittest
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import email_service
import server
from legal_documents import DraftUpdate, KINDS, LegalDocuments, PublishRequest, seed_draft
from tests.legal_document_fakes import legal_database
from tests.test_booking_terms import BOOKING
from tests.test_invoice_email import _make_brevo_sdk


CONTENT = {
    "title": "Texte juridique validé",
    "sections": [{"heading": "Conditions", "paragraphs": ["Un texte relu et complet."]}],
    "review_confirmed": True,
}


class TestLegalDocumentsAPI(unittest.TestCase):
    def setUp(self):
        self.db = legal_database()
        self.auth = AsyncMock(return_value={"id": "admin-1", "role": "admin"})
        for context in (
            patch.object(server, "db", self.db),
            patch.object(server, "get_current_user", self.auth),
            patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": ""}),
        ):
            context.start()
            self.addCleanup(context.stop)
        self.client = TestClient(server.app)

    def save(self, kind="terms", revision=0, **changes):
        return self.client.put(
            f"/api/admin/legal-documents/{kind}/draft",
            json={"revision": revision, **CONTENT, **changes},
        )

    def publish(self, kind="terms", revision=1):
        return self.client.post(
            f"/api/admin/legal-documents/{kind}/publish", json={"revision": revision},
        )

    def test_seed_drafts_created_once_and_never_automatically_published(self):
        response = self.client.get("/api/admin/legal-documents")
        self.assertEqual(response.status_code, 200)
        records = response.json()["documents"]
        self.assertEqual([record["kind"] for record in records], list(KINDS))
        for record in records:
            self.assertEqual(record["revision"], 0)
            self.assertIsNone(record["published_version"])
            self.assertEqual(record["history"], [])
            self.assertFalse(record["draft"]["review_confirmed"])
            self.assertIn("non conseil juridique", record["guidance"])
            self.assertEqual(
                self.client.get(f'/api/legal-documents/{record["kind"]}').status_code, 404,
            )
        self.assertEqual(self.db.legal_document_versions.docs, {})
        self.assertEqual(self.save().status_code, 200)
        reread = self.client.get("/api/admin/legal-documents").json()["documents"][0]
        self.assertEqual(reread["draft"], CONTENT)
        self.assertEqual(reread["revision"], 1)

    def test_seed_content_matches_real_integrations_and_requires_completion(self):
        privacy = str(seed_draft("privacy"))
        for fact in ("HTTPOnly", "JWT", "Stripe", "Brevo", "Photon", "OSRM", "CARTO", "PostHog"):
            self.assertIn(fact, privacy)
        self.assertIn("Aucun dispositif conforme", privacy)
        self.assertIn("aucune suppression automatique", privacy)
        for kind in KINDS:
            draft = seed_draft(kind)
            draft["review_confirmed"] = True
            self.assertEqual(self.save(kind, **draft).status_code, 200)
            self.assertEqual(self.publish(kind).status_code, 422)

    def test_save_overwrites_draft_and_publish_is_explicit_with_opaque_version(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                self.assertEqual(self.save(kind).status_code, 200)
                self.assertEqual(self.client.get(f"/api/legal-documents/{kind}").status_code, 404)
                result = self.publish(kind)
                self.assertEqual(result.status_code, 200, result.text)
                record = result.json()
                self.assertEqual(record["revision"], 2)
                version = record["published_version"]
                self.assertRegex(version, r"^[a-f0-9]{32}$")
                self.assertEqual(record["draft"], CONTENT)
                self.assertEqual(len(record["history"]), 1)
                self.assertEqual(record["history"][0]["published_by"], "admin-1")
                public = self.client.get(f"/api/legal-documents/{kind}").json()
                self.assertEqual(
                    set(public), {"kind", "version", "title", "sections", "published_at"},
                )
                self.assertEqual(public["version"], version)
                private = self.client.get(
                    f"/api/admin/legal-documents/{kind}/versions/{version}",
                )
                self.assertEqual(private.status_code, 200)
                self.assertEqual(private.json()["published_by"], "admin-1")

    def test_no_published_terms_never_enabled_even_with_environment_true(self):
        for flag in ("", "false", "true"):
            with patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": flag}):
                response = self.client.get("/api/booking-terms")
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json()["enabled"])
                self.assertEqual(response.json()["version"], "2026-11-04")
        self.assertEqual(self.db.legal_documents.docs, {})

    def test_current_endpoints_disable_caching_and_legacy_lookup_is_explicit(self):
        self.assertEqual(
            self.client.get("/api/booking-terms").headers["cache-control"], "no-store",
        )
        legacy = self.client.get("/api/legal-documents/terms?version=2026-11-04")
        self.assertEqual(legacy.status_code, 200)
        self.assertEqual(legacy.json()["version"], "2026-11-04")
        self.assertIsNone(legacy.json()["published_at"])
        self.assertTrue(
            self.client.get("/api/legal-documents/terms/2026-11-04/pdf").content.startswith(b"%PDF-"),
        )
        self.assertEqual(
            self.client.get("/api/legal-documents/privacy?version=2026-11-04").status_code, 404,
        )
        unpublished = self.client.get("/api/legal-documents/terms")
        self.assertEqual(unpublished.status_code, 404)
        self.assertEqual(unpublished.headers["cache-control"], "no-store")
        self.save()
        self.publish()
        self.assertEqual(
            self.client.get("/api/legal-documents/terms").headers["cache-control"], "no-store",
        )
        self.assertEqual(
            self.client.get("/api/booking-terms").headers["cache-control"], "no-store",
        )

    def test_live_publication_activation_and_explicit_kill_switch(self):
        self.assertFalse(self.client.get("/api/booking-terms").json()["enabled"])
        self.save()
        version = self.publish().json()["published_version"]
        for flag, enabled in (("", True), ("true", True), ("false", False), (" FALSE ", False)):
            with patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": flag}):
                public = self.client.get("/api/booking-terms").json()
                self.assertEqual(public["enabled"], enabled)
                self.assertEqual(public["version"], version)
                self.assertEqual(public["sections"], CONTENT["sections"])

    def test_placeholder_and_review_gate_and_strict_validation(self):
        for field, value in (
            ("review_confirmed", False),
            ("title", "[À COMPLÉTER : société]"),
            ("title", "TODO"),
            ("sections", [{"heading": "[TODO]", "paragraphs": ["Texte"]}]),
            ("sections", [{"heading": "Détails", "paragraphs": ["[À COMPLÉTER : adresse]"]}]),
            ("sections", [{"heading": "Détails", "paragraphs": ["TBD : coordonnées"]}]),
        ):
            with self.subTest(field=field, value=value):
                revision = self.db.legal_documents.docs.get("terms", {}).get("revision", 0)
                self.assertEqual(self.save(revision=revision, **{field: value}).status_code, 200)
                self.assertEqual(self.publish(revision=revision + 1).status_code, 422)
                self.assertEqual(self.db.legal_document_versions.docs, {})
        revision = self.db.legal_documents.docs["terms"]["revision"]
        # Ordinary prose containing "à compléter" is not a guessed placeholder.
        self.assertEqual(
            self.save(revision=revision, title="Le dossier est à compléter si nécessaire").status_code, 200,
        )
        self.assertEqual(self.publish(revision=revision + 1).status_code, 200)
        for invalid in (
            {"revision": True}, {"revision": "1"}, {"revision": -1},
            {"review_confirmed": "true"}, {"title": " "}, {"title": "x" * 201},
            {"sections": []}, {"sections": [{"heading": "", "paragraphs": ["x"]}]},
            {"sections": [{"heading": "x", "paragraphs": [" "]}]},
            {"sections": [{"heading": "x" * 301, "paragraphs": ["x"]}]},
            {"sections": [{"heading": "x", "paragraphs": ["x" * 12001]}]},
            {"sections": [{"heading": "x", "paragraphs": ["x" * 12000] * 17}]},
            {"published_version": "fabricated"},
        ):
            with self.subTest(invalid=invalid):
                self.assertEqual(self.save(**invalid).status_code, 422)
        self.assertEqual(
            self.client.post("/api/admin/legal-documents/terms/publish", json={"revision": "1"}).status_code,
            422,
        )

    def test_all_admin_routes_enforce_auth_and_admin_role(self):
        requests = (
            ("get", "/api/admin/legal-documents", {}),
            ("put", "/api/admin/legal-documents/terms/draft", {"json": {"revision": 0, **CONTENT}}),
            ("post", "/api/admin/legal-documents/terms/publish", {"json": {"revision": 0}}),
            ("get", "/api/admin/legal-documents/terms/versions/unknown", {}),
        )
        for role, expected in ((None, 401), ("client", 403), ("driver", 403)):
            self.auth.side_effect = HTTPException(status_code=401) if role is None else None
            self.auth.return_value = {"id": "user-1", "role": role}
            for method, url, kwargs in requests:
                with self.subTest(role=role, method=method):
                    self.assertEqual(getattr(self.client, method)(url, **kwargs).status_code, expected)
        self.assertEqual(self.db.legal_documents.docs, {})
        self.assertEqual(self.db.legal_document_versions.docs, {})

    def test_archives_remain_immutable_after_draft_overwrite_and_republication(self):
        self.save()
        first = self.publish().json()
        old_version = first["published_version"]
        archived = deepcopy(self.db.legal_document_versions.docs[f"terms:{old_version}"])
        self.save(revision=2, title="Deuxième version")
        self.assertEqual(self.client.get("/api/legal-documents/terms").json()["version"], old_version)
        second = self.publish(revision=3).json()
        self.assertNotEqual(second["published_version"], old_version)
        self.assertEqual(second["revision"], 4)
        self.assertEqual(len(second["history"]), 2)
        old = self.client.get(f"/api/legal-documents/terms?version={old_version}").json()
        self.assertEqual(old["title"], CONTENT["title"])
        self.assertEqual(self.client.get("/api/legal-documents/terms").json()["title"], "Deuxième version")
        self.assertEqual(self.db.legal_document_versions.docs[f"terms:{old_version}"], archived)
        self.assertEqual(
            self.client.put(f"/api/admin/legal-documents/terms/versions/{old_version}", json=CONTENT).status_code,
            405,
        )
        with patch.object(server, "generate_legal_document_pdf", return_value=b"%PDF-archive") as pdf:
            for path in (
                f"/api/legal-documents/terms/{old_version}/pdf",
                f"/api/booking-terms/{old_version}/pdf",
            ):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.content, b"%PDF-archive")
                self.assertEqual(pdf.call_args.args[0]["version"], old_version)
                self.assertEqual(pdf.call_args.args[0]["title"], CONTENT["title"])
        actual = self.client.get(f"/api/legal-documents/terms/{old_version}/pdf")
        self.assertTrue(actual.content.startswith(b"%PDF-"))

    def test_conflicts_are_explicit_and_never_overwrite_a_newer_save_or_publish(self):
        self.save()
        before = deepcopy(self.db.legal_documents.docs["terms"])
        self.assertEqual(self.save(revision=0, title="Lost edit").status_code, 409)
        self.assertEqual(self.publish(revision=0).status_code, 409)
        self.assertEqual(self.db.legal_documents.docs["terms"], before)
        self.assertEqual(self.publish().status_code, 200)
        after = deepcopy(self.db.legal_documents.docs["terms"])
        self.assertEqual(self.publish().status_code, 409)
        self.assertEqual(self.save(revision=1).status_code, 409)
        self.assertEqual(self.db.legal_documents.docs["terms"], after)
        self.assertEqual(len(self.db.legal_document_versions.docs), 1)

    def test_unknown_kind_version_and_orphan_are_not_accessible(self):
        self.save()
        self.publish()
        orphan = "f" * 32
        self.db.legal_document_versions.docs[f"terms:{orphan}"] = {
            "_id": f"terms:{orphan}", "kind": "terms", "version": orphan,
            **CONTENT,
        }
        for path in (
            "/api/legal-documents/not-a-kind",
            "/api/legal-documents/terms?version=unknown",
            f"/api/legal-documents/terms?version={orphan}",
            f"/api/legal-documents/terms/{orphan}/pdf",
            f"/api/booking-terms/{orphan}/pdf",
            f"/api/admin/legal-documents/terms/versions/{orphan}",
            f"/api/admin/legal-documents/privacy/versions/{orphan}",
            "/api/legal-documents/terms/server.py/pdf",
            "/api/legal-documents/terms/..%2Fserver.py/pdf",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.save("bad-kind").status_code, 404)
        self.assertEqual(self.publish("bad-kind").status_code, 404)

    def test_database_errors_and_missing_referenced_snapshot_fail_explicitly(self):
        with patch.object(self.db.legal_documents, "find_one", AsyncMock(side_effect=RuntimeError("DB down"))):
            for path in ("/api/legal-documents/terms", "/api/booking-terms"):
                with self.assertRaisesRegex(RuntimeError, "DB down"):
                    self.client.get(path)
        with patch.object(self.db.legal_documents, "update_one", AsyncMock(side_effect=RuntimeError("DB down"))):
            with self.assertRaisesRegex(RuntimeError, "DB down"):
                self.client.get("/api/admin/legal-documents")
        self.save()
        self.publish()
        self.db.legal_document_versions.docs.clear()
        with self.assertRaisesRegex(RuntimeError, "snapshot is missing"):
            self.client.get("/api/legal-documents/terms")
        self.db.legal_documents.docs["terms"]["history"].clear()
        with self.assertRaisesRegex(RuntimeError, "pointer is not archived"):
            self.client.get("/api/booking-terms")


class TestLegalDocumentsConcurrencyAndConsent(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = legal_database()
        self.service = LegalDocuments(self.db)
        await self.service.save_draft("terms", DraftUpdate(revision=0, **CONTENT))

    async def test_publish_racing_draft_save_leaves_draft_intact_and_orphan_inaccessible(self):
        async def edit_during_insert(_snapshot):
            self.db.legal_document_versions.before_insert = None
            await self.service.save_draft(
                "terms", DraftUpdate(revision=1, **{**CONTENT, "title": "Concurrent edit"}),
            )
        self.db.legal_document_versions.before_insert = edit_during_insert
        with self.assertRaises(HTTPException) as error:
            await self.service.publish("terms", PublishRequest(revision=1), "admin-1")
        self.assertEqual(error.exception.status_code, 409)
        record = await self.service.get_draft("terms")
        self.assertEqual(record["revision"], 2)
        self.assertEqual(record["draft"]["title"], "Concurrent edit")
        self.assertEqual(record["history"], [])
        self.assertIsNone(await self.service.current_terms())
        orphan = next(iter(self.db.legal_document_versions.docs.values()))["version"]
        for admin in (False, True):
            with self.assertRaises(HTTPException) as error:
                await self.service.get_published("terms", orphan, admin=admin)
            self.assertEqual(error.exception.status_code, 404)
        final = await self.service.publish("terms", PublishRequest(revision=2), "admin-2")
        self.assertEqual(len(final["history"]), 1)
        self.assertEqual((await self.service.get_published("terms"))["title"], "Concurrent edit")

    async def test_competing_draft_save_cannot_lose_winning_edits(self):
        async def edit_before_compare(query, update):
            if "$inc" not in update:
                return
            self.db.legal_documents.before_update = None
            await self.service.save_draft(
                "terms", DraftUpdate(revision=1, **{**CONTENT, "title": "Winning edit"}),
            )
        self.db.legal_documents.before_update = edit_before_compare
        with self.assertRaises(HTTPException) as error:
            await self.service.save_draft(
                "terms", DraftUpdate(revision=1, **{**CONTENT, "title": "Lost edit"}),
            )
        self.assertEqual(error.exception.status_code, 409)
        record = await self.service.get_draft("terms")
        self.assertEqual(record["draft"]["title"], "Winning edit")
        self.assertEqual(record["revision"], 2)

    async def test_competing_publish_cannot_replace_winner(self):
        async def publish_during_insert(_snapshot):
            self.db.legal_document_versions.before_insert = None
            await self.service.publish("terms", PublishRequest(revision=1), "winner")
        self.db.legal_document_versions.before_insert = publish_during_insert
        with self.assertRaises(HTTPException) as error:
            await self.service.publish("terms", PublishRequest(revision=1), "loser")
        self.assertEqual(error.exception.status_code, 409)
        record = await self.service.get_draft("terms")
        self.assertEqual(record["revision"], 2)
        self.assertEqual(len(record["history"]), 1)
        self.assertEqual(record["history"][0]["published_by"], "winner")
        self.assertEqual(len(self.db.legal_document_versions.docs), 2)
        self.assertEqual((await self.service.get_published("terms", admin=True))["published_by"], "winner")

    async def test_concurrent_initialization_preserves_existing_draft(self):
        self.db.legal_documents.docs.clear()
        initial = await self.service.get_draft("terms")
        with patch.object(
            self.db.legal_documents, "update_one", AsyncMock(side_effect=DuplicateKeyError("racing upsert")),
        ):
            same = await self.service.get_draft("terms")
        self.assertEqual(initial, same)

    async def test_insert_failure_does_not_change_live_document(self):
        before = deepcopy(self.db.legal_documents.docs["terms"])
        with patch.object(
            self.db.legal_document_versions, "insert_one", AsyncMock(side_effect=RuntimeError("DB insert failed")),
        ):
            with self.assertRaisesRegex(RuntimeError, "DB insert failed"):
                await self.service.publish("terms", PublishRequest(revision=1), "admin")
        self.assertEqual(self.db.legal_documents.docs["terms"], before)

    async def test_saved_consent_uses_server_clock_and_is_not_rewritten_after_publish(self):
        first = await self.service.publish("terms", PublishRequest(revision=1), "admin")
        version = first["published_version"]
        with patch.object(server, "db", self.db), patch.dict(os.environ, {"BOOKING_TERMS_ENABLED": ""}):
            before = datetime.now(timezone.utc)
            booking = server.BookingCreate(
                **BOOKING, terms_accepted=True, terms_version=version,
                terms_accepted_at="1900-01-01T00:00:00Z",
            )
            accepted = await server._record_booking_terms_consent(booking)
            self.assertEqual(accepted["terms_version"], version)
            self.assertGreaterEqual(accepted["terms_accepted_at"], before)
            self.assertEqual(accepted["terms_accepted_at"].tzinfo, timezone.utc)
            await self.service.save_draft(
                "terms", DraftUpdate(revision=2, **{**CONTENT, "title": "New terms"}),
            )
            await self.service.publish("terms", PublishRequest(revision=3), "admin")
            for consent in ({}, {"terms_accepted": False, "terms_version": version},
                            {"terms_accepted": True, "terms_version": version}):
                with self.assertRaises(HTTPException) as error:
                    await server._record_booking_terms_consent(server.BookingCreate(**BOOKING, **consent))
                self.assertEqual(error.exception.status_code, 422)
            self.assertEqual(accepted["terms_version"], version)
            self.assertEqual((await self.service.get_published("terms", version))["title"], CONTENT["title"])

    async def test_brevo_confirmation_uses_accepted_archive_not_current_or_draft(self):
        first = await self.service.publish("terms", PublishRequest(revision=1), "admin")
        version = first["published_version"]
        await self.service.save_draft(
            "terms", DraftUpdate(revision=2, **{**CONTENT, "title": "Replacement"}),
        )
        await self.service.publish("terms", PublishRequest(revision=3), "admin")
        booking = {
            "id": "abcdef123", "client_email": "client@example.com", **BOOKING,
            "terms_accepted": True, "terms_version": version,
            "terms_accepted_at": datetime.now(timezone.utc), "paid_amount": 100,
        }
        for template in ("", "123"):
            payloads = []
            with patch.object(server, "db", self.db), \
                    patch.dict(os.environ, {
                        "BREVO_API_KEY": "test-key", "BREVO_TEMPLATE_PAYMENT_CONFIRMED": template,
                        "BACKEND_URL": "https://api.example.com", "BOOKING_TERMS_ENABLED": "false",
                    }), \
                    patch.object(server, "get_commission_settings", AsyncMock(return_value={})), \
                    patch.object(server, "generate_and_store_document", AsyncMock(return_value=(b"%PDF-quote", {}))), \
                    patch.object(server, "generate_legal_document_pdf", return_value=b"%PDF-original") as pdf, \
                    patch.object(email_service, "sib_api_v3_sdk", _make_brevo_sdk(payloads)), \
                    patch.object(email_service.asyncio, "to_thread", side_effect=lambda fn: fn()):
                await server.send_booking_confirmation_to_client(booking)
            self.assertEqual(pdf.call_args.args[0]["version"], version)
            self.assertEqual(pdf.call_args.args[0]["title"], CONTENT["title"])
            sent = payloads[0]
            self.assertEqual(sent["attachment"][1]["name"], f"cgv-{version}.pdf")
            self.assertEqual(base64.b64decode(sent["attachment"][1]["content"]), b"%PDF-original")
            if template:
                self.assertEqual(sent["params"]["CGV_VERSION"], version)
                self.assertIn(version, sent["params"]["CGV_URL"])
            else:
                self.assertIn(version, sent["html_content"])
        del self.db.legal_document_versions.docs[f"terms:{version}"]
        with patch.object(server, "db", self.db), \
                patch.object(server, "send_notification_email", AsyncMock()) as send:
            with self.assertRaisesRegex(RuntimeError, "snapshot is missing"):
                await server.send_booking_confirmation_to_client(booking)
            send.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
