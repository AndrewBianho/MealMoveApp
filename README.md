# Meal Move

A food-rescue web app for a campus volunteer organization. Restaurants post
time-sensitive surplus food; volunteers claim a pickup and deliver it to a
drop-off location — a shelter, pantry, or community fridge.

It exists to solve two failure modes that quietly kill volunteer food-rescue
efforts: **volunteers flaking on claimed pickups** (food spoils, restaurants
lose trust), and **loss of institutional memory when founders graduate**.

## Stack

- **Next.js 14** (App Router) + React + TypeScript
- **Tailwind CSS** for all styling — design tokens live in `tailwind.config.ts`
- **Prisma** + PostgreSQL (Supabase)
- **NextAuth.js** (JWT) with five roles: `volunteer`, `restaurant`, `drop_off`,
  `org_admin`, `super_admin`
- **Mapbox GL JS** for the listing and rescue maps
- **Firebase Cloud Messaging** for push, with SMTP email as the fallback
- Deployed on **Vercel**, with cron jobs for the pickup-hold sweep and the
  nightly demo reset

Typography is Fraunces (display), Nunito Sans (UI), and JetBrains Mono
(metadata).

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the values — see the comments in it
npx prisma migrate dev    # create the schema
npm run db:seed           # build the demo world (wipes the database first)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The sign-in page offers
one-click demo logins for each role.

`.env.example` documents every variable, which are required, and where each
value comes from. Only `DATABASE_URL`, `DIRECT_URL`, and `AUTH_SECRET` are
strictly needed to boot; push, email, analytics, and shared-store rate limiting
all degrade gracefully when left unset.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Generate the Prisma client, then build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (node:test) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Wipe and reseed the full demo world |
| `npm run db:demo:reset` | Non-destructive reset of demo data only |
| `npm run db:promote-super-admin` | Promote an account to `super_admin` |
| `npm run sweep` | Run the pickup-hold sweep manually |

CI runs typecheck, tests, and a build on every pull request.

## Documentation

- `../PRODUCT.md` — users, purpose, brand personality, design principles
- `../DESIGN.md` — the "Soft Harvest" design system: color, type, components
- `docs/superpowers/` — per-feature design specs and implementation plans

## Security

Secrets are read from the environment and never committed; `.env` is gitignored.
If you find a security issue, please open a private security advisory on this
repository rather than a public issue.

## License

Licensed under the [Apache License 2.0](LICENSE).

The license covers the source code. The **"Meal Move" name, wordmark, and logo
are reserved** and are not licensed for use in forks or derivative works — see
[NOTICE](NOTICE).
