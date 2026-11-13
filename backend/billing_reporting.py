"""Report immutable issuance amounts separately from receipts and credits."""

from supplementary_ledger import remaining_cents


async def supplementary_report(database, *, driver_id=None):
    totals = {key: 0 for key in (
        "amount_ttc_cents", "amount_ht_cents", "vat_cents", "commission_cents",
        "commission_ht_cents", "commission_vat_cents", "driver_cents", "admin_retained_cents",
        "received_cents", "remaining_cents", "refundable_cents", "refunded_cents",
    )}
    entries = []
    query = {"issued.driver_id": driver_id} if driver_id else {"issued.0": {"$exists": True}}
    async for document in database.charge_drafts.find(query, {"issued.pdf_snapshot": 0}):
        for invoice in document.get("issued", []):
            if driver_id and invoice.get("driver_id") != driver_id:
                continue
            credited = bool(invoice.get("credit"))
            for key in ("amount_ttc_cents", "amount_ht_cents", "vat_cents", "commission_cents",
                        "commission_ht_cents", "commission_vat_cents", "driver_cents", "admin_retained_cents"):
                totals[key] += 0 if credited else invoice.get(key, 0)
            received = invoice["paid_cents"] - invoice.get("refunded_cents", 0)
            totals["received_cents"] += received
            totals["remaining_cents"] += remaining_cents(invoice)
            totals["refundable_cents"] += received if credited else 0
            totals["refunded_cents"] += invoice.get("refunded_cents", 0)
            entries.append({key: value for key, value in invoice.items()
                            if key not in {"pdf_snapshot", "documents", "payments", "refunds", "email", "credit_email"}})
    entries.sort(key=lambda item: item["invoice_number"], reverse=True)
    return {"totals": totals, "invoices": entries}


def public_invoice(invoice, role):
    keys = {
        "id", "booking_id", "invoice_number", "original_invoice_number", "issued_at", "due_date",
        "lines", "amount_ttc_cents", "amount_ht_cents", "vat_cents", "paid_cents", "credit",
        "refunded_cents", "is_initial",
    }
    if role == "driver":
        keys |= {"commission_cents", "driver_cents", "commission_invoice_number"}
    result = {key: value for key, value in invoice.items() if key in keys}
    result["remaining_cents"] = remaining_cents(invoice)
    if invoice.get("credit"):
        result["credit"] = {key: value for key, value in invoice["credit"].items()
                            if key in {"invoice_number", "issued_at", "reason"}
                            or (role == "driver" and key == "commission_invoice_number")}
    if role == "client":
        active = invoice.get("active_operation")
        if active and active["kind"] == "checkout":
            result["checkout_request_id"] = active["request_id"]
    return result
