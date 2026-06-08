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

import server  # noqa: E402


class _FakeMail:
    def __init__(self, from_email=None, to_emails=None, subject=None, html_content=None):
        self.from_email = from_email
        self.to_emails = to_emails
        self.subject = subject
        self.html_content = html_content
        self.attachment = None


class _FakeSendGridClient:
    def __init__(self, _api_key, sent_messages):
        self._sent_messages = sent_messages

    def send(self, message):
        self._sent_messages.append(message)
        return SimpleNamespace(status_code=202)


class TestInvoiceEmailFlows(unittest.IsolatedAsyncioTestCase):
    async def test_send_notification_email_supports_pdf_attachment(self):
        sent_messages = []

        with patch.dict(os.environ, {"SENDGRID_API_KEY": "sg_test_key", "SENDER_EMAIL": "noreply@test.com"}, clear=False), \
             patch.object(server, "Mail", _FakeMail), \
             patch.object(server, "Attachment", side_effect=lambda content, name, ftype, dispo: {
                 "content": content,
                 "name": name,
                 "type": ftype,
                 "disposition": dispo,
             }), \
             patch.object(server, "FileContent", side_effect=lambda value: value), \
             patch.object(server, "FileName", side_effect=lambda value: value), \
             patch.object(server, "FileType", side_effect=lambda value: value), \
             patch.object(server, "Disposition", side_effect=lambda value: value), \
             patch.object(server, "SendGridAPIClient", side_effect=lambda key: _FakeSendGridClient(key, sent_messages)):
            result = await server.send_notification_email(
                "client@example.com",
                "Votre facture",
                "<p>Bonjour</p>",
                attachment_bytes=b"%PDF-1.4",
                attachment_filename="facture.pdf",
            )

        self.assertTrue(result)
        self.assertEqual(len(sent_messages), 1)
        self.assertEqual(sent_messages[0].attachment["name"], "facture.pdf")
        self.assertEqual(sent_messages[0].attachment["type"], "application/pdf")
        self.assertEqual(sent_messages[0].attachment["disposition"], "attachment")
        self.assertEqual(sent_messages[0].attachment["content"], "JVBERi0xLjQ=")

    async def test_send_notification_email_without_attachment_remains_compatible(self):
        sent_messages = []

        with patch.dict(os.environ, {"SENDGRID_API_KEY": "sg_test_key", "SENDER_EMAIL": "noreply@test.com"}, clear=False), \
             patch.object(server, "Mail", _FakeMail), \
             patch.object(server, "SendGridAPIClient", side_effect=lambda key: _FakeSendGridClient(key, sent_messages)):
            result = await server.send_notification_email(
                "client@example.com",
                "Réservation confirmée",
                "<p>Bonjour</p>",
            )

        self.assertTrue(result)
        self.assertEqual(len(sent_messages), 1)
        self.assertIsNone(sent_messages[0].attachment)

    async def test_send_invoice_to_client_generates_pdf_sends_email_and_sets_flag(self):
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
        fake_bookings = SimpleNamespace(
            find_one=AsyncMock(return_value={}),
            update_one=AsyncMock(),
        )

        with patch.object(server, "db", SimpleNamespace(bookings=fake_bookings)), \
             patch.object(server, "get_commission_settings", AsyncMock(return_value={"commission_rate": 0.1, "tva_commission_rate": 0.2})), \
             patch.object(server, "generate_and_store_document", AsyncMock(return_value=(b"%PDF-test", {"invoice_number": "000001"}))) as generate_doc, \
             patch.object(server, "send_notification_email", AsyncMock(return_value=True)) as send_email:
            sent = await server.send_invoice_to_client(booking)

        self.assertTrue(sent)
        generate_doc.assert_awaited_once()
        send_email.assert_awaited_once()
        self.assertEqual(send_email.await_args.kwargs["attachment_filename"], "facture-BOOKING-.pdf")
        self.assertEqual(send_email.await_args.kwargs["attachment_bytes"], b"%PDF-test")
        fake_bookings.update_one.assert_awaited_once()

    async def test_send_invoice_to_client_is_idempotent_with_existing_flag(self):
        booking = {
            "id": "booking-12345678",
            "client_email": "client@example.com",
            "invoice_email_sent_at": server.datetime.now(server.timezone.utc),
        }

        with patch.object(server, "generate_and_store_document", AsyncMock()) as generate_doc, \
             patch.object(server, "send_notification_email", AsyncMock()) as send_email:
            sent = await server.send_invoice_to_client(booking)

        self.assertFalse(sent)
        generate_doc.assert_not_awaited()
        send_email.assert_not_awaited()

    async def test_send_invoice_to_client_skips_when_db_flag_exists(self):
        booking = {
            "id": "booking-12345678",
            "client_email": "client@example.com",
        }
        fake_bookings = SimpleNamespace(
            find_one=AsyncMock(return_value={"invoice_email_sent_at": server.datetime.now(server.timezone.utc)}),
            update_one=AsyncMock(),
        )

        with patch.object(server, "db", SimpleNamespace(bookings=fake_bookings)), \
             patch.object(server, "generate_and_store_document", AsyncMock()) as generate_doc, \
             patch.object(server, "send_notification_email", AsyncMock()) as send_email:
            sent = await server.send_invoice_to_client(booking)

        self.assertFalse(sent)
        generate_doc.assert_not_awaited()
        send_email.assert_not_awaited()

    async def test_update_booking_status_driver_sends_invoice_on_completed(self):
        booking_before = {"id": "booking1", "driver_id": "driver1", "status": "in_progress", "client_email": "client@example.com"}
        booking_after = {**booking_before, "status": "completed"}
        fake_bookings = SimpleNamespace(
            find_one=AsyncMock(side_effect=[booking_before, booking_after]),
            update_one=AsyncMock(),
        )

        with patch.object(server, "db", SimpleNamespace(bookings=fake_bookings)), \
             patch.object(server, "require_driver", AsyncMock(return_value={"id": "driver1"})), \
             patch.object(server, "send_invoice_to_client", AsyncMock()) as send_invoice:
            response = await server.update_booking_status_driver(
                "booking1",
                server.BookingStatusUpdate(status="completed"),
                request=object(),
            )

        self.assertEqual(response["status"], "completed")
        send_invoice.assert_awaited_once_with(booking_after)

    async def test_update_booking_status_admin_sends_invoice_on_completed(self):
        booking_before = {"id": "booking-admin-1", "status": "in_progress", "client_email": "client@example.com"}
        booking_after = {**booking_before, "status": "completed"}
        fake_bookings = SimpleNamespace(
            find_one=AsyncMock(side_effect=[booking_before, booking_after]),
            update_one=AsyncMock(),
        )

        with patch.object(server, "db", SimpleNamespace(bookings=fake_bookings)), \
             patch.object(server, "require_admin", AsyncMock(return_value={"id": "admin1"})), \
             patch.object(server, "send_invoice_to_client", AsyncMock()) as send_invoice:
            response = await server.update_booking_status_admin(
                "booking-admin-1",
                server.BookingStatusUpdate(status="completed"),
                request=object(),
            )

        self.assertEqual(response["status"], "completed")
        send_invoice.assert_awaited_once_with(booking_after)


if __name__ == "__main__":
    unittest.main()
