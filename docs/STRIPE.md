# Intégration Stripe (mode test)

## Variables d'environnement backend

Renseigner dans `backend/.env` :

- `STRIPE_SECRET_KEY` : clé secrète Stripe (test)
- `STRIPE_PUBLISHABLE_KEY` : clé publique Stripe (test)
- `STRIPE_WEBHOOK_SECRET` : secret de signature webhook
- `FRONTEND_URL` : URL frontend utilisée pour `success_url` et `cancel_url`

## Webhook Stripe

- Endpoint backend : `POST /api/stripe/webhook`
- Événement minimum à écouter : `checkout.session.completed`

### Configuration Dashboard Stripe

1. Créer un endpoint webhook vers `https://<backend>/api/stripe/webhook`
2. Sélectionner `checkout.session.completed`
3. Copier le **Signing secret** et le placer dans `STRIPE_WEBHOOK_SECRET`

### En local avec Stripe CLI

```bash
stripe listen --forward-to http://localhost:8001/api/stripe/webhook
```

La commande affiche un secret `whsec_...` à utiliser comme `STRIPE_WEBHOOK_SECRET`.
