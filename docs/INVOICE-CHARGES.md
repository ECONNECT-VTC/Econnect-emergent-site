# Supplementary booking charges: implementation in progress

The supplementary-invoice workflow is **not yet available**. Do not deploy or
advertise this branch as a complete charge, invoicing or payment solution.

## Accounting decisions recorded

- An administrator will enter charge descriptions, quantities and unit amounts;
  no cancellation, waiting, extra-stop, no-show, damage or immobilisation price
  is applied automatically.
- Tax treatment and rate must be chosen explicitly for each line. Legal and tax
  treatment of a particular charge requires professional review.
- Partner-driver charges use the configured general commission percentage, even
  when the underlying course has a fixed commission override. The driver's share
  and commission are recognized when the charge invoice is issued, whether or
  not the customer has paid. On admin-fulfilled courses the amount stays with
  the operator.
- Charges entered before the initial invoice should be included in that invoice;
  additional charges after issuance require a separately numbered supplementary
  invoice. Payments and balances must distinguish the two.

The administrator can open **Préparer des frais** on a booking and save up to
40 explicitly priced lines as a draft. Saving does **not** affect a booking
price or payment, send email or issue an invoice. Drafts are stored in the
`charge_drafts` collection and use revision checks to prevent concurrent
overwrites; back up this collection alongside bookings. The corresponding API
requires an existing booking and administrator authentication.

`backend/booking_charges.py` contains preliminary validation and cent-based
calculations. `backend/supplementary_invoice_pdf.py` prepares a paginated PDF
from a frozen invoice snapshot, including the initial invoice reference, line
items and VAT breakdown. The calculation/PDF modules are not wired to invoicing,
payment or email. **Draft fees cannot yet be issued or collected.**

## Existing invoice PDFs

New client invoice PDFs are saved with their metadata and reused verbatim.
Invoices generated before this change have no archived original in the database:
their current download still regenerates the PDF, and cannot be represented as
an original copy. A PDF sent to Brevo may have been attached to the email, but
its past delivery and recoverability must be confirmed separately with Brevo or
the recipient. Never overwrite an original with a reconstructed PDF.

The current invoice notification sends the PDF as an attachment and optionally
uses `BREVO_TEMPLATE_INVOICE`. A supplementary invoice needs a separate send,
its own idempotency state and invoice reference; a dedicated Brevo template is
recommended, though HTML fallback is technically possible. This is not yet
implemented and no Brevo configuration has been changed.
