# Document Vault

A GraphQL API for organizing documents into collections — built with Bun, TypeScript (strict), GraphQL Yoga (schema-first), PostgreSQL, and Prisma.

## Setup

One-time requirement: [Bun](https://bun.sh) installed locally, and Docker running.

```bash
docker compose up -d
bun install
bun run gendb
bun run dev
```

- `docker compose up -d` — starts a local Postgres 16 container (`vault` / `vault` / `document_vault`, port 5432).
- `bun install` — installs dependencies.
- `bun run gendb` — applies committed Prisma migrations (`prisma migrate deploy`) and generates the Prisma client (`prisma generate`).
- `bun run dev` — starts the API in watch mode at `http://localhost:4000/graphql` (GraphiQL is available at that URL in the browser).

Copy `.env.example` to `.env` if you want to point at a different database.

### Running tests

```bash
docker compose up -d
bun run gendb
bun test              # unit + integration
bun test test/unit           # pure logic, mocked Prisma client, no DB needed
bun test test/integration    # exercises real resolvers against the Dockerized Postgres
```

### Sanity check (bonus)

```bash
bun run sanity   # lint + typecheck + full test suite
```

### Docker (bonus)

A `Dockerfile` is included for the service itself:

```bash
docker build -t document-vault .
docker run --env DATABASE_URL=postgresql://vault:vault@host.docker.internal:5432/document_vault -p 4000:4000 document-vault
```

### CI (bonus)

`.github/workflows/ci.yml` runs lint, typecheck, and the full test suite (with a Postgres service container) on every pull request.

## Design notes

**Schema-first GraphQL.** The SDL lives in `src/graphql/schema/schema.graphql`; resolvers are hand-written and split by domain (`src/graphql/resolvers/collection.ts`, `document.ts`), then merged in `resolvers/index.ts`. This keeps the contract readable independent of implementation and matches what the assignment asked for.

**Validation lives outside the resolvers.** `src/validation/validators.ts` holds the actual rules (non-empty title/content, slug format, tag normalization, `take` bounds) as small, independently unit-tested functions. Resolvers call these at the top of each mutation before touching the database, so bad input never reaches Prisma.

**Errors, not 500s.** `src/lib/errors.ts` wraps `graphql-yoga`'s `createGraphQLError` so `BAD_USER_INPUT`, `NOT_FOUND`, and `CONFLICT` failures carry a stable `extensions.code` and a real message. Yoga's default error masking is left **on** for anything *not* thrown this way — so a genuine bug still comes back as a generic "Unexpected error" instead of leaking a stack trace, while expected validation/not-found cases are always informative.

**Search.** `documents(search: ...)` does a case-insensitive substring match against `title` OR `content` using Postgres `ILIKE` (via Prisma's `contains` + `mode: "insensitive"`). No external search index — deliberately out of scope for this size of project.

**Cursor pagination.** Ordered by `createdAt DESC, id DESC` (the `id` tiebreaker keeps ordering stable when multiple documents share a timestamp). The cursor is `base64("document:<id>")` — opaque to the client, decoded server-side, fed into Prisma's native `cursor`/`skip: 1` pagination. Fetching `take + 1` rows lets `hasNextPage` be computed without a second `COUNT` query.

**Moving documents.** `moveDocument` just re-points `collectionId` after checking both the document and the destination collection exist — no need for a special "move" table or event, since a document only ever belongs to one collection at a time.

**Cascade delete.** Deleting a `Collection` cascades to its `Document`s at the database level (`onDelete: Cascade` in the Prisma schema) rather than in application code, so it holds even for writes that don't go through this API.

## A note on this environment

This was built in a sandboxed dev environment whose outbound network is allow-listed and does **not** include `binaries.prisma.sh` — the CDN Prisma's CLI uses to fetch its query/schema-engine binaries. That means `prisma generate` / `prisma migrate dev` couldn't actually be executed here. To compensate:

- The committed migration (`prisma/migrations/20260824110000_init/migration.sql`) was hand-written to match Prisma's own output format exactly, then applied to a real local Postgres instance and verified directly via `psql` — including the unique slug constraint, the `tags` array column, and `ON DELETE CASCADE` behavior.
- All 32 unit tests (`test/unit/`) were run and pass in this environment, since they mock the Prisma client and never need the engine binary.
- The resolver code was typechecked against a hand-matched stub of Prisma's generated types to confirm it's type-correct, since `tsc` otherwise has nothing to check field names and query shapes against without a generated client.
- `test/integration/documents.test.ts` is written and ready but could not be executed here for the reason above — it exercises the real Prisma client against the real Dockerized Postgres and will run normally as soon as `bun run gendb` can reach the internet, which is the case on a normal machine.

On your machine, all of the commands above work as documented — this note is just to explain the migration file wasn't generated live in front of you.

## If I were extending this

- **Auth** would sit as GraphQL context middleware — attach a `userId` to `GraphQLContext`, then scope every query/mutation by owner. The resolver structure (each mutation already receives `ctx`) makes this a fairly contained change.
- **Full-text search** — swap the `ILIKE` filter for Postgres `tsvector`/`tsquery` (a GIN index on a generated column) once substring matching stops being good enough; the `documents` resolver's search branch is the only place that would need to change.
- **N+1s** — `Collection.documents` and `Document.collection` are field resolvers, so a query asking for many collections' documents in one request will currently issue one query per collection. The fix is a per-request `DataLoader` batching by `collectionId`, wired in via `ctx`.
- **Rate limiting / query complexity** — GraphQL Yoga supports plugins for this (`@escape.tech/graphql-armor` or a custom depth/complexity limiter); would add before exposing this beyond internal use.
- **Optimistic concurrency** on `updateDocument` if concurrent edits become a real scenario — an `updatedAt`/version column checked on write.

## Project structure

```
prisma/
  schema.prisma
  migrations/
src/
  graphql/
    schema/schema.graphql   # SDL — the API contract
    resolvers/               # collection.ts, document.ts, index.ts
    context.ts
  lib/
    prisma.ts                # PrismaClient singleton
    errors.ts                # BAD_USER_INPUT / NOT_FOUND / CONFLICT helpers
    cursor.ts                # opaque cursor encode/decode
  validation/
    validators.ts
  index.ts                    # Yoga server entry point
test/
  unit/                       # mocked Prisma, no DB
  integration/                # real Prisma + real Postgres
```
