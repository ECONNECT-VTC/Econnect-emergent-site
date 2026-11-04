# Versioned booking terms (backend)

## Release status: DRAFT — no deployment approval

`BOOKING_TERMS_ENABLED=false` is the default. Do not enable this feature in
production until a legal reviewer has approved the text and the real contracting
company's identity, professional/tax identifiers, address/contact information,
and competent consumer mediator's identity, contact details, website and referral
procedure have been completed. Cancellation/refund conditions and passenger
transport consumer information also need review. This implementation is not
legal or deployment approval. It does not introduce cancellation or waiting fees.
Setting the flag to `true` while the current version is the draft **fails backend
startup** with an explicit error. The `APPROVED_TERMS_VERSIONS` allowlist is empty;
it must only gain a new, legally reviewed and complete version. The toggle alone
cannot activate this draft. Readiness is checked again on requests.

The French draft describes the current implementation: a non-payment booking
starts as `DRAFT`; Stripe charges the full displayed amount for card payment,
or a 20% card deposit when the selected balance method is transfer/cash.
Payment confirmation follows server-side verification, including partial payments.

## Canonical, immutable versions

`backend/assets/booking-terms/2026-11-04.json` is the canonical source for both
the public document and its PDF. Its schema is:

```json
{
  "version": "2026-11-04",
  "title": "Conditions générales de vente et de transport",
  "sections": [{"heading": "Section", "paragraphs": ["Paragraph"]}]
}
```

Documents are validated on backend import; malformed/missing assets fail loudly.
Unknown properties are rejected. Version is an ISO-date-shaped string; title,
headings, sections and paragraph collections must be nonempty. The in-memory
models and their section/paragraph tuples are frozen. Only explicit version
entries in `booking_terms.py` are available; request data never selects a path.

**Never edit or delete a registered version**, including this draft. Legal
changes require a new versioned asset, an additional registry entry and an update
to `CURRENT_TERMS_VERSION`. Keep old versions available indefinitely for stored
consent. Add that new version to `APPROVED_TERMS_VERSIONS` only after review and
completion of mandatory information. PDFs are generated from the saved version's text, not the current
version. The PDF is a copy of the versioned text, not a signature certificate;
consent evidence is stored separately on the booking. PDF bytes may differ
between generations due to PDF metadata; the versioned text must not change.

## Public API / frontend contract

The frontend legal page is `/:lang/conditions-generales?version=<version>`,
linked from the footer and consent control. Its PDF link targets the
version-specific backend endpoint below. The shared consent checkbox starts
unchecked. Loading/error states block checkout; a disabled response omits both
the checkbox and consent payload. Auth-resumed drafts must be checked against
the freshly loaded current version: missing acceptance or a stale version
invalidates the saved consent and requires a fresh explicit choice rather than
silently starting checkout.

- `GET /api/booking-terms` returns exactly
  `{enabled, version, title, sections}`. It remains readable when disabled.
- `GET /api/booking-terms/{version}/pdf` returns an attachment named
  `cgv-{version}.pdf`, content type `application/pdf`; unregistered versions
  return 404. Registered historical versions remain downloadable when disabled.
- `POST /api/bookings` and `POST /api/bookings/checkout` accept
  `terms_accepted` (strict JSON boolean, default `false`) and `terms_version`
  (optional strict string, maximum 32 characters). A supplied timestamp is
  never trusted. Unknown input properties follow the existing model's ignore
  behavior.
- When enabled, both consumer routes reject missing/false acceptance or a
  missing/stale version with HTTP 422 and field-specific `detail` errors,
  before authentication, booking/database writes or Stripe session creation.
  The client must reload the canonical document after a stale-version error and
  request fresh acceptance. The checkbox must start unchecked.
- Accepted bookings persist and expose `terms_accepted=true`,
  `terms_version=<current version>`, and server-generated UTC
  `terms_accepted_at`. When disabled, supplied consent values are ignored and
  these fields are stored as `false`, `null`, `null`, respectively. Invalid
  field types still receive normal schema-validation 422 responses.
- Existing bookings are not migrated. Response defaults for absent evidence
  are `false`, `null`, `null`. Admin creation and legacy workflows do not create
  consent. Existing booking-edit field allowlists cannot overwrite consent.

## Payment confirmation / Brevo

For a booking with recorded acceptance, `send_booking_confirmation_to_client`
attaches both its quote and `cgv-{saved version}.pdf` using the existing Brevo
multi-attachment transport. This is independent of the current feature flag.
The fallback HTML includes the accepted version and an absolute PDF download
link using `BACKEND_URL` (fallback: `FRONTEND_URL`).

Update the `BREVO_TEMPLATE_PAYMENT_CONFIRMED` template to display optional
`CGV_VERSION`, `CGV_URL`, `TOTAL_AMOUNT`, `PAID_AMOUNT`, `REMAINING_BALANCE`
and `CANCELLATION_SUMMARY`. The fallback HTML includes the same recap and
non-automatic cancellation/refund reminder, without inventing fees or a barème.
Amounts use stored `estimated_price` and `paid_amount`, preserving zero.
Missing values are shown as unavailable (the balance requires both amounts);
invalid, negative or nonfinite amounts raise an error instead of sending a
misleading recap. Remaining balance is floored at zero. For accepted bookings,
the existing `AMOUNT` parameter also uses the recorded paid amount, never an
assumed full payment. Other existing parameters remain unchanged. The service
passes these CGV parameters only for accepted bookings. Historical/admin/disabled
bookings retain the old confirmation behavior, without CGV claims or attachments.
This update is required for configured dynamic templates: Brevo chooses the
template instead of the fallback HTML, so changing only the HTML is insufficient.
This confirmation previously had no quote attachment; the accepted-terms branch
adds the quote alongside the CGV, leaving legacy behavior unchanged.

PDF generation/unknown saved version/incomplete accepted evidence errors are
not swallowed: no email is sent claiming attachments that could not be generated.
The existing payment/email workflow is not redesigned into a retry queue by
this change; monitor confirmation failures and arrange operational resend
handling before release.

## Rollout

Ship the backend endpoints first with the feature disabled, then the frontend
that dynamically reads the API. Do not deploy or enable the draft on the basis
of these changes. Before any separately approved activation, publish the new
legally reviewed, complete immutable asset, register/approve it in the backend,
update the configured Brevo template, validate the PDF and both consumer flows,
and only then opt in using the environment flag. Disabling again stops new
consent collection but does not remove existing accepted PDFs or confirmation
attachments.

## Validation

Run targeted backend regressions with the existing backend environment:

```sh
python -m unittest tests.test_booking_terms tests.test_stripe_checkout \
  tests.test_invoice_email tests.test_pdf_generation tests.test_email_service
```

`tests/test_booking_terms.py` covers schema validation, both consumer routes,
disabled behavior, timestamp provenance, public version/PDF routing, historical
version selection, Brevo attachments/parameters and non-swallowed PDF failures.
It also verifies that opting in with the unapproved draft fails startup.

The existing `test_email_template` module mutates global third-party modules at
import. Plain discovery therefore contaminates unrelated backend tests. For
whole-suite validation, load and run the other backend modules first, then load
and run `tests.test_email_template` last in the same process. No production code
or unrelated tests were changed to work around that legacy test isolation issue.
