# Public deployment

The project can be shared with all group members using GitHub for code,
Supabase for the shared PostgreSQL database and uploaded images, Vercel for
the Next.js storefront, and Railway for the NestJS API.

## 1. Shared database

1. Create a Supabase project.
2. Create a public Storage bucket named `product-images`.
3. Copy the Supabase session-pooler PostgreSQL connection string for
   `DATABASE_URL` and `DIRECT_URL`.
4. Generate a long random `JWT_SECRET` and use the same value for every API
   deployment.

## 2. Deploy the API

In Railway:

1. Import `Shuvo1153/f-commerce-ai`.
2. Set the service root directory to `backend`.
3. Set these variables:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET=product-images`
   - `GROQ_API_KEY` (optional)
   - `GROQ_MODEL=openai/gpt-oss-20b`
   - `FRONTEND_URL=https://YOUR-VERCEL-DOMAIN`
4. Set the deploy/start command to:
   `npm run prisma:deploy && npm run start`
5. Record the public Railway HTTPS URL.

## 3. Deploy the storefront

In Vercel:

1. Import `Shuvo1153/f-commerce-ai`.
2. Set the root directory to `frontend`.
3. Set `BACKEND_URL=https://YOUR-RAILWAY-DOMAIN`.
4. Deploy.

Vercel proxies browser requests through `/api/v1/*`, so users only need the
single public storefront URL.

## 4. Shared code updates

Any member with repository write access can push or merge a change to `main`.
Vercel and Railway then redeploy from GitHub automatically. For a pull-request
workflow, add a branch and pull request so changes reviewed before merging.

Add collaborators in GitHub under:
`Settings -> Collaborators -> Add people`.
