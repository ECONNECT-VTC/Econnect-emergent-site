# Legal documents and booking consent

## Status and editorial review

The three French seed drafts (`terms`, `legal-notice`, `privacy`) are **suggestions,
not legal advice or approval for deployment**. Nothing is published automatically.
An administrator must complete the real company/professional/tax identifiers,
contacts, hosting details, consumer mediator and referral procedure, and validate
transport/cancellation information. Privacy bases, recipients, transfers, retention
and operational rights handling need validation. Retention proposals are not
promises of automatic deletion.

The privacy proposal reflects JWT HTTPOnly authentication cookies, booking/contact/
coordinate/payment information, Stripe (not storage of full card numbers), Brevo
transactional email, backend-proxied Photon/OSRM queries, and browser-side CARTO
tiles with a public key. **PostHog is loaded by the public HTML; a compliant
analytics/cookie consent manager is not established by this feature.** Audit its
actual events/storage, implement any required controls, and complete that explicit
placeholder before publication. CGV acceptance is not analytics consent.

Future content updates require **no code changes, deployment or restart**. In the
admin editor, saving replaces the draft only; publication is a separate deliberate
action. Each content edit should reset the UI review checkbox. The API saves the
explicit `review_confirmed` value; publication requires it to be true and rejects
explicit `[À COMPLÉTER …]`, `[A COMPLETER …]`, TODO, TBD and FIXME markers (422).
Ordinary prose is not heuristically classified as incomplete. Human review remains
necessary: this marker gate is not legal validation.

## Administrator workflow

After the initial feature deployment, open **Documents légaux** in the administrator
menu (`/fr/admin/legal-documents`). Choose CGV, Mentions légales or Confidentialité.
Edit the title, section headings and paragraph fields; add or remove blocks as
needed. Preview does not save or publish. Save the draft, confirm the completed
review, save that confirmation, then publish using the separate confirmation.
The history opens read-only snapshots, not editable replacements.

The footer links to `/fr/conditions-generales`, `/fr/mentions-legales` and
`/fr/politique-confidentialite` (with the active language prefix). Before the first
publication, those pages indicate that no document has been published. Publishing
a text does not change application fees, refund logic, retention or tracker behavior.

## API contract

All admin endpoints call the existing `require_admin` helper, which authenticates
via `get_current_user` and requires role `admin` (401/403 otherwise).

- `GET /api/admin/legal-documents`: `{documents: [record, ...]}`, all three kinds.
- `PUT /api/admin/legal-documents/{kind}/draft`:
  `{revision, title, sections: [{heading, paragraphs: [string]}], review_confirmed}`.
- `POST /api/admin/legal-documents/{kind}/publish`: `{revision}`.
- Both writes return the current single record:
  `{kind, title, draft: {title, sections, review_confirmed}, revision,
  published_version, history: [{version, published_at, published_by, title}], guidance}`.
- `GET /api/admin/legal-documents/{kind}/versions/{version}`: immutable snapshot
  `{kind, version, title, sections, published_at, published_by}`.
- `GET /api/legal-documents/{kind}?version=<optional>`: current/archived published
  snapshot `{kind, version, title, sections, published_at}`; no drafts or publisher.
- `GET /api/legal-documents/{kind}/{version}/pdf`: PDF of that immutable snapshot.

Unknown kinds/versions and unpublished documents return 404. Title max 200,
heading max 300, paragraph max 12000 characters; text is trimmed and nonempty.
Sections and paragraph arrays are nonempty (max 100 sections, 200 paragraphs per
section), with an overall 200000-character document limit. Extra fields, coerced booleans and noninteger/negative revisions are
rejected. Version identifiers are opaque 32-character UUID hex strings.

`GET /api/booking-terms` preserves `{enabled, version, title, sections}`. Once CGV
are published, consent becomes enabled automatically without restarting the server.
Unset/blank `BOOKING_TERMS_ENABLED` means automatic; explicit `false` is an emergency
kill switch. `true` cannot activate unpublished text. Without published CGV this
endpoint returns the legacy draft with `enabled: false`. Generic public endpoints
never expose this draft as current. An explicit historical terms lookup for the
registered legacy version returns the pinned original with `published_at: null`
(no reliable publication timestamp is available). Both generic current JSON
endpoints send `Cache-Control: no-store`. `GET /api/booking-terms/{version}/pdf` remains compatible
with published Mongo snapshots and the original legacy asset `2026-11-04`.

## Persistence, concurrency and archives

`legal_documents` uses `_id = kind` and stores `{draft, revision, published_version,
history}`. First admin reads initialize drafts through `$setOnInsert`. Legal notice
and privacy seeds live in `backend/assets/legal-documents/`; CGV reuse the immutable
legacy asset plus an explicit missing-information marker. Initialization never
replaces saved content and never publishes.

`legal_document_versions` stores immutable snapshots under `_id = kind:uuid`.
There is deliberately no API to edit/delete archives. Back up both collections
alongside bookings; restrict database write access. Published versions referenced
by bookings must not be deleted or altered.

Both saves and publications atomically compare the submitted revision and increment
it. A conflicting save/publication returns 409; reload/reconcile rather than
overwriting another administrator's work. Publication inserts the snapshot first,
then atomically updates the pointer and pushes history only if the revision still
matches. It never writes the draft. Standalone MongoDB works without transactions.
A failed compare-and-swap can leave an orphan snapshot: **all public/admin version
reads and PDF downloads require membership in the document's published history**,
so orphans are not accessible. Do not treat raw snapshot presence as publication.
Database errors propagate explicitly; there is no silent fallback to static text.
A referenced missing snapshot is an explicit integrity error.

## Consent and transactional email

Both client booking creation routes await the current published CGV before any
booking/payment side effect. When enabled, they require a strict true acceptance
and the current version; false/missing/stale consent returns 422. The server saves
`terms_accepted`, `terms_version` and its own UTC `terms_accepted_at`; a client
timestamp is not trusted. When disabled, supplied consent is discarded. Admin/
legacy bookings acquire no fabricated consent.

Subsequent publication never changes that saved version. Confirmation emails
fetch the **accepted archived snapshot**, not the current publication or draft,
attach its PDF plus the quote, and include the version-specific PDF link in Brevo
template and fallback HTML. Legacy original-version evidence remains supported.
Missing versions, snapshot corruption, PDF failures and database errors stop email
generation rather than silently sending a different document. PDFs contain the
immutable text, not a signature certificate; bytes may vary with PDF metadata.

If `BREVO_TEMPLATE_PAYMENT_CONFIRMED` selects a hosted Brevo template, update that
template separately to display the optional parameters `CGV_VERSION`, `CGV_URL`,
`TOTAL_AMOUNT`, `PAID_AMOUNT`, `REMAINING_BALANCE` and `CANCELLATION_SUMMARY`.
Attachments are supplied through the Brevo API in either template mode.

## Initial rollout

This feature requires one initial backend/frontend deployment, not authorized by
this draft PR. Preserve the existing environment. In particular, an existing
`BOOKING_TERMS_ENABLED=false` remains a kill switch: publication will not enable
checkout acceptance until that setting is removed/blanked and the backend restarted.
Do not remove it or publish incomplete texts without an explicit operational and
legal review. Subsequent text publications in automatic mode need no restart.
Back up both legal collections and bookings before rollout.

## Validation

Run the backend unittest suite, or the focused legal/consent/email/payment tests:

```sh
python -m unittest tests.test_legal_documents tests.test_booking_terms tests.test_stripe_checkout
```

Tests use mocked Mongo collections and cover authorization, seeded drafts,
explicit review/placeholder gates, strict validation, optimistic concurrency,
orphan isolation, immutable archives/PDFs, live activation, consent evidence and
Brevo attachments in both template modes. No deployment is implied.
