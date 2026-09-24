# Econnect Emergent Site

## Paiement Stripe

Voir la documentation d'intégration et de configuration webhook :

- [`docs/STRIPE.md`](./docs/STRIPE.md)

## Statuts course et paiement

- Statuts course API: `pending` → `received` → `assigned` → `in_progress` → `completed`
- Statuts course complémentaires: `cancellation_requested`, `cancelled`
- Statuts paiement: `pending`, `paid`, `failed`, `not_required`, `refunded`, `partially_refunded`
- Modes de paiement création admin: `immediate` (invitation de règlement), `deferred` (paiement différé)
