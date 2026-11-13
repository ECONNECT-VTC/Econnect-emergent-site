"""Validated, explicitly priced supplementary booking charges."""

from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


CENT = Decimal("0.01")
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
TaxReason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class BookingCharge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: Description
    quantity: Decimal = Field(gt=0, le=100000, max_digits=9, decimal_places=3, allow_inf_nan=False)
    unit_price_ttc: Decimal = Field(gt=0, le=1000000, max_digits=9, decimal_places=2, allow_inf_nan=False)
    tax_treatment: Literal["vat", "exempt", "outside_scope"]
    vat_percent: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2, allow_inf_nan=False)
    tax_reason: TaxReason | None = None

    @model_validator(mode="after")
    def validate_tax(self):
        if self.tax_treatment == "vat":
            if self.vat_percent is None:
                raise ValueError("Indiquez le taux de TVA applicable")
        elif self.vat_percent is not None or not self.tax_reason:
            raise ValueError("Précisez le motif sans saisir de taux de TVA")
        if self.tax_treatment == "vat" and self.vat_percent == 0 and not self.tax_reason:
            raise ValueError("Précisez le motif du taux de TVA nul")
        if (self.quantity * self.unit_price_ttc).quantize(CENT, rounding=ROUND_HALF_UP) <= 0:
            raise ValueError("Le montant de la ligne doit être supérieur à zéro")
        return self


def _cents(amount: Decimal) -> int:
    return int(amount.quantize(CENT, rounding=ROUND_HALF_UP) * 100)


def calculate_charges(charges: list[BookingCharge], commission_rate: Decimal, fulfilled_by_admin: bool) -> dict:
    """Return exact cent totals; the configured rate applies to the TTC total."""
    if not charges:
        raise ValueError("Au moins une ligne de frais est nécessaire")
    if not commission_rate.is_finite() or not Decimal(0) <= commission_rate <= Decimal(1):
        raise ValueError("Taux de commission invalide")
    lines = []
    for charge in charges:
        total_cents = _cents(charge.quantity * charge.unit_price_ttc)
        total_ttc = Decimal(total_cents) / 100
        ht_cents = _cents(total_ttc / (1 + charge.vat_percent / 100)) if charge.tax_treatment == "vat" else total_cents
        lines.append({
            **charge.model_dump(mode="json"),
            "amount_ttc_cents": total_cents,
            "amount_ht_cents": ht_cents,
            "vat_cents": total_cents - ht_cents,
        })
    total_cents = sum(line["amount_ttc_cents"] for line in lines)
    commission_cents = 0 if fulfilled_by_admin else _cents(Decimal(total_cents) / 100 * commission_rate)
    return {
        "lines": lines,
        "amount_ttc_cents": total_cents,
        "amount_ht_cents": sum(line["amount_ht_cents"] for line in lines),
        "vat_cents": sum(line["vat_cents"] for line in lines),
        "commission_rate": str(commission_rate),
        "commission_cents": commission_cents,
        "driver_cents": 0 if fulfilled_by_admin else total_cents - commission_cents,
        "admin_retained_cents": total_cents if fulfilled_by_admin else commission_cents,
    }
