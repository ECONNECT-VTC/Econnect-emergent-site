import re
import sys
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from booking_charges import BookingCharge, calculate_charges
import supplementary_invoice_pdf


def snapshot():
    charges = [
        BookingCharge(description="Attente", quantity="1.5", unit_price_ttc="12.00",
                      tax_treatment="vat", vat_percent="20"),
        BookingCharge(description="Dégradation <vérifiée>", quantity="1", unit_price_ttc="50",
                      tax_treatment="outside_scope", tax_reason="Motif à vérifier"),
    ]
    return {
        **calculate_charges(charges, Decimal("0.1"), False),
        "invoice_number": "000002", "original_invoice_number": "000001",
        "booking_reference": "ABCDEF", "issued_at": datetime(2026, 11, 13, tzinfo=timezone.utc),
        "due_date": "13/12/2026",
        "issuer": {"name": "Econnect", "address": "Paris", "siret": "123", "vat_number": "FR1"},
        "client": {"name": "Client", "address": "Lyon"},
    }


class TestSupplementaryInvoicePDF(unittest.TestCase):
    def test_pdf_contains_frozen_reference_lines_tax_and_totals(self):
        source = snapshot()
        captured = []
        real_paragraph = supplementary_invoice_pdf.Paragraph

        def capture(value, *args, **kwargs):
            captured.append(value)
            return real_paragraph(value, *args, **kwargs)

        with patch.object(supplementary_invoice_pdf, "Paragraph", side_effect=capture):
            pdf = supplementary_invoice_pdf.generate_supplementary_invoice_pdf(source)
        self.assertTrue(pdf.startswith(b"%PDF-"))
        text = " ".join(captured)
        for expected in ("000001", "000002", "ABCDEF", "Attente", "Dégradation &lt;vérifiée&gt;",
                         "Hors champ TVA", "Motif à vérifier", "TVA 20 %", "68,00 EUR", "3,00 EUR"):
            self.assertIn(expected, text)
        self.assertNotIn("driver_cents", text)

    def test_many_lines_paginate_without_truncating(self):
        source = snapshot()
        source["lines"] = source["lines"] * 40
        for key in ("amount_ttc_cents", "amount_ht_cents", "vat_cents"):
            source[key] *= 40
        pdf = supplementary_invoice_pdf.generate_supplementary_invoice_pdf(source)
        self.assertGreater(len(re.findall(rb"/Type\s*/Page\b", pdf)), 1)

    def test_missing_lines_and_invalid_date_fail_explicitly(self):
        source = snapshot()
        source["lines"] = []
        with self.assertRaises(ValueError):
            supplementary_invoice_pdf.generate_supplementary_invoice_pdf(source)
        source = snapshot()
        source["issued_at"] = "13/11/2026"
        with self.assertRaises(ValueError):
            supplementary_invoice_pdf.generate_supplementary_invoice_pdf(source)
        source = snapshot()
        source["amount_ttc_cents"] += 1
        with self.assertRaisesRegex(ValueError, "totaux"):
            supplementary_invoice_pdf.generate_supplementary_invoice_pdf(source)


if __name__ == "__main__":
    unittest.main()
