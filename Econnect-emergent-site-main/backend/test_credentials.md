# Test Credentials

## Admin Account
- **Email**: admin@econnect-vtc.com
- **Password**: admin123
- **Role**: admin

## Auth Endpoints
- POST /api/auth/register - Register new client
- POST /api/auth/login - Login
- POST /api/auth/logout - Logout
- GET /api/auth/me - Get current user

## Admin Endpoints
- GET /api/admin/stats - Dashboard stats
- GET /api/admin/bookings - All bookings
- PUT /api/admin/bookings/{id}/assign - Assign to driver
- GET /api/admin/drivers - All drivers
- POST /api/admin/drivers - Create driver
- DELETE /api/admin/drivers/{id} - Delete driver
- GET /api/admin/clients - All clients
- GET /api/admin/vehicle-categories - All vehicle categories
- POST /api/admin/vehicle-categories - Create category
- PUT /api/admin/vehicle-categories/{id} - Update category
- DELETE /api/admin/vehicle-categories/{id} - Delete category

## Public Endpoints
- GET /api/vehicle-categories - Active vehicle categories
- POST /api/estimate-price?distance_km=X - Estimate prices

## Driver Endpoints
- GET /api/driver/bookings - Driver's bookings
- PUT /api/driver/bookings/{id}/status - Update status
- PUT /api/driver/availability - Set availability

## Client Endpoints
- POST /api/bookings - Create booking
- GET /api/bookings/my - My bookings

## Default Vehicle Categories
- Berline: 2.50€/km, min 25€
- Van: 3.00€/km, min 35€
- Luxe: 4.00€/km, min 50€
- Green: 2.80€/km, min 30€
