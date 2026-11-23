import os
import sys
import unittest
from email.message import EmailMessage
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, backend_dir)

import server  # noqa: E402


class TestAdminBookingAlerts(unittest.IsolatedAsyncioTestCase):
    async def test_smtp_alert_uses_configured_recipient(self):
        settings = {"booking_alert_email": "admin@gmail.com"}
        sent = []

        def capture(message, host, port, username, password, use_tls):
            sent.append((message, host, port, username, password, use_tls))

        with (
            patch.object(server, "get_commission_settings", AsyncMock(return_value=settings)),
            patch.object(server.asyncio, "to_thread", side_effect=lambda fn, *args: fn(*args)),
            patch.object(server, "_send_smtp_message", side_effect=capture),
            patch.dict(os.environ, {
                "SMTP_HOST": "smtp.example.com",
                "SMTP_PORT": "587",
                "SMTP_USERNAME": "reservation@example.com",
                "SMTP_PASSWORD": "secret",
                "SMTP_FROM_EMAIL": "reservation@example.com",
                "SMTP_USE_TLS": "true",
            }),
        ):
            result = await server.send_booking_alert_email("Nouvelle course", "<p>Test</p>")

        self.assertTrue(result)
        message, host, port, username, password, use_tls = sent[0]
        self.assertIsInstance(message, EmailMessage)
        self.assertEqual(message["To"], "admin@gmail.com")
        self.assertEqual(message["From"], "reservation@example.com")
        self.assertEqual((host, port, username, password, use_tls), (
            "smtp.example.com", 587, "reservation@example.com", "secret", True
        ))

    async def test_alert_is_skipped_when_smtp_is_not_configured(self):
        with (
            patch.object(server, "get_commission_settings", AsyncMock(return_value={})),
            patch.object(server, "send_notification_email", AsyncMock(return_value=True)) as send_brevo,
            patch.dict(os.environ, {"SMTP_HOST": ""}, clear=False),
        ):
            self.assertFalse(await server.send_booking_alert_email("Sujet", "<p>Test</p>"))
        send_brevo.assert_not_awaited()

    async def test_alert_does_not_fall_back_to_brevo_when_smtp_fails(self):
        with (
            patch.object(server, "get_commission_settings", AsyncMock(return_value={})),
            patch.object(server.asyncio, "to_thread", AsyncMock(side_effect=OSError("SMTP down"))),
            patch.object(server, "send_notification_email", AsyncMock(return_value=True)) as send_brevo,
            patch.dict(os.environ, {"SMTP_HOST": "smtp.example.com", "SMTP_PORT": "587"}, clear=False),
        ):
            self.assertFalse(await server.send_booking_alert_email("Sujet", "<p>Test</p>"))
        send_brevo.assert_not_awaited()

    async def test_driver_cancellation_alert_uses_smtp_transport(self):
        with patch.object(server, "send_admin_booking_alert", AsyncMock(return_value=True)) as send_alert:
            result = await server.send_driver_cancellation_to_admins(
                {"id": "abcdef123456"},
                {"name": "Chauffeur"},
                "Indisponible",
            )

        self.assertEqual(result, 1)
        send_alert.assert_awaited_once_with(
            {"id": "abcdef123456"},
            "driver_cancellation",
            reason="Indisponible",
            actor_name="Chauffeur",
        )


if __name__ == "__main__":
    unittest.main()
