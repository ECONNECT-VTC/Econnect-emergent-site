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
- `BREVO_TEMPLATE_DRIVER_ASSIGNED_CLIENT`
- `BREVO_TEMPLATE_DRIVER_DOCUMENTS`
- `BREVO_TEMPLATE_BOOKING_COMPLETED`
- `BREVO_TEMPLATE_INVOICE`
- `BREVO_TEMPLATE_CANCELLATION`
- `BREVO_TEMPLATE_ADMIN_MESSAGE`

> Les IDs de templates sont optionnels. Quand un ID est vide, absent ou invalide (non entier positif), le backend bascule automatiquement vers le HTML interne existant. Les emails devis disponible et course terminée sont donc envoyés même sans template Brevo configuré.

> Un devis régénéré depuis le statut `DRAFT` peut déclencher un nouvel email ; une nouvelle génération depuis `QUOTE_SENT` ne renvoie pas le devis.

## 3) Correspondance templates ↔ événements métier

| Template env | Événement |
|---|---|
| `BREVO_TEMPLATE_ACCOUNT_ACTIVATION` | Activation de compte |
| `BREVO_TEMPLATE_PASSWORD_RESET` | Réinitialisation mot de passe |
| `BREVO_TEMPLATE_BOOKING_CREATED` | Course créée pour un client existant |
| `BREVO_TEMPLATE_QUOTE_AVAILABLE` | Devis disponible |
| `BREVO_TEMPLATE_PAYMENT_CONFIRMED` | Paiement confirmé |
| `BREVO_TEMPLATE_DRIVER_ASSIGNED` | Course assignée (email au chauffeur, inchangé) |
| `BREVO_TEMPLATE_DRIVER_ASSIGNED_CLIENT` | Chauffeur assigné (email au client, même sans compte, y compris auto-affectation avec véhicule de flotte) |
| `BREVO_TEMPLATE_DRIVER_DOCUMENTS` | Passage à `COMPLETED` (email au chauffeur avec ses trois PDF) |
| `BREVO_TEMPLATE_BOOKING_COMPLETED` | Course terminée |
| `BREVO_TEMPLATE_INVOICE` | Facture disponible (PDF joint) |
| `BREVO_TEMPLATE_CANCELLATION` | Annulation / remboursement |
| `BREVO_TEMPLATE_ADMIN_MESSAGE` | Message administratif (invitation client) |

## 4) Paramètres dynamiques envoyés

Syntaxe Brevo dans le template : `{{ params.CLIENT_NAME }}`.

- **Activation compte**: `CLIENT_NAME`, `ACTIVATION_URL`, `ACTIVATION_EXPIRY_HOURS`
- **Reset mot de passe**: `CLIENT_NAME`, `RESET_URL`, `RESET_EXPIRY_HOURS`
- **Course créée (client)**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `DISTANCE_KM`, `AMOUNT`, `PAYMENT_MODE`, `BOOKING_URL`
- **Devis disponible**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `AMOUNT`, `BOOKING_URL`
- **Chauffeur assigné**: `CLIENT_NAME`, `CLIENT_PHONE`, `CLIENT_EMAIL`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `TRANSFER_TYPE`, `NOTES`, `ORDER_DOWNLOAD_URL`
- **Chauffeur assigné (client)**: `CLIENT_NAME`, `BOOKING_ID`, `BOOKING_REFERENCE`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `DRIVER_NAME`, `DRIVER_PHONE`, `VEHICLE_MODEL`, `VEHICLE_PLATE`, `BOOKING_URL`
- **Documents chauffeur**: `DRIVER_NAME`, `BOOKING_ID`, `BOOKING_REFERENCE`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `AMOUNT`, `DASHBOARD_URL`
- **Course terminée**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `BOOKING_URL`
- **Paiement confirmé**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `AMOUNT`, `CURRENCY`, `BOOKING_URL`
- **Facture**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `AMOUNT`, `BOOKING_URL`
- **Annulation / remboursement**: `CLIENT_NAME`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `AMOUNT`, `REFUND_STATUS`, `REFUND_CURRENCY`, `STRIPE_REFUND_ID`, `BOOKING_URL`
- **Message administratif**: `CLIENT_NAME`, `CLIENT_EMAIL`, `BOOKING_ID`, `PICKUP_DATE`, `PICKUP_TIME`, `PICKUP_ADDRESS`, `DROPOFF_ADDRESS`, `DISTANCE_KM`, `AMOUNT`, `REGISTER_URL`

Pour « Chauffeur assigné (client) » et « Documents chauffeur », `BOOKING_ID` reste l'identifiant complet pour compatibilité. Utiliser `{{ params.BOOKING_REFERENCE }}` pour la ligne « Référence » et les objets `🚗 Votre chauffeur est assigné – course #{{ params.BOOKING_REFERENCE }}` et `📎 Vos documents – course #{{ params.BOOKING_REFERENCE }}` : cette référence contient les six premiers caractères de l'identifiant, en majuscules.

## 5) Fallback HTML

Si aucun template Brevo n’est configuré pour un flux, l’email continue à partir du HTML généré par `build_email_html()` (comportement historique conservé).

Les deux nouveaux templates suivent aussi ce repli HTML si leur ID est vide. L'email d'affectation client présente uniquement le chauffeur, son téléphone (`-` si absent) et son véhicule (marque + modèle si disponibles), sans mention de rôle administratif. `BOOKING_URL` mène à `/fr/client/bookings`. Les valeurs inconnues sont remplacées par `-`.

L'affectation client est dédupliquée avec `client_driver_notified_driver_id` : une réaffectation à un autre chauffeur déclenche un nouvel email. Les documents sont dédupliqués avec `driver_documents_email_sent_at`. Ces marqueurs sont enregistrés uniquement après un envoi réussi ; une erreur d'email ne bloque ni le statut ni les autres emails.

Une réservation d'envoi atomique (`<marqueur>_pending`) empêche les envois concurrents. Elle est libérée après chaque tentative et peut être reprise après dix minutes si un processus s'est interrompu.

## 6) Pièces jointes (devis et factures PDF)

Les devis et les factures sont envoyés en pièce jointe PDF via Brevo (base64 + nom de fichier).
Leurs noms sont `devis-<ID6>.pdf` et `facture-<ID6>.pdf`.

À la clôture, le chauffeur reçoit uniquement ces trois documents dans un seul email :
- `facture-chauffeur-<ID6>.pdf` (`driver`) ;
- `facture-commission-<ID6>.pdf` (`commission`) ;
- `releve-activite-<ID6>.pdf` (`activity`).

Le bon de commande (`order`) n'est pas joint à cet email ni listé dans son HTML de repli. Il reste accessible via l'email d'affectation et l'espace chauffeur ; les routes de téléchargement sont inchangées.

`ID6` désigne les six premiers caractères de l'identifiant de réservation en majuscules. `AMOUNT` est le montant versé au chauffeur après commission (`driver_earning`), au format `72.00 €`. `DASHBOARD_URL` mène à `/fr/driver`.

Cet email n'est pas envoyé pour les courses `fulfilled_by_admin` : elles n'ont pas de commission et ne concernent pas un compte chauffeur. Les emails client de fin de course et de facture restent envoyés. Les PDF sont joints par le backend lors d'un envoi réel, pas par le bouton « Envoyer un test » de Brevo.

## 7) Procédure de test avant production

1. Configurer `BREVO_API_KEY` + sender.
2. Laisser les IDs de templates vides et tester les envois (fallback HTML).
3. Créer les templates Brevo puis renseigner les IDs.
4. Retester :
   - activation compte ;
   - reset mot de passe ;
   - réservation créée ;
   - devis disponible ;
   - paiement confirmé ;
   - affectation chauffeur côté client (avec/sans compte et auto-affectation) ;
   - course terminée ;
   - documents chauffeur (trois PDF, sans bon de commande, hors courses `fulfilled_by_admin`) ;
   - facture PDF ;
   - annulation/remboursement.
5. Vérifier la délivrabilité et les logs Brevo (sans données sensibles).

## 8) Vérifications Hostinger / production

- Frontend : définir `REACT_APP_API_URL` vers l'URL publique du backend si l'API n'est pas servie sur le même domaine que le frontend.
- Backend : définir `FRONTEND_URL` avec l'URL publique exacte du site pour générer les liens d'activation.
- Backend : définir `CORS_ORIGINS` avec toutes les origines frontend autorisées (Hostinger, domaine principal, `www`, etc.).
- Si `BREVO_API_KEY` ou l'expéditeur Brevo sont absents, la création de compte reste possible mais l'email d'activation ne pourra pas être envoyé tant que la configuration n'est pas corrigée.

## 9) Transactionnel vs marketing

- Les emails décrits ici sont **transactionnels** (réservation, compte, facture, paiement).
- Les campagnes marketing/newsletters et la gestion de consentement opt-in/opt-out ne font pas partie de cette intégration.
