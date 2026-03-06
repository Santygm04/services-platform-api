# API ENDPOINTS

## AUTH

POST /api/auth/register-seeker
POST /api/auth/register-provider
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me

POST /api/auth/verify-email
POST /api/auth/resend-verification

POST /api/auth/forgot-password
POST /api/auth/reset-password


## SEEKERS (USUARIOS BUSCADORES)

GET /api/seekers/me
PATCH /api/seekers/me

GET /api/seekers/me/favorites
POST /api/seekers/me/favorites/:providerId
DELETE /api/seekers/me/favorites/:providerId

GET /api/seekers/me/search-history
GET /api/seekers/me/contact-history


## PROVIDERS (PRESTADORES)

GET /api/providers
GET /api/providers/:id

GET /api/providers/me
POST /api/providers/me
PATCH /api/providers/me

GET /api/providers/me/stats


## PORTFOLIO (SOLO PLUS)

POST /api/providers/me/portfolio
DELETE /api/providers/me/portfolio/:itemId


## LINKS EXTERNOS (SOLO PLUS)

POST /api/providers/me/links
PATCH /api/providers/me/links/:linkId
DELETE /api/providers/me/links/:linkId


## SEARCH / BUSCADOR

GET /api/search/providers

GET /api/search/featured
GET /api/search/urgent


## PROFILE VIEWS (VISUALIZACIONES)

POST /api/providers/:id/view

GET /api/providers/me/views
GET /api/providers/me/views/today


## REVIEWS (RESEÑAS)

POST /api/reviews

GET /api/providers/:id/reviews

POST /api/reviews/:reviewId/reply

PATCH /api/reviews/:reviewId/report

DELETE /api/reviews/:reviewId


## VERIFICATION (VERIFICACIÓN DE IDENTIDAD)

POST /api/verifications/dni-front
POST /api/verifications/dni-back
POST /api/verifications/selfie

GET /api/verifications/me

PATCH /api/admin/verifications/:userId/approve
PATCH /api/admin/verifications/:userId/reject


## SUBSCRIPTIONS (PLANES PRESTADOR)

GET /api/subscriptions/me

POST /api/subscriptions/create

PATCH /api/subscriptions/cancel

GET /api/subscriptions/history


## PAYMENTS (MERCADOPAGO)

POST /api/payments/webhook

GET /api/payments/status/:paymentId


## BANNERS / PUBLICIDAD

GET /api/banners/active

POST /api/admin/banners
GET /api/admin/banners
PATCH /api/admin/banners/:bannerId
DELETE /api/admin/banners/:bannerId


## ADMIN GENERAL

GET /api/admin/users
GET /api/admin/users/:userId

PATCH /api/admin/users/:userId/block
PATCH /api/admin/users/:userId/unblock

GET /api/admin/providers
PATCH /api/admin/providers/:providerId/approve

GET /api/admin/reviews
PATCH /api/admin/reviews/:reviewId/hide
DELETE /api/admin/reviews/:reviewId

GET /api/admin/subscriptions

GET /api/admin/metrics


## NOTIFICATIONS / EMAILS

POST /api/notifications/send-verification
POST /api/notifications/send-welcome

POST /api/admin/notifications/promotional

POST /api/notifications/subscription-reminder


## URGENCIAS

GET /api/urgencies/providers

PATCH /api/providers/me/urgency-status