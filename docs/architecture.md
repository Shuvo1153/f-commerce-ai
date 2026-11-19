# Architecture

F-Commerce uses a modular NestJS backend, a Next.js presentation layer, and PostgreSQL for marketplace data.

- Browser clients call versioned NestJS APIs at `/api/v1`.
- The Next.js server proxies `/api/v1` requests to NestJS so local and tunneled presentation links use the same origin.
- NestJS owns authentication, authorization, validation, transactions, and action execution.
- Prisma and PostgreSQL provide the marketplace source of truth.
- The authenticated shopping assistant sends a limited active-product catalog to OpenAI through the backend; the API key remains server-side and the assistant cannot perform transactions.
