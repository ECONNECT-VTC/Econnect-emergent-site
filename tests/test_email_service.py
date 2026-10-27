import os
import unittest
from unittest.mock import patch

import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException

from backend import email_service


class TestBrevoTransport(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.api_key = "test-brevo-key"
        self.env = patch.dict(os.environ, {"BREVO_API_KEY": self.api_key}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.api_client = sib_api_v3_sdk.ApiClient()
        self.send = self.enterContext(patch.object(
            sib_api_v3_sdk.TransactionalEmailsApi, "send_transac_email", autospec=True
        ))

    async def test_successful_html_send_without_context_manager(self):
        self.assertFalse(hasattr(self.api_client, "__enter__"))
        with patch.object(
            sib_api_v3_sdk, "ApiClient", wraps=sib_api_v3_sdk.ApiClient
        ) as client_factory:
            result = await email_service.send_brevo_transactional_email(
                "client@example.com", "Subject", "<p>HTML fallback</p>"
            )

        self.assertTrue(result)
        configuration = client_factory.call_args.args[0]
        self.assertEqual(configuration.api_key["api-key"], self.api_key)
        request = self.send.call_args.args[1]
        payload = self.api_client.sanitize_for_serialization(request)
        self.assertEqual(payload["htmlContent"], "<p>HTML fallback</p>")
        self.assertNotIn("templateId", payload)
        self.send.assert_called_once()

    async def test_template_payload_is_compatible_with_sdk_models(self):
        result = await email_service.send_brevo_transactional_email(
            "client@example.com",
            "Subject",
            "<p>Unused fallback</p>",
            sender_email="sender@example.com",
            sender_name="Sender",
            reply_to="reply@example.com",
            template_id=42,
            template_params={"CLIENT_NAME": "Client"},
            attachment_bytes=b"pdf",
            attachment_filename="invoice.pdf",
            attachments=[("extra.pdf", b"extra")],
        )

        self.assertTrue(result)
        request = self.send.call_args.args[1]
        self.assertIsInstance(request, sib_api_v3_sdk.SendSmtpEmail)
        self.assertEqual(self.api_client.sanitize_for_serialization(request), {
            "sender": {"email": "sender@example.com", "name": "Sender"},
            "to": [{"email": "client@example.com"}],
            "subject": "Subject",
            "replyTo": {"email": "reply@example.com"},
            "templateId": 42,
            "params": {"CLIENT_NAME": "Client"},
            "attachment": [
                {"name": "invoice.pdf", "content": "cGRm"},
                {"name": "extra.pdf", "content": "ZXh0cmE="},
            ],
        })

    async def test_invalid_template_preserves_html_fallback(self):
        with patch.dict(os.environ, {"BREVO_TEMPLATE_ACCOUNT_ACTIVATION": "invalid"}):
            result = await email_service.send_brevo_transactional_email(
                "client@example.com", "Subject", "<p>Fallback</p>",
                template_key=email_service.TEMPLATE_KEY_ACCOUNT_ACTIVATION,
            )

        self.assertTrue(result)
        request = self.send.call_args.args[1]
        self.assertEqual(request.html_content, "<p>Fallback</p>")
        self.assertIsNone(request.template_id)

    async def test_api_exception_logs_status_and_redacted_bounded_body(self):
        error = ApiException(status=401, reason="Unauthorized")
        error.body = f'{{"message":"Invalid key {self.api_key}"}}' + "x" * 1000
        error.headers = {"api-key": self.api_key, "other-secret": "private-header"}
        self.send.side_effect = error

        with self.assertLogs(email_service.logger, level="ERROR") as logs:
            result = await email_service.send_brevo_transactional_email(
                "client@example.com", "Subject", "<p>HTML</p>"
            )

        self.assertFalse(result)
        self.assertIn("status=401", logs.output[0])
        self.assertIn("Invalid key [REDACTED]", logs.output[0])
        self.assertNotIn(self.api_key, logs.output[0])
        self.assertNotIn("private-header", logs.output[0])
        self.assertLessEqual(len(logs.records[0].args[-1]), 500)

    async def test_api_exception_without_body_returns_false(self):
        self.send.side_effect = ApiException(status=503)
        with self.assertLogs(email_service.logger, level="ERROR") as logs:
            result = await email_service.send_brevo_transactional_email(
                "client@example.com", "Subject", "<p>HTML</p>"
            )
        self.assertFalse(result)
        self.assertIn("status=503", logs.output[0])

    async def test_unexpected_error_logs_type_and_redacted_message(self):
        self.send.side_effect = TypeError(f"Invalid argument for {self.api_key}")
        with self.assertLogs(email_service.logger, level="ERROR") as logs:
            result = await email_service.send_brevo_transactional_email(
                "client@example.com", "Subject", "<p>HTML</p>"
            )
        self.assertFalse(result)
        self.assertIn("TypeError", logs.output[0])
        self.assertIn("Invalid argument for [REDACTED]", logs.output[0])
        self.assertNotIn(self.api_key, logs.output[0])


if __name__ == "__main__":
    unittest.main()
