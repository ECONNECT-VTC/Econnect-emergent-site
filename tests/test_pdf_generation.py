"""Unit tests for generate_financial_pdf() in backend/server.py."""
import sys
import os
import unittest
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
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
sys.modules.setdefault("sib_api_v3_sdk", mock.MagicMock())
sys.modules.setdefault("sib_api_v3_sdk.rest", mock.MagicMock())
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
    "company_vat_number": "FR00123456789",
    "company_iban": "FR76 3000 4000 5000 6000 7000 189",
}


class TestGenerateFinancialPDF(unittest.TestCase):

    def test_booking_reference_is_distinct_from_financial_document_number(self):
        booking = {**SAMPLE_BOOKING, "id": "aBcDeF123456"}
        for document_type in ("quote", "invoice", "order", "driver", "commission", "activity"):
            with self.subTest(document_type=document_type), patch.object(
                server.canvas.Canvas, "drawString"
            ) as draw_string, patch.object(
                server.canvas.Canvas, "drawRightString"
            ) as draw_right_string:
                pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, document_type, "000123")
                self._assert_valid_pdf(pdf, document_type)
                texts = [
                    str(call.args[2])
                    for method in (draw_string, draw_right_string)
                    for call in method.call_args_list
                ]
                self.assertTrue(any("ABCDEF" in text for text in texts))
                self.assertFalse(any(booking["id"] in text for text in texts))
                if document_type == "order":
                    self.assertIn("Référence : ABCDEF", texts)
                    self.assertNotIn("Référence : 000123", texts)
                else:
                    self.assertIn("Référence course : ABCDEF", texts)
                    self.assertTrue(any("N° 000123" in text for text in texts))

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

    def test_quote_document_uses_client_invoice_style_with_quote_wording(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString
        original_draw_right_string = server.canvas.Canvas.drawRightString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        def spy_draw_right_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_right_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string), \
             patch.object(server.canvas.Canvas, "drawRightString", new=spy_draw_right_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "quote", "000001Q")

        self._assert_valid_pdf(pdf, "quote")
        self.assertIn("DEVIS N° 000001Q", captured_strings)
        self.assertIn("INFORMATIONS DE VALIDATION", captured_strings)
        self.assertIn("Statut : Devis envoyé", captured_strings)
        self.assertNotIn("FACTURE N° 000001Q", captured_strings)

    def test_order_document(self):
        pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "order", "000002")
        self._assert_valid_pdf(pdf, "order")

    def test_driver_document(self):
        pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "driver", "000003")
        self._assert_valid_pdf(pdf, "driver")

    def test_commission_document(self):
        pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "commission", "000004")
        self._assert_valid_pdf(pdf, "commission")

    def test_commission_redesign_uses_company_sections_and_euro_symbol(self):
        booking = {
            **SAMPLE_BOOKING,
            "document_driver_name": "Karim Chauffeur",
            "document_driver_company": "Karim Transport SAS",
            "document_driver_address": "12 avenue Victor Hugo, 75016 Paris",
            "document_driver_phone": "0611223344",
            "document_driver_siret": "55224466800011",
            "document_driver_company_vat_number": "FR66552244668",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString
        original_draw_right_string = server.canvas.Canvas.drawRightString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        def spy_draw_right_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_right_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string), \
             patch.object(server.canvas.Canvas, "drawRightString", new=spy_draw_right_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "commission", "000014")

        self._assert_valid_pdf(pdf, "commission (redesign)")
        self.assertIn("SOCIETE EMETTRICE", captured_strings)
        self.assertNotIn("SOCIETE EMETRICE", captured_strings)
        self.assertIn("SOCIETE PARTENAIRE", captured_strings)
        self.assertIn("ECONNECT VTC SARL", captured_strings)
        self.assertIn("Karim Transport SAS", captured_strings)
        self.assertFalse(any(text == "ÉMETTEUR" for text in captured_strings))
        self.assertFalse(any("Destinataire" in text for text in captured_strings))
        self.assertFalse(any(" EUR" in text for text in captured_strings))
        self.assertTrue(any("€" in text for text in captured_strings))
        self.assertTrue(any("Commission sur course" in text for text in captured_strings))
        self.assertFalse(any("Commission de gestion" in text for text in captured_strings))
        self.assertFalse(any("DÉTAIL DU CALCUL" in text for text in captured_strings))
        self.assertFalse(any("Facture Client (" in text for text in captured_strings))
        self.assertFalse(any("Document confidentiel" in text for text in captured_strings))

    def test_commission_redesign_uses_disposition_label_for_disposition_transfers(self):
        booking = {
            **SAMPLE_BOOKING,
            "transfer_type": "Mise à disposition",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "commission", "000015")

        self._assert_valid_pdf(pdf, "commission (disposition label)")
        self.assertTrue(any("commission mise à disposition" in text for text in captured_strings))

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

    def test_invoice_renders_payment_method_status_and_iban(self):
        booking = {
            **SAMPLE_BOOKING,
            "payment_method": "virement",
            "payment_status": "paid",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "invoice", "000009B")

        self._assert_valid_pdf(pdf, "invoice (payment info)")
        self.assertIn("INFORMATIONS DE PAIEMENT", captured_strings)
        self.assertTrue(any("Mode de paiement : Virement bancaire" == text for text in captured_strings))
        self.assertTrue(any("Statut : Payée" == text for text in captured_strings))
        self.assertTrue(any("IBAN : FR76 3000 4000 5000 6000 7000 189" == text for text in captured_strings))

    def test_invoice_renders_statut_a_payer_text(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "invoice", "000009B2")

        self._assert_valid_pdf(pdf, "invoice (statut à payer)")
        self.assertTrue(any("Statut : À payer" == text for text in captured_strings))

    def test_invoice_card_payment_does_not_render_iban_line(self):
        booking = {
            **SAMPLE_BOOKING,
            "payment_method": "cb",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "invoice", "000009B4")

        self._assert_valid_pdf(pdf, "invoice (card payment)")
        self.assertTrue(any("Mode de paiement : Carte bancaire" == text for text in captured_strings))
        self.assertFalse(any(text.startswith("IBAN :") for text in captured_strings))

    def test_invoice_virement_with_placeholder_iban_does_not_render_iban_line(self):
        booking = {
            **SAMPLE_BOOKING,
            "payment_method": "virement",
        }
        settings_with_placeholder_iban = {
            **SAMPLE_SETTINGS,
            "company_iban": "À compléter",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, settings_with_placeholder_iban, "invoice", "000009B5")

        self._assert_valid_pdf(pdf, "invoice (virement placeholder iban)")
        self.assertTrue(any("Mode de paiement : Virement bancaire" == text for text in captured_strings))
        self.assertFalse(any("IBAN : N/A" == text for text in captured_strings))
        self.assertFalse(any("IBAN : À compléter" == text for text in captured_strings))
        self.assertFalse(any(text.startswith("IBAN :") for text in captured_strings))

    def test_invoice_service_description_uses_courses_effectuees_wording(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "invoice", "000009B3")

        self._assert_valid_pdf(pdf, "invoice (service description wording)")
        self.assertTrue(any("Courses effectuées" == text for text in captured_strings))
        self.assertFalse(any("Course VTC" == text for text in captured_strings))

    def test_invoice_hors_admin_issuer_block(self):
        booking = {
            **SAMPLE_BOOKING,
            "issuer": {
                "name": "ECONNECT VTC SARL",
                "address": "10 Avenue de la Gare, 75001 Paris",
                "email": "contact@econnect-vtc.com",
                "phone": "0600000000",
                "siret": "12345678900001",
                "vtc_number": "EVTC0001",
                "is_driver_issuer": True,
            },
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "invoice", "000009C")

        self._assert_valid_pdf(pdf, "invoice (hors admin issuer block)")
        self.assertTrue(
            any("Facture émise par ECONNECT VTC pour :" == text for text in captured_strings),
            "Expected hors-admin intro line in invoice",
        )
        self.assertTrue(
            any("ECONNECT VTC SARL" in text for text in captured_strings),
            "Expected company name in hors-admin issuer block",
        )
        self.assertTrue(
            any("Chauffeur : Michel Martin" in text for text in captured_strings),
            "Expected driver name in hors-admin issuer block",
        )
        self.assertTrue(
            any("Numéro de Téléphone : 0600000000" in text for text in captured_strings),
            "Expected partner phone in hors-admin issuer block",
        )
        self.assertTrue(
            any("Numéro de TVA : N/A" in text for text in captured_strings),
            "Expected VAT fallback in hors-admin issuer block",
        )
        intro_index = next((i for i, text in enumerate(captured_strings) if text == "Facture émise par ECONNECT VTC pour :"), -1)
        company_index = next((i for i, text in enumerate(captured_strings) if text == "ECONNECT VTC SARL"), -1)
        driver_index = next((i for i, text in enumerate(captured_strings) if text == "Chauffeur : Michel Martin"), -1)
        phone_index = next((i for i, text in enumerate(captured_strings) if text == "Numéro de Téléphone : 0600000000"), -1)
        vat_index = next((i for i, text in enumerate(captured_strings) if text == "Numéro de TVA : N/A"), -1)
        self.assertTrue(
            intro_index < company_index < driver_index < phone_index < vat_index,
            "Expected issuer block lines in order: intro, company, driver, phone, VAT",
        )
        self.assertFalse(
            any("LeCab" in text for text in captured_strings),
            "LeCab must not appear in hors-admin issuer block",
        )

    def test_invoice_hors_admin_issuer_block_uses_partner_vat_when_available(self):
        booking = {
            **SAMPLE_BOOKING,
            "issuer": {
                "name": "Partenaire Mobilité",
                "address": "20 Rue de Lyon, 75012 Paris",
                "email": "contact@partenaire.fr",
                "phone": "0611223344",
                "siret": "98765432100011",
                "vtc_number": "PMVTC001",
                "vat_number": "FR99887766554",
                "is_driver_issuer": True,
            },
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "invoice", "000009C2")

        self._assert_valid_pdf(pdf, "invoice (hors admin issuer block with partner VAT)")
        self.assertTrue(
            any("Numéro de TVA : FR99887766554" in text for text in captured_strings),
            "Expected partner VAT in hors-admin issuer block",
        )

    def test_invoice_preserves_disposition_tva_rate(self):
        booking = {
            **SAMPLE_BOOKING,
            "transfer_type": "Mise à disposition",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "invoice", "000009C")

        self._assert_valid_pdf(pdf, "invoice (disposition TVA)")
        self.assertTrue(any("Montant TVA (20%)" == text for text in captured_strings))

    def test_invoice_renders_disposition_hours(self):
        """Mise à disposition invoices must display the booked duration in hours."""
        booking = {
            **SAMPLE_BOOKING,
            "transfer_type": "Mise à disposition",
            "disposition_hours": 3.0,
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "invoice", "000009D")

        self._assert_valid_pdf(pdf, "invoice (disposition hours)")
        self.assertTrue(
            any("Durée : 3h" in text for text in captured_strings),
            f"Expected 'Durée : 3h' in captured strings but got: {captured_strings}"
        )

    def test_invoice_disposition_hours_absent_for_standard_course(self):
        """Standard course invoices must NOT display a Durée line."""
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "invoice", "000009E")

        self._assert_valid_pdf(pdf, "invoice (no disposition hours)")
        self.assertFalse(
            any("Durée :" in text for text in captured_strings),
            "Standard course should not contain a Durée line"
        )

    def test_invoice_renders_penalties_note_below_table(self):
        """Penalties notice must appear in the invoice body (below the table), not only in the footer."""
        captured_strings = []
        captured_positions = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            captured_positions.append((x, y, str(text)))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "invoice", "000009F")

        self._assert_valid_pdf(pdf, "invoice (penalties note)")
        self.assertTrue(
            any(
                "Article L441-10 du Code de commerce : des pénalités de retard sont applicables en cas de paiement tardif." in text
                for text in captured_strings
            ),
            "Expected article L441-10 legal notice to appear in the invoice",
        )
        self.assertTrue(
            any(
                "Paiement sous 30 jours. Tout retard entraîne des pénalités égales à 3 fois le taux ECONNECT." in text
                for text in captured_strings
            ),
            "Expected payment-delay legal notice to appear in the invoice",
        )

    def test_invoice_footer_contains_vat_number_and_removes_thanks(self):
        settings = {
            **SAMPLE_SETTINGS,
            "company_name": "Econnect VTC SARL",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString
        original_draw_centered = server.canvas.Canvas.drawCentredString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        def spy_draw_centered(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_centered(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string), \
             patch.object(server.canvas.Canvas, "drawCentredString", new=spy_draw_centered):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, settings, "invoice", "000009G")

        self._assert_valid_pdf(pdf, "invoice (footer VAT)")
        self.assertTrue(any("N° TVA : FR00123456789" in text for text in captured_strings))
        self.assertTrue(any("ECONNECT VTC SARL" in text for text in captured_strings))
        self.assertTrue(any(" - SIRET : 12345678900001 - N° TVA : FR00123456789" in text for text in captured_strings))
        self.assertFalse(any("—" in text for text in captured_strings))
        self.assertFalse(any("Merci de votre confiance." == text for text in captured_strings))

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

    def test_activity_total_label_is_ht_and_legal_box_is_removed(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "activity", "000011")

        self._assert_valid_pdf(pdf, "activity (ht total)")
        self.assertIn("TOTAL ACTIVITÉ HT", captured_strings)
        self.assertNotIn("Mentions légales", captured_strings)

    def test_activity_redesign_uses_commission_style(self):
        """Activity PDF must use commission-style design: SOCIETE EMETTRICE / PARTENAIRE, € symbol."""
        booking = {
            **SAMPLE_BOOKING,
            "document_driver_name": "Karim Chauffeur",
            "document_driver_company": "Karim Transport SAS",
            "document_driver_address": "12 avenue Victor Hugo, 75016 Paris",
            "document_driver_phone": "0611223344",
            "document_driver_siret": "55224466800011",
            "document_driver_company_vat_number": "FR66552244668",
        }
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString
        original_draw_right_string = server.canvas.Canvas.drawRightString
        original_draw_centred_string = server.canvas.Canvas.drawCentredString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        def spy_draw_right_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_right_string(canvas_obj, x, y, text, *args, **kwargs)

        def spy_draw_centred_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_centred_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string), \
             patch.object(server.canvas.Canvas, "drawRightString", new=spy_draw_right_string), \
             patch.object(server.canvas.Canvas, "drawCentredString", new=spy_draw_centred_string):
            pdf = generate_financial_pdf(booking, SAMPLE_SETTINGS, "activity", "000011B")

        self._assert_valid_pdf(pdf, "activity (redesign)")
        # Commission-style party boxes
        self.assertIn("SOCIETE EMETTRICE", captured_strings)
        self.assertNotIn("SOCIETE EMETRICE", captured_strings)
        self.assertIn("SOCIETE PARTENAIRE", captured_strings)
        # Document header
        self.assertIn("RELEVÉ D'ACTIVITÉ N° 000011B", captured_strings)
        # Company info
        self.assertIn("ECONNECT VTC SARL", captured_strings)
        self.assertIn("Karim Transport SAS", captured_strings)
        # € symbol, no bare EUR
        self.assertTrue(any("€" in text for text in captured_strings))
        self.assertFalse(any(" EUR" in text for text in captured_strings))
        # Gold total row
        self.assertIn("TOTAL ACTIVITÉ HT", captured_strings)
        # Activity content labels
        self.assertTrue(any("Course TTC" in text for text in captured_strings))
        self.assertTrue(any("Commission TTC" in text for text in captured_strings))
        self.assertTrue(any("Versé HT" in text or "Versé" in text for text in captured_strings))
        self.assertTrue(any("Course(s) réalisée(s) :" in text for text in captured_strings))
        self.assertFalse(any("Course VTC" in text for text in captured_strings))
        self.assertFalse(any("Période :" in text for text in captured_strings))
        # Old labels must not appear
        self.assertFalse(any("ÉMETTEUR" in text for text in captured_strings))
        self.assertFalse(any(text == "CHAUFFEUR" for text in captured_strings))
        self.assertFalse(any("DÉTAILS DU TRAJET" in text for text in captured_strings))

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

    def test_order_destination_is_in_trip_details(self):
        captured_strings = []
        original_draw_string = server.canvas.Canvas.drawString

        def spy_draw_string(canvas_obj, x, y, text, *args, **kwargs):
            captured_strings.append(str(text))
            return original_draw_string(canvas_obj, x, y, text, *args, **kwargs)

        with patch.object(server.canvas.Canvas, "drawString", new=spy_draw_string):
            pdf = generate_financial_pdf(SAMPLE_BOOKING, SAMPLE_SETTINGS, "order", "000013")

        self._assert_valid_pdf(pdf, "order (destination placement)")
        trip_index = next(i for i, text in enumerate(captured_strings) if text == "DÉTAILS DE LA COURSE")
        destination_index = next(i for i, text in enumerate(captured_strings) if text.startswith("Destination :"))
        self.assertGreater(destination_index, trip_index)
        complementary_index = next(i for i, text in enumerate(captured_strings) if text == "INFORMATIONS COMPLÉMENTAIRES")
        self.assertGreater(complementary_index, destination_index)

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
        self.assertIn("INFORMATIONS COMPLÉMENTAIRES", captured_strings)
        self.assertIn("Date et heure de réservation :", captured_strings)
        self.assertIn("Date et heure de prise en charge :", captured_strings)
        self.assertIn("Nombre de passagers :", captured_strings)
        self.assertIn("Téléphone :", captured_strings)
        self.assertNotIn("Téléphone professionnel :", captured_strings)
        self.assertIn("Destination :", captured_strings)
        self.assertIn("Prix total TTC :", captured_strings)
        self.assertIn("Mode de paiement :", captured_strings)
        self.assertIn("Bagages / options :", captured_strings)
        self.assertGreaterEqual(captured_strings.count("N/A"), 5)


class TestBookingDocumentReferences(unittest.IsolatedAsyncioTestCase):
    async def test_document_storage_preserves_full_booking_id_and_sequential_number(self):
        booking = {**SAMPLE_BOOKING, "id": "aBcDeF123456"}
        invoices = SimpleNamespace(find_one=AsyncMock(return_value=None), insert_one=AsyncMock())
        sequence = AsyncMock(return_value="000123")
        with patch.object(server, "db", SimpleNamespace(invoices=invoices)), patch.object(
            server, "get_document_driver_profile", AsyncMock(return_value=None)
        ), patch.object(
            server, "build_document_issuer_profile", AsyncMock(return_value={})
        ), patch.object(server, "get_next_sequential_number", sequence), patch.object(
            server, "generate_financial_pdf", return_value=b"%PDF-test"
        ) as generate_pdf:
            _, metadata = await server.generate_and_store_document(booking, SAMPLE_SETTINGS, "invoice")
            self.assertEqual(metadata["booking_id"], booking["id"])
            self.assertEqual(metadata["invoice_number"], "000123")
            invoices.insert_one.assert_awaited_once_with(metadata)
            self.assertEqual(generate_pdf.call_args.args[0]["id"], booking["id"])
            self.assertEqual(generate_pdf.call_args.args[3], "000123")
            invoices.find_one.assert_awaited_with(
                {"booking_id": booking["id"], "type": "invoice"}, {"_id": 0}
            )
            invoices.find_one.return_value = metadata
            _, existing = await server.generate_and_store_document(booking, SAMPLE_SETTINGS, "invoice")
            self.assertEqual(existing, metadata)
            self.assertEqual(generate_pdf.call_args.args[3], "000123")
            sequence.assert_awaited_once()
            invoices.insert_one.assert_awaited_once()

    async def test_all_booking_pdf_downloads_use_reference_filenames_and_full_id_lookups(self):
        booking = {
            **SAMPLE_BOOKING, "id": "aBcDeF123456", "driver_id": "driver-1",
            "client_id": "client-1", "status": "COMPLETED",
        }
        expected = {
            "/driver/bookings/{booking_id}/order-pdf": ("order", "bon-de-commande"),
            "/admin/quotes/{booking_id}/pdf": ("quote", "devis-client"),
            "/admin/invoices/{booking_id}/pdf": ("invoice", "facture-client"),
            "/admin/invoices/{booking_id}/driver-pdf": ("driver", "facture-chauffeur"),
            "/admin/invoices/{booking_id}/commission-pdf": ("commission", "facture-commission"),
            "/admin/invoices/{booking_id}/activity-pdf": ("activity", "releve-activite"),
            "/admin/orders/{booking_id}/pdf": ("order", "bon-de-commande"),
            "/driver/invoices/{booking_id}/pdf": ("driver", "facture-chauffeur"),
            "/driver/invoices/{booking_id}/order-pdf": ("order", "bon-commande"),
            "/driver/invoices/{booking_id}/commission-pdf": ("commission", "facture-commission"),
            "/driver/invoices/{booking_id}/activity-pdf": ("activity", "releve-activite"),
            "/client/invoices/{booking_id}/pdf": ("invoice", "facture"),
        }
        routes = {route.path.removeprefix("/api"): route for route in server.api_router.routes}
        bookings = SimpleNamespace(find_one=AsyncMock(return_value=booking))
        with patch.object(server, "db", SimpleNamespace(bookings=bookings)), patch.object(
            server, "require_admin", AsyncMock()
        ), patch.object(server, "require_driver", AsyncMock(return_value={"id": "driver-1"})), patch.object(
            server, "get_current_user", AsyncMock(return_value={"id": "client-1", "role": "client"})
        ), patch.object(
            server, "get_commission_settings", AsyncMock(return_value=SAMPLE_SETTINGS)
        ), patch.object(
            server, "generate_and_store_document", AsyncMock(return_value=(b"%PDF-test", {}))
        ) as generate_document:
            for path, (document_type, filename_prefix) in expected.items():
                with self.subTest(path=path):
                    response = await routes[path].endpoint(booking["id"], SimpleNamespace())
                    self.assertEqual(response.body, b"%PDF-test")
                    self.assertEqual(response.headers["content-disposition"],
                                     f"attachment; filename={filename_prefix}-ABCDEF.pdf")
                    bookings.find_one.assert_awaited_with({"id": booking["id"]}, {"_id": 0})
                    generate_document.assert_awaited_with(booking, SAMPLE_SETTINGS, document_type)


if __name__ == "__main__":
    unittest.main()
