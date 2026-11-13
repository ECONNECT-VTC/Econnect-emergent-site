"""Render a supplementary invoice from an already validated, frozen snapshot."""

from datetime import datetime
from html import escape
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _money(cents: int) -> str:
    return f"{'-' if cents < 0 else ''}{abs(cents) // 100},{abs(cents) % 100:02d} EUR"


def _text(value) -> str:
    return escape(str(value)).replace("\n", "<br/>")


def generate_supplementary_invoice_pdf(snapshot: dict) -> bytes:
    """Generate a PDF only from immutable invoice data, without reading live settings."""
    styles = getSampleStyleSheet()
    normal = styles["BodyText"]
    small = styles["Normal"]
    issue_date = snapshot["issued_at"]
    if not isinstance(issue_date, datetime):
        raise ValueError("La date de facture doit être une date figée")
    if not snapshot["lines"]:
        raise ValueError("La facture complémentaire doit comporter des lignes")
    for total, line_key in (("amount_ttc_cents", "amount_ttc_cents"),
                            ("amount_ht_cents", "amount_ht_cents"), ("vat_cents", "vat_cents")):
        if snapshot[total] != sum(line[line_key] for line in snapshot["lines"]):
            raise ValueError("Les totaux de la facture ne correspondent pas aux lignes")
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                                 topMargin=15 * mm, bottomMargin=15 * mm,
                                 title=f"{snapshot.get('title', 'Facture complémentaire')} {snapshot['invoice_number']}")
    issuer = snapshot["issuer"]
    client = snapshot["client"]
    title = snapshot.get("title", "FACTURE COMPLÉMENTAIRE")
    reference_label = "Référence" if "NON FISCAL" in title else "Document"
    initial_reference = (
        f"Réservation {_text(snapshot['booking_reference'])}" if title == "FACTURE CLIENT"
        else f"Facture de référence n° {_text(snapshot['original_invoice_number'])} · Réservation {_text(snapshot['booking_reference'])}"
    )
    story = [
        Paragraph(_text(snapshot.get("title", "FACTURE COMPLÉMENTAIRE")), styles["Title"]),
        Spacer(1, 4 * mm),
        Paragraph(f"{reference_label} n° {_text(snapshot['invoice_number'])} · Émis le {issue_date.strftime('%d/%m/%Y')}", normal),
        Paragraph(initial_reference, normal),
        Spacer(1, 5 * mm),
        Paragraph(f"<b>Émetteur :</b> {_text(issuer['name'])}<br/>{_text(issuer['address'])}<br/>"
                  f"SIRET : {_text(issuer['siret'])}<br/>TVA : {_text(issuer['vat_number'])}", normal),
        Spacer(1, 3 * mm),
        Paragraph(f"<b>Client :</b> {_text(client['name'])}<br/>{_text(client['address'])}", normal),
        Spacer(1, 5 * mm),
    ]
    headings = ["Frais", "Qté", "Prix unitaire TTC", "TVA", "Total TTC"]
    rows = [[Paragraph(_text(value), small) for value in headings]]
    tax_groups = {}
    for line in snapshot["lines"]:
        tax = {
            "vat": f"TVA {line['vat_percent']} %",
            "exempt": "Exonéré",
            "outside_scope": "Hors champ TVA",
        }[line["tax_treatment"]]
        if line.get("tax_reason"):
            tax += f" — {line['tax_reason']}"
        group = (line["tax_treatment"], line["vat_percent"])
        totals = tax_groups.setdefault(group, [0, 0])
        totals[0] += line["amount_ht_cents"]
        totals[1] += line["vat_cents"]
        rows.append([
            Paragraph(_text(line["description"]), small),
            Paragraph(_text(line["quantity"]), small),
            Paragraph(_text(f"{line['unit_price_ttc']} EUR"), small),
            Paragraph(_text(tax), small),
            Paragraph(_money(line["amount_ttc_cents"]), small),
        ])
    table = Table(rows, colWidths=[51 * mm, 16 * mm, 33 * mm, 45 * mm, 35 * mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([table, Spacer(1, 5 * mm)])
    for (treatment, rate), (base, vat) in tax_groups.items():
        label = {
            "vat": f"TVA {rate} %",
            "exempt": "Exonéré",
            "outside_scope": "Hors champ TVA",
        }[treatment]
        story.append(Paragraph(f"{_text(label)} — Base : {_money(base)} · TVA : {_money(vat)}", normal))
    story.extend([
        Spacer(1, 2 * mm),
        Paragraph(f"Total hors TVA : {_money(snapshot['amount_ht_cents'])}", normal),
        Paragraph(f"TVA : {_money(snapshot['vat_cents'])}", normal),
        Paragraph(f"<b>Total TTC : {_money(snapshot['amount_ttc_cents'])}</b>", normal),
        Spacer(1, 3 * mm),
    ])
    if "AVOIR" not in title:
        story.append(Paragraph(f"Échéance : {_text(snapshot['due_date'])}", normal))
    if snapshot.get("reason"):
        story.append(Paragraph(f"Motif : {_text(snapshot['reason'])}", normal))
    document.build(story)
    return output.getvalue()
