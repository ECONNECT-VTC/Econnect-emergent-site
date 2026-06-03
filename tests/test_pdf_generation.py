"""Unit tests for generate_financial_pdf() in backend/server.py."""
import sys
import os
import unittest
from unittest.mock import patch
from pathlib import Path

# Add backend directory to path so we can import helpers without the full FastAPI app
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

# We need to stub environment variables that server.py reads at import time
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test_secret")

# Patch motor so server.py can be imported without a real MongoDB
import unittest.mock as mock
sys.modules.setdefault("motor", mock.MagicMock())
sys.modules.setdefault("motor.motor_asyncio", mock.MagicMock())
sys.modules.setdefault("sendgrid", mock.MagicMock())
sys.modules.setdefault("sendgrid.helpers", mock.MagicMock())
sys.modules.setdefault("sendgrid.helpers.mail", mock.MagicMock())
sys.modules.setdefault("bcrypt", mock.MagicMock())

import importlib
server = importlib.import_module("server")
generate_financial_pdf = server.generate_financial_pdf
LOGO_PATH = server.LOGO_PATH


SAMPLE_BOOKING = {
    "estimated_price": 100.0,
    "pickup_address": "1 Rue de la Paix, Paris",
    "dropoff_address": "Aéroport CDG, Terminal 2",
    "pickup_date": "2024-06-01",
    "pickup_time": "08:00",
    "client_name": "Jean Dupont",
    "client_email": "jean@example.com",
    "driver_name": "Michel Martin",
    "transfer_type": "Berline",
    "payment_method": "cb",
    "distance_km": "25.0",
    "price_per_km": "2.50",
    "notes": "",
}

SAMPLE_SETTINGS = {
    "commission_rate": 0.15,
    "tva_commission_rate": 0.20,
    "company_name": "ECONNECT VTC SARL",
    "company_address": "10 Avenue de la Gare, 75001 Paris",
    "company_email": "contact@econnect-vtc.com",
    "company_phone": "0600000000",
    "company_siret": "12345678900001",
    "company_vtc_number": "EVTC0001",
}


class TestGenerateFinancialPDF(unittest.TestCase):

    def _assert_valid_pdf(self, pdf_bytes: bytes, doc_type: str):
        self.assertIsInstance(pdf_bytes, bytes, f"{doc_type}: result should be bytes")
        self.assertTrue(len(pdf_bytes) > 0, f"{doc_type}: PDF should not be empty")
        self.assertTrue(
            pdf_bytes[:4] == b"%PDF",
            f"{doc_type}: output should start with PDF magic bytes"
        )

    def test_invoice_document(self):
        pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "invoice", "000001")
        self._assert_valid_pdf(pdf, "invoice")

    def test_order_document(self):
        pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "order", "000002")
        self._assert_valid_pdf(pdf, "order")

    def test_driver_document(self):
        pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "driver", "000003")
        self._assert_valid_pdf(pdf, "driver")

    def test_commission_document(self):
        pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "commission", "000004")
        self._assert_valid_pdf(pdf, "commission")

    def test_activity_document(self):
        pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "activity", "000005")
        self._assert_valid_pdf(pdf, "activity")

    def test_logo_fallback_on_missing_file(self):
        """PDF must still be generated even when the logo file does not exist."""
        original_path = server.LOGO_PATH
        try:
            server.LOGO_PATH = Path("/nonexistent/path/logo.png")
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "invoice", "000006")
            self._assert_valid_pdf(pdf, "invoice (logo fallback)")
        finally:
            server.LOGO_PATH = original_path

    def test_logo_present(self):
        """When the logo file exists it should still produce a valid PDF."""
        if not LOGO_PATH.exists():
            self.skipTest("Logo file not present in this environment")
        pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "invoice", "000007")
        self._assert_valid_pdf(pdf, "invoice (with logo)")

    def test_disposition_transfer_order(self):
        booking = {**SAMPLE_BOOKING, "transfer_type": "Mise à disposition"}
        pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "order", "000008")
        self._assert_valid_pdf(pdf, "order (disposition)")

    def test_invoice_does_not_draw_tva_rule_explanation(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "invoice", "000009")

        self._assert_valid_pdf(pdf, "invoice (no TVA rule explanation)")
        self.assertTrue(any("Montant TVA (" in text for text in captured_strings))
        self.assertFalse(any("Règle TVA" in text for text in captured_strings))


if __name__ == "__main__":
    unittest.main()
