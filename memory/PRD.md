# Econnect VTC - Product Requirements Document

## Original Problem Statement
Améliorer le site VTC econnect-vtc.com avec:
- Design luxueux noir et doré
- Système de connexion clients/chauffeurs/admin
- Admin pour envoyer les courses aux chauffeurs
- Système de tarification par gamme de véhicule avec tarif minimum

## User Personas
- **Clients**: Réservation de courses VTC avec choix de gamme
- **Chauffeurs**: Réception et gestion des courses assignées
- **Administrateur**: Gestion globale (chauffeurs, courses, clients, tarifs)

## What's Been Implemented (Jan 2026)

### Backend (FastAPI + MongoDB)
- **Auth System**: JWT tokens (24h), bcrypt hashing, 3 rôles
- **Booking System**: CRUD, workflow status, prix estimé
- **Vehicle Categories**: 4 gammes par défaut, CRUD admin
- **Price Estimation**: Calcul automatique avec tarif minimum
- **Email Service**: SendGrid prêt pour notifications

### Frontend (React + Tailwind)
- **Landing Page**: Hero, Services, Booking, Testimonials, Footer, WhatsApp
- **Auth Pages**: Login, Register
- **Client Dashboard**: Stats, historique, nouvelle réservation avec sélection véhicule
- **Driver Dashboard**: Courses assignées, status, disponibilité
- **Admin Dashboard**: Stats, réservations, chauffeurs, clients, **tarifs**

### Système de Tarification
| Gamme | Prix/km | Tarif Minimum |
|-------|---------|---------------|
| Berline | 2.50€ | 25.00€ |
| Van | 3.00€ | 35.00€ |
| Luxe | 4.00€ | 50.00€ |
| Green | 2.80€ | 30.00€ |

**Logique**: Si `distance × prix/km < tarif_minimum` alors `prix_final = tarif_minimum`

### API Endpoints

#### Public
- GET /api/vehicle-categories - Catégories actives
- POST /api/estimate-price?distance_km=X - Estimation prix

#### Admin
- GET/POST/PUT/DELETE /api/admin/vehicle-categories
- Toutes les routes existantes (stats, bookings, drivers, clients)

## Test Credentials
- **Admin**: admin@econnect-vtc.com / admin123

## Prioritized Backlog

### P0 (Critique) - DONE ✅
- [x] Design noir et doré
- [x] Système d'authentification
- [x] Dashboards client/driver/admin
- [x] Assignation des courses
- [x] Système de tarification par gamme

### P1 (Important)
- [ ] Intégration Google Maps API pour calcul distance auto
- [ ] Notifications email SendGrid
- [ ] Numéro WhatsApp réel

### P2 (Nice to have)
- [ ] Google OAuth login
- [ ] Historique complet des courses
- [ ] Notifications push
- [ ] Export factures PDF

## Tech Stack
- Backend: FastAPI, Motor (MongoDB), PyJWT, bcrypt, SendGrid
- Frontend: React 19, Tailwind CSS, Framer Motion, Phosphor Icons
- Database: MongoDB
