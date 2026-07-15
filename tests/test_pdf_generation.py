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
    "created_at": "2024-05-31T16:45:00+00:00",
    "client_name": "Jean Dupont",
    "client_email": "jean@example.com",
    "client_phone": "0601020304",
    "driver_name": "Michel Martin",
    "transfer_type": "Berline",
    "vehicle_category_name": "Berline",
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

    def test_invoice_keeps_financial_tva_line_without_legal_tva_notice(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "invoice", "000009")

        self._assert_valid_pdf(pdf, "invoice (no TVA rule explanation)")
        self.assertTrue(any("Montant TVA (" in text for text in captured_strings))
        self.assertFalse(any("TVA non récupérable par le preneur" in text for text in captured_strings))

    def test_order_legal_notice_contains_r3120_2_and_arrete_date(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "order", "000010")

        self._assert_valid_pdf(pdf, "order (legal notice)")
        self.assertNotIn("Justification réglementaire", captured_strings)
        self.assertTrue(any("article R3120-2 du Code des transports" in text for text in captured_strings))
        self.assertTrue(any("Arrêté du 6 août 2025" in text for text in captured_strings))
        self.assertEqual(
            captured_strings[-1],
            "Réservation préalable conforme à l’article R3120-2 du Code des transports et à l’Arrêté du 6 août 2025.",
        )

    def test_activity_total_label_is_ttc_and_legal_box_is_removed(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "activity", "000011")

        self._assert_valid_pdf(pdf, "activity (ttc total)")
        self.assertIn("TOTAL ACTIVITÉ TTC", captured_strings)
        self.assertNotIn("Mentions légales", captured_strings)

    def test_order_removes_designation_table_header(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "order", "000012")

        self._assert_valid_pdf(pdf, "order (no designation)")
        self.assertNotIn("DÉSIGNATION", captured_strings)

    def test_order_destination_is_in_complementary_mentions(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "order", "000013")

        self._assert_valid_pdf(pdf, "order (destination placement)")
        complementary_index = next(i for i, text in enumerate(captured_strings) if text == "MENTIONS COMPLÉMENTAIRES")
        destination_index = next(i for i, text in enumerate(captured_strings) if text.startswith("Destination :"))
        self.assertGreater(destination_index, complementary_index)

    def test_order_uses_assigned_driver_company_details(self):
        booking = {
            **SAMPLE_BOOKING,
            "document_driver_name": "Karim Chauffeur",
            "document_driver_company": "Karim Transport SAS",
            "document_driver_address": "12 avenue Victor Hugo, 75016 Paris",
            "document_driver_phone": "0611223344",
            "document_driver_siret": "55224466800011",
            "document_driver_vtc_number": "REVTC-751234",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "order", "000014")

        self._assert_valid_pdf(pdf, "order (assigned driver company)")
        self.assertIn("IDENTITÉ CHAUFFEUR / SOCIÉTÉ", captured_strings)
        self.assertIn("Karim Chauffeur", captured_strings)
        self.assertIn("Karim Transport SAS", captured_strings)
        self.assertIn("12 avenue Victor Hugo,", captured_strings)
        self.assertIn("75016 Paris", captured_strings)
        self.assertIn("55224466800011", captured_strings)
        self.assertIn("REVTC-751234", captured_strings)

    def test_order_redesign_includes_required_sections_and_na_fallbacks(self):
        booking = {
            **SAMPLE_BOOKING,
            "client_phone": "",
            "dropoff_address": "",
            "notes": "",
            "document_driver_name": "Nadia Benali",
            "document_driver_company": "NB Prestige",
            "document_driver_address": "",
            "document_driver_phone": "",
            "document_driver_siret": "",
            "document_driver_vtc_number": "",
            "vehicle_category_name": "Van",
        }
        settings = {
            **SAMPLE_SETTINGS,
            "company_address": "",
            "company_phone": "",
            "company_siret": "",
            "company_vtc_number": "",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, settings, "order", "000015")

        self._assert_valid_pdf(pdf, "order (required sections)")
        self.assertIn("INFORMATIONS CLIENT", captured_strings)
        self.assertIn("DÉTAILS DE LA COURSE", captured_strings)
        self.assertIn("MENTIONS COMPLÉMENTAIRES", captured_strings)
        self.assertIn("Date et heure de réservation :", captured_strings)
        self.assertIn("Date et heure de prise en charge :", captured_strings)
        self.assertIn("Nombre de passagers :", captured_strings)
        self.assertIn("Téléphone :", captured_strings)
        self.assertIn("Téléphone professionnel :", captured_strings)
        self.assertIn("Destination :", captured_strings)
        self.assertIn("Prix total TTC :", captured_strings)
        self.assertIn("Mode de paiement :", captured_strings)
        self.assertIn("Bagages / options :", captured_strings)
        self.assertGreaterEqual(captured_strings.count("N/A"), 5)


if __name__ == "__main__":
    unittest.main()
