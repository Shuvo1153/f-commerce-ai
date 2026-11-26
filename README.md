# F-Commerce Marketplace

E-commerce marketplace based on the supplied technical architecture.

## Services

- `frontend`: Next.js customer storefront
- `backend`: NestJS REST API and Prisma database layer
- Groq: product discovery assistant (requires an API key)
- PostgreSQL: marketplace source of truth

## Quick start

1. Copy `.env.example` to `.env`.
2. Set `GROQ_API_KEY` in `.env` to enable the shopping assistant. The store works without it.
3. Start PostgreSQL:
   ```bash
   docker compose up -d postgres
   ```
4. Install JavaScript dependencies:
   ```bash
   npm.cmd install
   ```
5. Configure the database:
   ```bash
   npm.cmd run db:migrate
   npm.cmd run db:seed
   ```
6. Start the applications:
   ```bash
   npm.cmd run dev
   ```

Run `npm.cmd run dev` from the project root or the `frontend` folder to start both the frontend and backend together. The storefront runs at `http://localhost:3000`.

## Product inventory

Sellers enter a product's available quantity when publishing it and can view and update the exact quantity from the business dashboard. Customers only see whether a product is in stock or out of stock; exact quantities are not included in public product responses. Products with zero stock remain visible but cannot be added to the cart or ordered. Stock is reserved atomically when an order is placed to prevent overselling, and is returned if an online payment fails or is cancelled.

The inventory migration carries over the sum of existing variant quantities. Products without variant quantities start at zero, so sellers should verify and enter their actual stock in the dashboard after migrating.

## Shared cloud database (Supabase)

The backend uses PostgreSQL, so every group member can share the same records by pointing their backend at the same Supabase project:

1. Create a Supabase project and a **public** Storage bucket named `product-images`.
2. In the project’s database settings, use the **session-pooler** connection string (port `5432`) for `DATABASE_URL` and `DIRECT_URL`. The direct connection may require IPv6; the transaction pooler is mainly for stateless/serverless connections.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` using the project URL and server-side secret key. Keep the key private on the backend; never put it in frontend code or commit `.env`.
4. Set the same `JWT_SECRET` on every backend instance, then apply the schema:
   ```powershell
   npm.cmd run db:deploy
   ```
5. To preserve records from the current local PostgreSQL database, first make sure the Supabase database is empty and the migration above has succeeded. In Ubuntu/WSL, export and import the table data (this preserves user and product IDs; do not run the seed command first):
   ```bash
   read -rsp "Supabase direct connection URL: " DIRECT_URL; echo
   sudo -u postgres pg_dump --data-only --no-owner --no-acl \
     --exclude-table=public._prisma_migrations --dbname=fcommerce \
     > /tmp/fcommerce-data.sql
   psql "$DIRECT_URL" --set=ON_ERROR_STOP=on --file=/tmp/fcommerce-data.sql
   ```
   Keep the dump until you have checked the cloud data. It contains account data, so protect it and remove it when no longer needed.
6. Back in the project folder, run `npm.cmd run storage:migrate` to copy existing local product images into the Supabase bucket and update their database URLs.

Each member must configure their backend `.env` with the same `DATABASE_URL` and `JWT_SECRET`. Every backend that accepts product image uploads also needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, kept private on the server. For Docker Compose, also set `COMPOSE_DATABASE_URL` to the cloud database URL. New user accounts, products, orders, and other database records will then be shared. Product images uploaded while Supabase Storage is configured will also be shared.

## Online payments (bKash and Nagad)

Checkout supports cash on delivery and SSLCommerz hosted online payments. Customers who select online payment are redirected to SSLCommerz, where available methods (including bKash or Nagad, subject to the merchant account’s enabled channels) can be selected. The backend verifies successful transactions with SSLCommerz before marking an order paid.

1. Create an SSLCommerz sandbox account and add its `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD` to the backend `.env`.
2. Keep `SSLCOMMERZ_IS_LIVE=false` while testing. Change it to `true` only after replacing the sandbox credentials with production credentials.
3. Set `PUBLIC_BACKEND_URL` and `FRONTEND_URL` to the externally reachable HTTPS URLs of the backend and storefront for hosted checkout. The localhost values in `.env.example` are for local configuration only; SSLCommerz must be able to reach the backend callback and IPN URLs.
4. Configure the SSLCommerz IPN URL in the merchant panel as `{PUBLIC_BACKEND_URL}/api/v1/payments/sslcommerz/ipn`.

Online payments are limited to ৳10–৳500,000 per order, following the SSLCommerz API limits. Keep all gateway credentials on the backend and never commit `.env`.

## Presentation link

Install Cloudflare Tunnel once:

```powershell
winget install --id Cloudflare.cloudflared --exact
```

Stop any running development command, then run this from the `frontend` folder:

```powershell
npm.cmd run present
```

The terminal prints a temporary public `https://…trycloudflare.com` link. Share it while the command remains running; press `Ctrl+C` to close it. The link is public, so use demo data and stop the tunnel after your presentation.

