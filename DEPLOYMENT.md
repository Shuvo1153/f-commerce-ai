# Public deployment

The project uses GitHub for code, Supabase for the shared PostgreSQL database
and uploaded images, Render for the NestJS API, and Vercel for the storefront.

## 1. Shared database

1. Create a Supabase project.
2. Create a public Storage bucket named `product-images`.
3. Copy the session-pooler connection string for `DATABASE_URL` and the direct
   connection string for `DIRECT_URL`.
4. Generate a long random `JWT_SECRET`. Keep all credentials private.

## 2. Deploy the API to Render

1. Sign in to Render and create a Blueprint from
   `https://github.com/Shuvo1153/f-commerce-ai`.
2. Select the repository's `render.yaml` and deploy the `f-commerce-api`
   service.
3. In the API service's Environment settings, fill in `DATABASE_URL`,
   `DIRECT_URL`, `JWT_SECRET`, `SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY`. `SUPABASE_STORAGE_BUCKET` is already set to
   `product-images`.
4. Copy the API's public URL. The current configuration uses
   `https://f-commerce-api-w6no.onrender.com`; use the URL shown in your
   Render service if it differs.
5. After creating the Vercel deployment, set `FRONTEND_URL` in Render to the
   Vercel production domain and make sure `PUBLIC_BACKEND_URL` matches the
   Render API URL, then redeploy the API.

The API Docker image runs `npx prisma migrate deploy` before starting the
server. Add `GROQ_API_KEY` if the AI assistant should be enabled. Add SSLCommerz
credentials only if hosted payments are configured.

## 3. Deploy the storefront to Vercel

1. Sign in to Vercel and import
   `https://github.com/Shuvo1153/f-commerce-ai`.
2. Set **Root Directory** to `frontend`.
3. Add the environment variable `BACKEND_URL` with the Render API URL.
4. Deploy, then copy the Vercel production domain into Render's `FRONTEND_URL`.

The frontend proxies API requests through `/api/v1`, so visitors only need
the Vercel website URL. Redeploy the frontend after changing `BACKEND_URL`.
Never add database or service-role credentials to Vercel; those belong only in
the Render API environment.

## 4. Automatic updates and shared data

Both providers are connected to the same GitHub repository and `main` branch.
Vercel deploys frontend changes automatically; Render's Blueprint is configured
to deploy API changes automatically. Members need write access to this GitHub
repository to push or merge changes.

Visitors can register their own accounts on the public Vercel URL. Their user
accounts and associated data are stored in the shared Supabase database, with
application-level ownership separating each user's private records. Product
catalog and seller data are shared across users.

Add group members in GitHub under:
`Settings -> Collaborators -> Add people`.
