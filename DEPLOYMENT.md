# Public deployment

The project uses GitHub for code, Supabase for the shared PostgreSQL database
and uploaded images, and Render for the storefront and NestJS API.

## 1. Shared database

1. Create a Supabase project.
2. Create a public Storage bucket named `product-images`.
3. Copy the Supabase session-pooler PostgreSQL connection string for
   `DATABASE_URL` and `DIRECT_URL`.
4. Generate a long random `JWT_SECRET` and use the same value for every API
   deployment.

## 2. Deploy the services

In Render:

1. Create a Blueprint from `Shuvo1153/f-commerce-ai` and select `render.yaml`.
2. Set `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY` in the API service.
3. Confirm `BACKEND_URL=https://f-commerce-api.onrender.com` in the storefront.
4. Deploy the Blueprint.

The Blueprint runs `npx prisma migrate deploy` before the API starts.

## 3. Automatic updates

1. In GitHub, create `RENDER_API_DEPLOY_HOOK` and
   `RENDER_STOREFRONT_DEPLOY_HOOK` repository secrets using the deploy hooks
   shown for each Render service.
2. Push or merge a change to `main`.
3. The GitHub Actions workflow deploys both Render services automatically.

## 4. Team access

Add collaborators in GitHub under:
`Settings -> Collaborators -> Add people`.

Everyone who opens the public Render storefront URL will create a separate
account, but all accounts, carts, orders, products, and updates are stored in
the same Supabase database.
