# FETCH Backend

A standalone REST API for the FETCH transportation app: one service per domain
(passengers, riders, services, bookings), a shared in-memory data store, a thin
middleware layer, and one entry point.

## Why it is a separate project

The board asked the transport app to be two completely separate top-level
project — `frontend/` and `backend/` — so each can be built, locked and
deployed independently. The React Native app in `frontend/` talks to this
service through `services/api`; the web preview and its Convex workspace stay
at the repository root and serve the browser build, and stay completely
independent of this backend so nothing is duplicated.

## Stack

- **Runtime:** Node 20+ (ESM), run with `tsx` in dev and `node` from `dist` in
  production.
- **Framework:** Express 4.
- **Data:** A single in-memory store in `src/database/db.ts`. Replace it with
  a real database by editing that one file — the modules only call the store
  interface it exports.
- **Language:** TypeScript throughout (`src` only).
- **Tests:** `src/tests` for the service layer (no Express in there; the
  service modules never import Express).

## Getting started

```bash
cd backend
bun install
bun run typecheck      # back end
bun run test           # service layer tests
bun run dev            # server on http://localhost:4000
```

## Structure

```
backend/
├── src/
│   ├── config/          env and app config (process.env, no dotenv run)
│   ├── database/        in-memory store + seed, and the interface modules call
│   ├── middleware/       request logger, error handler, 404
│   ├── modules/
│   │   ├── passengers/   controller / service / routes / types
│   │   ├── riders/       controller / service / routes / types
│   │   ├── services/     controller / service / routes / types
│   │   └── bookings/     controller / service / routes / types  (status machine lives here)
│   ├── routes/           the router that assembles the module routers
│   └── server.ts         the Express app + listener
├── tests/               service-layer tests (no Express on the import graph)
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

## Booking status lifecycle

```
pending -> accepted -> driver_arriving -> in_progress -> completed
                                     |-> cancelled  (passenger, from pending/accepted/driver_arriving)
```

The state machine lives in `src/modules/bookings/booking.service.ts` and the
RiderStatusRule it enforces is typed against the one list so the frontend and
backend cannot drift. No status change anywhere skips it.

## What "completely separate" means here

- The frontend in `frontend/` runs fully on local mock data. It does **not**
  require this backend, a database, or any auth/payment/external API to be
  running. Swapping the mock implementation for the real one is one file in
  `frontend/src/services/api/index.ts`.
- This backend is the real-server shape those interfaces would talk to. It
  needs no frontend to run and no frontend code at all.
- The web preview and its Convex backend at the repository root are not part
  of this backend. They are a third, independent thing the platform serves
  from the root.
