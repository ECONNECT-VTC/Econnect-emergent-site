import sys
import unittest
from decimal import Decimal
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from booking_charges import BookingCharge, calculate_charges


def charge(**overrides):
    return BookingCharge(**{
        "description": "Attente", "quantity": "1.5", "unit_price_ttc": "12.00",
        "tax_treatment": "vat", "vat_percent": "20", **overrides,
    })


class TestBookingCharges(unittest.TestCase):
    def test_explicit_tax_rounding_and_commission(self):
        result = calculate_charges([
            charge(),
            charge(description="Dégradation", quantity="1", unit_price_ttc="50",
                   tax_treatment="outside_scope", vat_percent=None, tax_reason="Motif à vérifier"),
        ], Decimal("0.10"), False)
        self.assertEqual(result["amount_ttc_cents"], 6800)
        self.assertEqual(result["amount_ht_cents"], 6500)
        self.assertEqual(result["vat_cents"], 300)
        self.assertEqual(result["commission_cents"], 680)
        self.assertEqual(result["driver_cents"], 6120)
        self.assertEqual(result["lines"][1]["tax_reason"], "Motif à vérifier")

    def test_admin_course_retains_all_fees(self):
        result = calculate_charges([charge()], Decimal("0.10"), True)
        self.assertEqual((result["driver_cents"], result["commission_cents"], result["admin_retained_cents"]), (0, 0, 1800))

    def test_line_rounding_half_up(self):
        result = calculate_charges([charge(quantity="0.5", unit_price_ttc="0.05", vat_percent="10")], Decimal("0.10"), False)
        self.assertEqual(result["amount_ttc_cents"], 3)
        self.assertEqual(result["commission_cents"], 0)
        self.assertEqual(result["amount_ht_cents"] + result["vat_cents"], 3)

    def test_reject_invalid_tax_quantity_and_amount(self):
        for changes in (
            {"quantity": "0"}, {"unit_price_ttc": "-1"}, {"quantity": "NaN"},
            {"unit_price_ttc": "1.001"}, {"description": " "}, {"vat_percent": None},
            {"tax_treatment": "outside_scope", "vat_percent": None}, {"vat_percent": "0"},
            {"tax_treatment": "exempt", "tax_reason": "motif", "vat_percent": "20"},
            {"quantity": "0.001", "unit_price_ttc": "0.01"},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                charge(**changes)
        for rate in (Decimal("-0.1"), Decimal("1.1"), Decimal("NaN")):
            with self.assertRaises(ValueError):
                calculate_charges([charge()], rate, False)
        with self.assertRaises(ValueError):
            calculate_charges([], Decimal("0.1"), False)


if __name__ == "__main__":
    unittest.main()
