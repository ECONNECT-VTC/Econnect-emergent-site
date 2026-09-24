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

import email_service  # noqa: E402
import server  # noqa: E402


class _FakeConfiguration:
    def __init__(self):
        self.api_key = {}


class _FakeApiClient:
    def __init__(self, _configuration):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeSendSmtpEmail:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _FakeApiException(Exception):
    def __init__(self, status=None, message="error"):
        super().__init__(message)
        self.status = status


def _make_brevo_sdk(sent_payloads, raise_exception=None):
    class _FakeTransactionalEmailsApi:
        def __init__(self, _api_client):
            pass

        def send_transac_email(self, request):
            sent_payloads.append(request.kwargs)
            if raise_exception:
                raise raise_exception
            return SimpleNamespace(message_id="msg-123")

    return SimpleNamespace(
        Configuration=_FakeConfiguration,
        ApiClient=_FakeApiClient,
        TransactionalEmailsApi=_FakeTransactionalEmailsApi,
        SendSmtpEmail=_FakeSendSmtpEmail,
    )


class TestBrevoTransport(unittest.IsolatedAsyncioTestCase):
    async def test_send_notification_email_html_fallback_without_template(self):
        sent_payloads = []
        sdk = _make_brevo_sdk(sent_payloads)
        with patch.dict(
            os.environ,
            {
                "BREVO_API_KEY": "brevo-test-key",
                "BREVO_SENDER_EMAIL": "noreply@test.com",
                "BREVO_SENDER_NAME": "Test Sender",
            },
            clear=False,
        ), patch.object(email_service, "sib_api_v3_sdk", sdk), patch.object(
            email_service.asyncio, "to_thread", side_effect=lambda fn: fn()
        ):
            result = await server.send_notification_email("client@example.com", "Sujet", "<p>HTML fallback</p>")

        self.assertTrue(result)
        self.assertEqual(len(sent_payloads), 1)
        payload = sent_payloads[0]
        self.assertEqual(payload["subject"], "Sujet")
        self.assertEqual(payload["html_content"], "<p>HTML fallback</p>")
        self.assertNotIn("template_id", payload)

    async def test_send_notification_email_uses_template_id_and_dynamic_params(self):
        sent_payloads = []
        sdk = _make_brevo_sdk(sent_payloads)
        with patch.dict(
            os.environ,
            {
                "BREVO_API_KEY": "brevo-test-key",
                "BREVO_TEMPLATE_PAYMENT_CONFIRMED": "2001",
            },
            clear=False,
        ), patch.object(email_service, "sib_api_v3_sdk", sdk), patch.object(
            email_service.asyncio, "to_thread", side_effect=lambda fn: fn()
        ):
            result = await server.send_notification_email(
                "client@example.com",
                "Sujet",
                "<p>HTML fallback</p>",
                template_key=email_service.TEMPLATE_KEY_PAYMENT_CONFIRMED,
                template_params={"CLIENT_NAME": "Client", "BOOKING_ID": "book-1"},
            )

        self.assertTrue(result)
        payload = sent_payloads[0]
        self.assertEqual(payload["template_id"], 2001)
        self.assertEqual(payload["params"]["CLIENT_NAME"], "Client")
        self.assertEqual(payload["params"]["BOOKING_ID"], "book-1")
        self.assertNotIn("html_content", payload)

    async def test_send_notification_email_supports_pdf_attachment(self):
        sent_payloads = []
        sdk = _make_brevo_sdk(sent_payloads)
        with patch.dict(os.environ, {"BREVO_API_KEY": "brevo-test-key"}, clear=False), patch.object(
            email_service, "sib_api_v3_sdk", sdk
        ), patch.object(email_service.asyncio, "to_thread", side_effect=lambda fn: fn()):
            result = await server.send_notification_email(
                "client@example.com",
                "Facture",
                "<p>Facture</p>",
                attachment_bytes=b"%PDF-1.4",
                attachment_filename="facture.pdf",
            )

        self.assertTrue(result)
        attachment = sent_payloads[0]["attachment"][0]
        self.assertEqual(attachment["name"], "facture.pdf")
        self.assertEqual(attachment["content"], "JVBERi0xLjQ=")

    async def test_send_notification_email_without_api_key_returns_false(self):
        with patch.dict(os.environ, {"BREVO_API_KEY": ""}, clear=False):
            result = await server.send_notification_email("client@example.com", "Sujet", "<p>HTML</p>")
        self.assertFalse(result)

    async def test_invalid_template_id_falls_back_to_html(self):
        sent_payloads = []
        sdk = _make_brevo_sdk(sent_payloads)
        with patch.dict(
            os.environ,
            {"BREVO_API_KEY": "brevo-test-key", "BREVO_TEMPLATE_PAYMENT_CONFIRMED": "not_an_int"},
            clear=False,
        ), patch.object(email_service, "sib_api_v3_sdk", sdk), patch.object(
            email_service.asyncio, "to_thread", side_effect=lambda fn: fn()
        ):
            result = await server.send_notification_email(
                "client@example.com",
                "Sujet",
                "<p>Fallback</p>",
                template_key=email_service.TEMPLATE_KEY_PAYMENT_CONFIRMED,
                template_params={"CLIENT_NAME": "Client"},
            )

        self.assertTrue(result)
        payload = sent_payloads[0]
        self.assertEqual(payload["html_content"], "<p>Fallback</p>")
        self.assertNotIn("template_id", payload)

    async def test_missing_template_id_falls_back_to_html(self):
        sent_payloads = []
        sdk = _make_brevo_sdk(sent_payloads)
        with patch.dict(os.environ, {"BREVO_API_KEY": "brevo-test-key"}, clear=False), patch.object(
            email_service, "sib_api_v3_sdk", sdk
        ), patch.object(email_service.asyncio, "to_thread", side_effect=lambda fn: fn()):
            result = await server.send_notification_email(
                "client@example.com",
                "Sujet",
                "<p>Fallback missing template</p>",
                template_key=email_service.TEMPLATE_KEY_PAYMENT_CONFIRMED,
                template_params={"CLIENT_NAME": "Client"},
            )

        self.assertTrue(result)
        payload = sent_payloads[0]
        self.assertEqual(payload["html_content"], "<p>Fallback missing template</p>")
        self.assertNotIn("template_id", payload)

    async def test_brevo_api_exception_is_handled_without_logging_secrets(self):
        sent_payloads = []
        secret_token = "token-secret-123456"
        api_exception = _FakeApiException(status=401, message=f"unauthorized {secret_token}")
        sdk = _make_brevo_sdk(sent_payloads, raise_exception=api_exception)
        with patch.dict(os.environ, {"BREVO_API_KEY": "xkeysib-secret-key"}, clear=False), patch.object(
            email_service, "sib_api_v3_sdk", sdk
        ), patch.object(email_service, "ApiException", _FakeApiException), patch.object(
            email_service.asyncio, "to_thread", side_effect=lambda fn: fn()
        ), self.assertLogs(email_service.logger, level="ERROR") as captured_logs:
            result = await server.send_notification_email(
                "client@example.com",
                "Reset",
                f"<p>{secret_token}</p>",
            )

        self.assertFalse(result)
        joined_logs = " ".join(captured_logs.output)
        self.assertNotIn(secret_token, joined_logs)
        self.assertNotIn("xkeysib-secret-key", joined_logs)


class TestTemplateSelectionForBusinessFlows(unittest.IsolatedAsyncioTestCase):
    async def test_send_invoice_to_client_uses_invoice_template(self):
        booking = {
            "id": "booking-12345678",
            "client_email": "client@example.com",
            "client_name": "Client Test",
            "pickup_date": "10/06/2026",
            "pickup_time": "10:00",
            "pickup_address": "Paris",
            "dropoff_address": "CDG",
            "estimated_price": 120.0,
        }
        fake_bookings = SimpleNamespace(find_one=AsyncMock(return_value={}), update_one=AsyncMock())

        with patch.object(server, "db", SimpleNamespace(bookings=fake_bookings)), patch.object(
            server, "get_commission_settings", AsyncMock(return_value={"commission_rate": 0.1, "tva_commission_rate": 0.2})
        ), patch.object(
            server, "generate_and_store_document", AsyncMock(return_value=(b"%PDF-test", {"invoice_number": "000001"}))
        ), patch.object(server, "send_notification_email", AsyncMock(return_value=True)) as send_email:
            sent = await server.send_invoice_to_client(booking)

        self.assertTrue(sent)
        self.assertEqual(send_email.await_args.kwargs["template_key"], email_service.TEMPLATE_KEY_INVOICE)
        self.assertIn("BOOKING_ID", send_email.await_args.kwargs["template_params"])

    async def test_activation_email_uses_account_activation_template(self):
        tokens = SimpleNamespace(insert_one=AsyncMock())
        mock_send = AsyncMock(return_value=True)
        with patch.object(server, "db", SimpleNamespace(email_verification_tokens=tokens)), patch.object(
            server, "send_notification_email", mock_send
        ):
            await server._create_and_send_activation_token("user-1", "user@example.com", "Test User")

        self.assertEqual(mock_send.await_args.kwargs["template_key"], email_service.TEMPLATE_KEY_ACCOUNT_ACTIVATION)
        self.assertIn("ACTIVATION_URL", mock_send.await_args.kwargs["template_params"])

    async def test_forgot_password_uses_password_reset_template(self):
        users = SimpleNamespace(find_one=AsyncMock(return_value={"id": "u1", "email": "user@example.com", "name": "User"}))
        tokens = SimpleNamespace(update_many=AsyncMock(), insert_one=AsyncMock())
        mock_send = AsyncMock(return_value=True)

        with patch.object(server, "db", SimpleNamespace(users=users, password_reset_tokens=tokens)), patch.object(
            server, "send_notification_email", mock_send
        ):
            await server.forgot_password(server.PasswordResetRequest(email="user@example.com"))

        self.assertEqual(mock_send.await_args.kwargs["template_key"], email_service.TEMPLATE_KEY_PASSWORD_RESET)
        self.assertIn("RESET_URL", mock_send.await_args.kwargs["template_params"])

    async def test_payment_confirmation_uses_payment_template(self):
        booking = {
            "id": "book-1",
            "client_email": "client@example.com",
            "client_name": "Client",
            "pickup_date": "01/01/2026",
            "pickup_time": "12:00",
            "pickup_address": "Paris",
            "dropoff_address": "Lyon",
            "paid_amount": 99.5,
            "paid_currency": "eur",
        }
        with patch.object(server, "send_notification_email", AsyncMock(return_value=True)) as send_email:
            await server.send_booking_confirmation_to_client(booking)
        self.assertEqual(send_email.await_args.kwargs["template_key"], email_service.TEMPLATE_KEY_PAYMENT_CONFIRMED)

    async def test_driver_assignment_uses_driver_template(self):
        booking = {
            "id": "book-2",
            "pickup_date": "02/02/2026",
            "pickup_time": "10:30",
            "pickup_address": "Paris",
            "dropoff_address": "CDG",
            "transfer_type": "simple",
            "notes": "N/A",
        }
        driver = {"email": "driver@example.com"}
        client = {"name": "Client", "phone": "0102030405", "email": "client@example.com"}
        with patch.object(server, "send_notification_email", AsyncMock(return_value=True)) as send_email:
            await server.send_booking_notification_to_driver(driver, booking, client)
        self.assertEqual(send_email.await_args.kwargs["template_key"], email_service.TEMPLATE_KEY_DRIVER_ASSIGNED)

    async def test_refund_confirmation_uses_cancellation_template(self):
        booking = {
            "id": "book-3",
            "client_email": "client@example.com",
            "client_name": "Client",
            "pickup_date": "03/03/2026",
            "pickup_time": "11:00",
            "pickup_address": "Paris",
            "dropoff_address": "Orly",
            "paid_currency": "EUR",
        }
        refund_trace = {"refund_amount": 25.0, "refund_currency": "EUR", "refund_status": "succeeded"}
        with patch.object(server, "send_notification_email", AsyncMock(return_value=True)) as send_email:
            await server.send_refund_confirmation_to_client(booking, refund_trace)
        self.assertEqual(send_email.await_args.kwargs["template_key"], email_service.TEMPLATE_KEY_CANCELLATION)


if __name__ == "__main__":
    unittest.main()
