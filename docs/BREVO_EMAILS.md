# Brevo Transactional Emails (Econnect VTC)

## 1) Prérequis domaine d’envoi

1. Créer/valider l’expéditeur dans Brevo.
2. Authentifier le domaine avec SPF + DKIM.
3. Ajouter une politique DMARC (minimum `p=none`, recommandé `quarantine`/`reject` ensuite).
4. Vérifier que `BREVO_SENDER_EMAIL` appartient à ce domaine.

## 2) Variables d’environnement backend

Configurer dans l’hébergeur (jamais dans Git) :

- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`
- `BREVO_TEMPLATE_ACCOUNT_ACTIVATION`
- `BREVO_TEMPLATE_PASSWORD_RESET`
- `BREVO_TEMPLATE_BOOKING_CREATED`
- `BREVO_TEMPLATE_QUOTE_AVAILABLE`
- `BREVO_TEMPLATE_PAYMENT_CONFIRMED`
- `BREVO_TEMPLATE_DRIVER_ASSIGNED`
- `BREVO_TEMPLATE_BOOKING_COMPLETED`
- `BREVO_TEMPLATE_INVOICE`
- `BREVO_TEMPLATE_CANCELLATION`
- `BREVO_TEMPLATE_ADMIN_MESSAGE`

> Les IDs de templates sont optionnels. Quand un ID est absent/invalide (non entier positif), le backend bascule automatiquement vers le HTML interne existant.

## 3) Correspondance templates ↔ événements métier

| Template env | Événement |
|---|---|
| `BREVO_TEMPLATE_ACCOUNT_ACTIVATION` | Activation de compte |
| `BREVO_TEMPLATE_PASSWORD_RESET` | Réinitialisation mot de passe |
| `BREVO_TEMPLATE_BOOKING_CREATED` | Course créée pour un client existant |
| `BREVO_TEMPLATE_QUOTE_AVAILABLE` | Devis disponible (réservé pour flux devis) |
| `BREVO_TEMPLATE_PAYMENT_CONFIRMED` | Paiement confirmé |
| `BREVO_TEMPLATE_DRIVER_ASSIGNED` | Chauffeur/course assignée |
| `BREVO_TEMPLATE_BOOKING_COMPLETED` | Course terminée (réservé) |
| `BREVO_TEMPLATE_INVOICE` | Facture disponible (PDF joint) |
| `BREVO_TEMPLATE_CANCELLATION` | Annulation / remboursement |
| `BREVO_TEMPLATE_ADMIN_MESSAGE` | Message administratif (invitation client) |

## 4) Paramètres dynamiques envoyés

Syntaxe Brevo dans le template : `{{ params.CLIENT_NAME }}`.

- **Activation compte**: `CLIENT_NAME`, `ACTIVATION_URL`, `ACTIVATION_EXPIRY_HOURS`
- **Reset mot de passe**: `CLIENT_NAME`, `RESET_URL`, `RESET_EXPIRY_HOURS`
- **Course créée (client)**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `DISTANCE_KM`, `AMOUNT`, `PAYMENT_MODE`, `BOOKING_URL`
- **Chauffeur assigné**: `CLIENT_NAME`, `CLIENT_PHONE`, `CLIENT_EMAIL`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `TRANSFER_TYPE`, `NOTES`, `ORDER_DOWNLOAD_URL`
- **Paiement confirmé**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `AMOUNT`, `CURRENCY`, `BOOKING_URL`
- **Facture**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `AMOUNT`, `BOOKING_URL`
- **Annulation / remboursement**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `AMOUNT`, `REFUND_STATUS`, `REFUND_CURRENCY`, `STRIPE_REFUND_ID`, `BOOKING_URL`
- **Message administratif**: `CLIENT_NAME`, `CLIENT_EMAIL`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `DISTANCE_KM`, `AMOUNT`, `REGISTER_URL`

## 5) Fallback HTML

Si aucun template Brevo n’est configuré pour un flux, l’email continue à partir du HTML généré par `build_email_html()` (comportement historique conservé).

## 6) Pièces jointes (factures PDF)

Les factures restent envoyées en pièce jointe PDF via Brevo (base64 + nom de fichier).

## 7) Procédure de test avant production

1. Configurer `BREVO_API_KEY` + sender.
2. Laisser les IDs de templates vides et tester les envois (fallback HTML).
3. Créer les templates Brevo puis renseigner les IDs.
4. Retester :
   - activation compte ;
   - reset mot de passe ;
   - réservation créée ;
   - paiement confirmé ;
   - facture PDF ;
   - annulation/remboursement.
5. Vérifier la délivrabilité et les logs Brevo (sans données sensibles).

## 8) Transactionnel vs marketing

- Les emails décrits ici sont **transactionnels** (réservation, compte, facture, paiement).
- Les campagnes marketing/newsletters et la gestion de consentement opt-in/opt-out ne font pas partie de cette intégration.
