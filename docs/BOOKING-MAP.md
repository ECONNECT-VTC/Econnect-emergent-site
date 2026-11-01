# Carte de réservation

Le formulaire public (`BookingSection`), l'espace client (`NewBooking`) et
la création administrateur (`AdminBookings`) partagent la recherche d'adresses,
les sélections sur la carte et le calcul du trajet. Les fenêtres d'édition
client (`ClientBookings`) et administrateur utilisent la même logique.
La carte utilise le fond sombre CARTO, deux marqueurs Départ/Arrivée et un tracé doré.
La clé `REACT_APP_CARTO_API_KEY` est optionnelle pour le fond raster public.

## Utilisation

Saisir au moins trois caractères puis choisir une proposition (clic ou flèches et
Entrée). La sélection localise immédiatement l'adresse sur la carte. Une adresse
ambiguë n'est pas choisie automatiquement à la place du client.
On peut aussi activer **Départ** ou **Arrivée** puis cliquer sur la carte :
l'adresse la plus proche est recherchée et renseignée dans le formulaire.

Lorsque les deux adresses sont choisies, le trajet routier, les kilomètres et les
minutes sont calculés. La distance et la durée alimentent l'API existante
`/api/estimate-price` et sont transmises au paiement. La mise à disposition reste
tarifée à l'heure ; l'aller-retour reste géré par l'API de tarification.
La durée affichée est indicative, **hors trafic**. Modifier une adresse invalide
immédiatement le trajet et son tarif, et les réponses obsolètes sont ignorées.
Les adresses géolocalisées et les métriques sont conservées dans le brouillon de
réservation lors du passage par l'authentification.

Si le service de recherche ou de routage échoue, un message est affiché.
La saisie manuelle de distance/durée reste possible sans prétendre avoir calculé
un itinéraire, **mais uniquement après géocodage des deux adresses**.
Une réservation avec distance attend un tarif valide avant paiement ; l'admin
conserve ses prix manuels et modes de paiement existants.

Les créations transmettent `pickup_address`, `dropoff_address`, `pickup_lat`,
`pickup_lng`, `dropoff_lat`, `dropoff_lng`, `distance_km` et `duration_minutes`.
Les coordonnées API sont des nombres décimaux ; Leaflet utilise `[latitude, longitude]`
et OSRM utilise `longitude,latitude`. Les anciennes réservations sans coordonnées
restent lisibles. Toute nouvelle création exige les quatre coordonnées côté
frontend **et backend**. En édition, changer une adresse ou une coordonnée exige
une nouvelle géolocalisation et les nouvelles métriques (ou `null` si le routage
est indisponible), pour ne pas conserver un ancien trajet. Les autres modifications
restent possibles via l'API sans changer les données géographiques.
Les éditions conservent les règles existantes de prix et paiement : recalculer
l'itinéraire ne modifie pas automatiquement un montant déjà payé.

## Protection anti-abus

Le navigateur n'appelle plus directement Photon/OSRM. Les routes backend
`POST /api/map/search` (`{"q":"adresse"}`), `POST /api/map/reverse`
(`{"lat":48.85,"lng":2.35}`) et `POST /api/map/route`
(`{"pickup":{"lat":48.85,"lng":2.35},"dropoff":{"lat":49.01,"lng":2.55}}`)
appellent uniquement les fournisseurs configurés sur le serveur.
Ces nouvelles routes sont implémentées dans `backend/server.py`.

Les quotas couvrent aussi `/api/estimate-price`. Ils sont stockés dans MongoDB
avec incréments atomiques et index TTL, donc partagés entre les workers :

| Budget commun à la recherche, au routage et au tarif | Limite |
|---|---|
| Par IP | 30/minute et 1 000/jour |
| Par compte authentifié, toutes IP confondues | 30/minute et 1 000/jour |
| Global | 300/minute et 10 000/jour |

Il s'agit de fenêtres fixes UTC : deux budgets peuvent se succéder au changement
de fenêtre. Les limites restent appliquées même en cas de cache et avant la
recherche de compte ; les requêtes invalides consomment aussi le budget.
Le dépassement retourne `429` avec `Retry-After`. Une panne du stockage des quotas
bloque les appels (`503`), sans appeler le fournisseur.

Limites supplémentaires : recherche 3–200 caractères, coordonnées finies et
bornées, trajet maximal 5 000 km, durée maximale 10 080 minutes, corps de requête
4 Ko et réception en 3 secondes, réponse fournisseur 512 Ko, délai global
fournisseur 12 secondes. Les URL utilisateur, paramètres supplémentaires et
redirections fournisseur sont refusés. Maximum quatre appels fournisseur
simultanés **par worker** (attente 0,2 seconde puis `429`).
Le cache mémoire conserve au maximum 128 réponses par worker pendant 60 secondes.
Il contient temporairement les réponses d'adresse et utilise des clés hachées.
Les compteurs n'enregistrent pas les adresses ni les IP brutes et expirent après
deux jours ; `JWT_SECRET` doit être fixe et identique sur tous les workers.

Les requêtes d'adresse/coordonnées utilisent un corps POST pour éviter leur
présence dans les URL des journaux d'accès. Le journal HTTPX des requêtes est
désactivé au niveau INFO ; les erreurs ne journalisent ni adresses ni URL complètes.
Ne pas activer des journaux de corps de requête ou des traces HTTP en production.

Le formulaire public reste accessible sans compte. Ces protections réduisent
les abus applicatifs et les surcoûts, mais ne remplacent pas une protection
DDoS/WAF du VPS. Les quotas CARTO, restrictions de domaine de sa clé publique,
alertes et limites contractuelles doivent être configurés chez le fournisseur :
le backend ne peut pas limiter les tuiles demandées directement par le navigateur.

## Configuration et déploiement

Variables frontend (voir `frontend/.env.example`) :

- `REACT_APP_CARTO_API_KEY` : clé publique optionnelle, jamais un secret serveur.
- Configuration API existante : `REACT_APP_API_URL`, `REACT_APP_BACKEND_URL`
  ou configuration runtime (sinon même origine en production).

Variables backend (voir `backend/.env.example`) :

- `MAP_GEOCODER_URL` : racine HTTPS fixe compatible Photon (`/api/`, `/reverse`).
- `MAP_ROUTING_URL` : racine HTTPS fixe compatible OSRM (`/route/v1/driving/…`).
- `JWT_SECRET`, `MONGO_URL`, `DB_NAME` : configuration backend existante.

`REACT_APP_GEOCODER_URL`, `REACT_APP_ROUTING_URL` et la clé Google de l'ancienne
création admin ne sont plus utilisés par les formulaires de réservation.
Le frontend et le backend doivent être mis à jour ensemble : l'ancien frontend
ne transmet pas les coordonnées requises pour les nouvelles créations.

Les valeurs par défaut Photon/OSRM sont des services publics de démonstration,
sans disponibilité garantie. **Avant publication commerciale, configurer des
instances propres ou un fournisseur dont les conditions et quotas autorisent cet
usage**, et vérifier aussi les conditions CARTO. Les services doivent répondre en
HTTPS et être accessibles depuis le backend ; CORS fournisseur n'est plus requis.
Si une politique CSP est appliquée, autoriser l'API Econnect dans `connect-src`
et les tuiles CARTO dans `img-src`.
Les recherches transmettent le texte d'adresse au géocodeur, et le routage
transmet les coordonnées au routeur ; adapter l'information de confidentialité.

Seule la configuration frontend est intégrée au build. La configuration des
fournisseurs s'applique au démarrage du backend. Avec Python 3.11 et Node 22.23.4 :

```sh
python -m pip install -r backend/requirements.txt
python -m unittest tests.test_booking_map tests.test_admin_regressions tests.test_stripe_checkout tests.test_cors_config
python -m compileall -q backend/server.py backend/booking_map.py
cd frontend
npm ci --legacy-peer-deps
npm test -- --watchAll=false --runInBand
npm run build
```

**Aucun déploiement automatique n'est lancé par cette correction.**
Après validation séparée, publier le backend et le contenu de `frontend/build`
avec le mécanisme habituel du VPS, conserver
le repli SPA vers `index.html`, et purger le cache de l'ancien build si nécessaire.
Ce dépôt ne fournit pas de procédure ni d'identifiants de déploiement VPS.
Vérifier sur le domaine publié : une recherche départ/arrivée, les sélections
carte, le tracé, le tarif, la mise à disposition et le retour d'authentification,
dans les trois formulaires et les éditions.
Configurer le proxy pour limiter aussi la taille et le débit des requêtes.
Ne faire confiance aux en-têtes IP (`X-Forwarded-For`) qu'en provenance du proxy
connu, via les réglages Uvicorn `--forwarded-allow-ips`. Le code ne lit pas un
en-tête IP fourni arbitrairement par l'utilisateur. Une mauvaise configuration
peut faire partager le quota du proxy à tous les clients ou permettre son contournement.

## Fichiers de cette correction

```text
.github/workflows/ci.yml
backend/.env.example
backend/booking_map.py
backend/requirements.txt
backend/server.py
docs/BOOKING-MAP.md
frontend/.env.example
frontend/src/components/AddressAutocomplete.jsx
frontend/src/components/AddressAutocomplete.test.js
frontend/src/components/BookingSection.jsx
frontend/src/components/BookingSection.test.js
frontend/src/components/InteractiveMap.jsx
frontend/src/components/ReservationLocationFields.jsx
frontend/src/components/ReservationLocationFields.test.js
frontend/src/hooks/useBookingFormMap.js
frontend/src/hooks/useBookingRoute.js
frontend/src/pages/admin/AdminBookings.jsx
frontend/src/pages/admin/AdminBookings.test.js
frontend/src/pages/client/ClientBookings.jsx
frontend/src/pages/client/ClientBookings.test.js
frontend/src/pages/client/NewBooking.jsx
frontend/src/pages/client/NewBooking.form.test.js
frontend/src/utils/bookingMap.js
frontend/src/utils/bookingMap.test.js
tests/test_booking_map.py
tests/test_stripe_checkout.py
```
