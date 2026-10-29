# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Carte CARTO en production

La carte Leaflet utilise le fond raster CARTO Dark Matter. Obtenez une
**clé CARTO Basemaps** depuis https://carto.com/basemaps/apikey/ ou votre
offre CARTO compatible. Ne supposez pas qu'un API Access Token Workspace
avec la permission Maps peut remplacer cette clé : le service Basemaps
documente une clé passée via `?key=`, pas `api_key`.
Voir la [documentation officielle des fonds raster](https://github.com/CartoDB/basemap-styles#1-web-raster-basemaps).

Restreignez la clé aux domaines `https://econnect-vtc.com/*` et, si utilisé,
`https://www.econnect-vtc.com/*` dans les réglages du fournisseur. Accordez
uniquement les permissions nécessaires aux fonds de carte et vérifiez que
votre offre autorise l'usage commercial.

Sur la machine qui construit le frontend, créez `frontend/.env.production`
(ou `.env.production` si vous êtes déjà dans `frontend`) :

```dotenv
REACT_APP_CARTO_API_KEY=votre_cle_basemaps
```

Ce fichier est ignoré par Git. Ne commitez pas la clé et ne la partagez pas
dans une issue ou une pull request. `.env.example` fournit le nom attendu
sans valeur. Une clé absente ou vide affiche un message d'indisponibilité
au lieu de demander des tuiles non authentifiées.

Exécutez `npm run build` depuis `frontend`. Create React App charge
`.env.production` et intègre `REACT_APP_CARTO_API_KEY` dans les fichiers
JavaScript à la compilation. Une variable déjà définie dans le shell ou la CI
est prioritaire, suivie de `.env.production.local`, `.env.local`,
`.env.production` et `.env`. Une variable définie seulement dans le backend
ou après le build ne modifie pas la carte.

La clé est visible dans le frontend public : les restrictions côté CARTO
restent indispensables. Pour vérifier le déploiement, ouvrez la carte sur
le domaine autorisé et contrôlez dans l'onglet Réseau du navigateur que les
requêtes `dark_all` contiennent `key`, aboutissent sans erreur et affichent
des tuiles sans filigrane. Ne partagez pas ces URL complètes.
L'attribution OpenStreetMap/CARTO doit rester visible.

Transférez ensuite le contenu de `frontend/build/` vers la racine du site
sur le VPS. Si un rechargement Nginx est nécessaire, validez d'abord sa
configuration avec `sudo nginx -t`, puis lancez `sudo systemctl reload nginx`.
Tout changement de clé nécessite un nouveau build et un redéploiement.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
