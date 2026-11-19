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
   npm.cmd run prisma:migrate -w backend
   npm.cmd run prisma:seed -w backend
   ```
6. Start the applications:
   ```bash
   npm.cmd run dev
   ```

Run `npm.cmd run dev` from the project root or the `frontend` folder to start both the frontend and backend together. The storefront runs at `http://localhost:3000`.

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

