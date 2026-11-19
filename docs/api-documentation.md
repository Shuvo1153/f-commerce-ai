# API Documentation

Base URL: `http://localhost:3001/api/v1`

## Core endpoints

- `POST /auth/register` — body: `{ "name": "...", "email": "...", "password": "..." }`
- `POST /auth/login` — body: `{ "email": "...", "password": "..." }`
- `POST /auth/logout`
- `GET /auth/me` — requires `Authorization: Bearer <accessToken>`
- `PATCH /auth/me` — update the signed-in customer’s name or phone
- `PUT /auth/me/address` — create or update the signed-in customer’s default delivery address
- `GET /products`
- `GET /products/:id`
- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:id`
- `DELETE /cart/items/:id`
- `GET /seller/me` — requires `Authorization: Bearer <accessToken>`; returns the signed-in seller profile, their products, and product categories
- `POST /seller/register` — requires `Authorization: Bearer <accessToken>`; body: `{ "businessName": "...", "businessEmail": "...", "businessPhone": "..." }`; creates an immediately active seller profile
- `POST /seller/products` — requires `Authorization: Bearer <accessToken>`; accepts `multipart/form-data` fields for product name, brand, description, category, price, and optional discount price, plus an optional `image` file (JPEG, PNG, or WebP; maximum 5 MB); creates an active product for the signed-in seller
- `GET /seller/product-images/:filename` — serves an uploaded product image
- `GET /seller/dashboard` — requires `Authorization: Bearer <accessToken>`; returns seller products, recent orders, total and monthly sales, and month-over-month growth
- `PATCH /seller/orders/:id/confirm` — requires `Authorization: Bearer <accessToken>`; confirms a pending order belonging to the signed-in seller
- `POST /orders` — requires `Authorization: Bearer <accessToken>`; body: `{ "items": [{ "productId": "...", "quantity": 1 }], "shippingAddress": { "fullName": "...", "phone": "...", "addressLine": "...", "city": "...", "postalCode": "...", "country": "Bangladesh" } }`; creates a cash-on-delivery order using current active product prices
- `GET /orders/mine` — requires `Authorization: Bearer <accessToken>`; returns the signed-in customer’s order and seller-confirmation history
- `POST /ai/chat` — requires `Authorization: Bearer <accessToken>`; body: `{ "message": "...", "history": [] }`
- `GET /health`

Registration creates a customer account with a hashed password. Registration and login return an `accessToken` and basic user profile. Passwords must contain at least eight characters. Product listing is backed by PostgreSQL.

The profile API verifies signed access tokens and returns personal contact information and the default delivery address. The customer storefront keeps its cart in browser storage; placing an order validates active products and prices on the server and saves the delivery address snapshot with the order. The current checkout supports cash on delivery only.

The shopping assistant uses active catalog products and requires the backend `GROQ_API_KEY` setting. Product suggestions are validated against the catalog before being returned.
