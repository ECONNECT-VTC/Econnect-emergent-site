# Carte de réservation

Le formulaire public (`BookingSection`) et l'espace client (`NewBooking`) partagent
la recherche d'adresses, les sélections sur la carte et le calcul du trajet.
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
un itinéraire. Une réservation avec distance attend un tarif valide avant paiement.

## Configuration et déploiement

Variables frontend (voir `frontend/.env.example`) :

- `REACT_APP_GEOCODER_URL` : racine d'un service compatible Photon (`/api/`, `/reverse`).
- `REACT_APP_ROUTING_URL` : racine d'un service compatible OSRM (`/route/v1/driving/…`).
- `REACT_APP_CARTO_API_KEY` : clé publique optionnelle, jamais un secret serveur.

Les valeurs par défaut Photon/OSRM sont des services publics de démonstration,
sans disponibilité garantie. **Avant publication commerciale, configurer des
instances propres ou un fournisseur dont les conditions et quotas autorisent cet
usage**, et vérifier aussi les conditions CARTO. Les services doivent répondre en
HTTPS et autoriser le domaine du site par CORS. Si une politique CSP est appliquée,
autoriser ces services dans `connect-src` et les tuiles CARTO dans `img-src`.
Les recherches transmettent le texte d'adresse au géocodeur, et le routage
transmet les coordonnées au routeur ; adapter l'information de confidentialité.

Ces variables sont intégrées au build : les définir avant `npm run build`.
Avec Node 22.23.4, dans `frontend`, exécuter :

```sh
npm ci --legacy-peer-deps
npm test -- --watchAll=false --runInBand
npm run build
```

Publier le contenu de `frontend/build` avec le mécanisme habituel du VPS, conserver
le repli SPA vers `index.html`, et purger le cache de l'ancien build si nécessaire.
Ce dépôt ne fournit pas de procédure ni d'identifiants de déploiement VPS.
Vérifier sur le domaine publié : une recherche départ/arrivée, les sélections
carte, le tracé, le tarif, la mise à disposition et le retour d'authentification.
