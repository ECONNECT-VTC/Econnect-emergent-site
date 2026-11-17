# Econnect Emergent Site

## Carte et adresses de réservation

Voir [`docs/BOOKING-MAP.md`](./docs/BOOKING-MAP.md) pour l'utilisation,
les services de géocodage/routage et le déploiement du frontend.

## Paiement Stripe

Voir la documentation d'intégration et de configuration webhook :

- [`docs/STRIPE.md`](./docs/STRIPE.md)

## Espaces privés : attente et apparence

Les espaces chauffeur/admin enregistrent l'arrivée et l'attente avec un barème
configurable et des frais validés par l'administration, sans facturation
automatique. Voir [`docs/INVOICE-CHARGES.md`](./docs/INVOICE-CHARGES.md).

Un bouton **Mode clair / Mode sombre** est disponible en haut des espaces
admin, client et chauffeur. La préférence est conservée dans ce navigateur
(`econnect-dashboard-theme`). Le thème couvre aussi les fenêtres et listes
déroulantes, mais est retiré à la sortie de l'espace privé : accueil public,
réservation publique, connexion et documents légaux conservent leur apparence.

## Statuts course et paiement

- Statuts course API: `pending` → `received` → `assigned` → `in_progress` → `completed`
- Statuts course complémentaires: `cancellation_requested`, `cancelled`
- Statuts paiement: `pending`, `paid`, `failed`, `not_required`, `refunded`, `partially_refunded`
- Modes de paiement création admin: `immediate` (invitation de règlement), `deferred` (paiement différé)
