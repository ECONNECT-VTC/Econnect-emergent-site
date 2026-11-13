# Booking charges and supplementary billing

The billing integrations are implemented behind an activation flag.
**Production activation has not been validated.** Issuance remains disabled by
default; no production payment, email or invoice is created by the tests.

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

`backend/booking_charges.py` contains validation and cent-based
calculations. `backend/supplementary_invoice_pdf.py` prepares a paginated PDF
from a frozen invoice snapshot, including the initial invoice reference, line
items and VAT breakdown.

## Initial invoice with charges

The administrative draft panel offers three explicit destinations:

- Supplementary invoice: requires a previously issued initial invoice.
- Initial invoice including transport and saved charges: requires a completed
  course and no initial invoice. A fixed transport commission is preserved for
  the transport line only; the general rate applies to the extra lines.
- First invoice of operator fees only: explicitly excludes transport, retains
  the fees for Econnect and is also available on cancelled courses. No fee is
  inferred from an estimated transport price. The administrator must confirm
  the legal basis, price and VAT of every line.

The initial invoice, consumed draft, booking total and frozen financial
breakdown are committed together. Existing payments are preserved without
being counted twice; confirmed course refunds are subtracted before applying
the remaining receipts. An unresolved course refund blocks issuance.
The existing initial-invoice payment tracking is used for its balance;
supplementary payments never settle it. Initial invoices already issued cannot
be replaced by this endpoint.
Previously issued partner documents also block this flow, rather than being
silently replaced or having their commission billed twice.

Initial generation through the older PDF routes refuses to silently omit
prepared charges and directs the administrator to this explicit workflow.

## Supplementary invoices and documents

The draft editor now includes an administrative supplementary-invoice panel.
The authenticated administrator can inspect issued snapshots, download their
archived PDFs and record money **already received** against an individual
supplementary invoice. These manual records never debit a card or alter the
original booking's price, payments or invoice. Payments accept positive integer
cents, reject overpayments and use a revision plus a UUID request identifier.
Retries use the same request and cannot record the same payment twice.

The issuance API requires an existing initial invoice, saved draft lines, an
explicit client billing name/address and due date, and a complete issuer legal
identity. Partner identity is never replaced with the operator's identity.
Placeholder legal information is rejected. Issued lines, commission allocation
and PDF bytes are frozen. An issuance request identifier cannot be reused with
a different source revision, client or due date.

`backend/supplementary_billing.py` allocates the shared sequential number and
publishes the supplementary invoice in **one MongoDB transaction**. Failure
rolls back both changes. Competing draft revisions conflict; retrying the same
issuance returns the already-published invoice. The browser retains the exact
pending request after a failed response; reloading the registry allows the
administrator to check whether the request committed.

Partner commission VAT is frozen using the configured commission VAT rate.
The separately numbered commission invoice and a non-fiscal driver statement
are archived in `billing_documents` in the same transaction. The statement
identifies the gross, commission and net share; it does not invent a VAT regime
or a tax invoice on behalf of the driver. Admin-fulfilled charges do not create
a partner commission document.

With the flag enabled, new initial invoices, quotes, order documents, driver
documents and commissions generated by the existing document service also
allocate their number and archive their PDF transactionally. A concurrent
retry reuses the published archive. When disabled, the legacy document flow is
preserved; it retains its historic allocation limitations. Existing numbering
gaps are never renumbered or concealed.

The counter `counters.invoice_seq` must already be present and audited against
existing documents before activation. A missing counter or an exhausted
six-digit sequence is rejected rather than recreated over existing invoices.

## Credits, refunds and cancellation

An administrator can issue a **full** credit with a mandatory reason. It has
its own number and PDF and reverses the supplementary invoice's reporting
amounts; a matching commission credit is archived for partner courses.
The original PDF is never modified. For a partial correction, credit the
invoice in full and issue the corrected lines separately.

A credit does not move money. Each recorded receipt can then be refunded
separately: Stripe receipts use a durable idempotency key and the original
payment intent; manual receipts require confirmation that the refund was
**already made outside Stripe**. Only a confirmed Stripe success is recorded
as refunded. Pending/unknown refunds retain the operation lock and can be
retried; confirmed failures are recorded and allow a new request.
These controls concern supplementary invoices; historical initial-invoice
refunds remain in the existing course refund workflow.

Cancelling a booking does not erase its invoices or refund supplementary
receipts. Where supplementary invoices exist, the administrative cancellation
API requires their credits first or explicit
`retain_supplementary_invoices=true`. An active external operation blocks
cancellation until reconciled.

## Stripe collection and uncertain outcomes

The client can open **Factures et avoirs complémentaires** on a booking and
pay the remaining supplementary balance with Stripe Checkout. Currency, amount,
invoice, booking, operation UUID and stored session are checked before accepting
the signed webhook. A `complete` session without `payment_status=paid` is not
treated as payment. Duplicate events do not add another receipt.

An invoice is locked before session creation. Manual payments and credits
cannot race an active checkout. The client can resume its session or verify its
status. An expired session releases the lock, but its request cannot be reused.
Lost creation responses are retried with the same provider idempotency key.
After 20 hours an uncertain creation is not automatically repeated: the
administrator can attach a session found in Stripe, subject to all the same
metadata/amount checks. Never manually clear a payment lock in the database.
Provider errors do not fall back to a successful manual payment.

## Brevo delivery

Invoice and credit sends are distinct explicit administrative actions. They use
the exact archived PDF, their own number, and optionally
`BREVO_TEMPLATE_SUPPLEMENTARY_INVOICE` / `BREVO_TEMPLATE_CREDIT_NOTE`.
HTML fallback remains available. No existing Brevo configuration is changed.

The send claim is saved before calling Brevo and has `sending`, `sent` or
`unknown` status. Concurrent sends and repeated confirmed sends are blocked.
An exception, false result or lost response never causes an automatic resend.
Exactly-once delivery across MongoDB and an external email provider cannot be
guaranteed: an administrator must check Brevo and record verification evidence
before marking sent or authorizing another attempt. A still-running claim
cannot be resolved during its first 30 minutes.

## Financial and account screens

Admin aggregate statistics include supplementary amounts as soon as issued,
net of credits, whether paid or not. Separate reporting shows receipts,
refunds, remaining balances and refundable credits. Paid/invoiced courses and
frozen initial invoices are retained in the base reports. Frozen initial
breakdowns are not recomputed with later commission settings.

The financial dashboard provides the complementary register, filtered by
driver. Driver earnings and the invoice summary include the frozen additional
share; driver document screens include partner statements/commission invoices
and commission credits. Customer views never expose commission calculations,
admin audit fields or payment intent identifiers. Access follows the invoice's
frozen driver attribution, not an arbitrary supplied driver identifier.

## MongoDB capability and staging-only activation

The production MongoDB topology is **unknown**. An external database and the
absence of a `replicaSet` option in application code prove neither standalone
nor replica-set operation. No production connection details have been inspected.

`GET /api/admin/billing-capabilities` is restricted to administrators. It runs
`hello` using the API's existing database connection and returns only:
`enabled`, `transactions` (`available`, `unsupported` or `unverified`),
`issuance_available` and a user-facing `reason`. It never returns connection
strings, hosts, replica-set names or credentials. Driver exception text is not
logged by this diagnostic.

Issuance requires both `SUPPLEMENTARY_INVOICES_ENABLED=true` and a replica-set
or sharded topology supporting sessions and the necessary wire version.
An unreachable or unauthorized diagnostic, standalone MongoDB, or transaction
failure produces an explicit error. There is **no nontransactional fallback**.
The topology check is preliminary; the actual transaction must still succeed.
Before production activation, back up `bookings`, `charge_drafts`, `invoices`,
`billing_documents` and `counters`; verify MongoDB permissions, the counter and
the real Stripe webhook/Brevo configuration. Validate legal/tax content with
the responsible accountant and exercise the end-to-end flow in isolated staging
with test provider accounts. Do not share production connection details.

Administrator APIs under
`/api/admin/bookings/{booking_id}/supplementary-invoices` provide list/issue,
`/{invoice_id}/pdf` and `/{invoice_id}/payments`. Reading archives and recording
received payments remain available if issuance is subsequently disabled.
Additional actions are `/credit`, `/refund/{payment_id}`, `/email/{kind}`,
`/email/{kind}/resolve` and `/resolve-checkout`. The separate initial endpoint is
`/api/admin/bookings/{booking_id}/initial-invoice-with-charges`.
Client/document/payment routes are under `/api/billing/bookings/{booking_id}`.
The driver register is `/api/driver/supplementary-invoices`; the admin report is
`/api/admin/financial/supplementary`.

Focused validation:

```sh
python -m unittest tests.test_charge_drafts tests.test_supplementary_ledger \
  tests.test_supplementary_billing tests.test_supplementary_api \
  tests.test_billing_workflow
```

Real-database transaction/concurrency/rollback tests run when `MONGO_TEST_URL`
points to an **isolated test replica set**. Standalone refusal is verified when
`MONGO_STANDALONE_TEST_URL` points to an **isolated standalone test server**.
They create disposable `econnect_billing_test_*` databases, never production
collections. No real payment, email or production invoice is triggered.

## Existing invoice PDFs

New client invoice PDFs are saved with their metadata and reused verbatim.
Invoices generated before this change have no archived original in the database:
their current download still regenerates the PDF, and cannot be represented as
an original copy. A PDF sent to Brevo may have been attached to the email, but
its past delivery and recoverability must be confirmed separately with Brevo or
the recipient. Never overwrite an original with a reconstructed PDF.

The current initial invoice notification still uses `BREVO_TEMPLATE_INVOICE`;
its historic delivery guarantees are not retroactively changed by the separate
supplementary send registry.
