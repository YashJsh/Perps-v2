# PerpsX

A perpetual futures exchange built from scratch. Real-time order matching, leveraged positions, margin management, funding rates, and live BTC/USD market data from Binance — all running across six coordinated services.

## Architecture

```
                         ┌─────────────────────────┐
                         │       CLIENT LAYER      │
                         │                         │
                         │   Next.js + Zustand     │
                         └───────────┬─────────────┘
                                     │
                       REST          │ WebSocket
                                     │
                    ┌────────────────┴───────────────┐
                    │      GATEWAY / STREAMING       │
                    │                                │
                    │   Express API     WS Server◄───┼── Binance WS
                    └───────┬───────────────▲────────┘
                            │               │
     ┌────────────────┐     │        (engine:events)
     │ FUNDING ENGINE │     ▼               │
     │  (30s Cron)    │ ┌───────────────────┴─────────┐
     └───────┬────────┘ │         REDIS STREAMS       │
             │          │                             │
             └─────────►│ requests  ──► Engine        │
                        │ responses ◄── Engine        │
                        │ events    ──► Consumers     │
                        └───────┬─────────────┬───────┘
                                │             │
                                ▼             │ (engine:events)
              ┌───────────────────────────┐   ▼
              │      MATCHING ENGINE      │ ┌───────────────┐
              │                           │ │   DB POLLER   │
              │ • Single-threaded Bun     │ └───────┬───────┘
              │ • B-Tree Orderbooks       │         │
              │ • Fixed-point arithmetic  │         ▼
              │ • Margin / Leverage checks│ ┌───────────────┐
              └─────────────┬─────────────┘ │  POSTGRESQL   │
                            │               │   (Prisma)    │
                            ▼               └───────────────┘
                     ┌───────────────┐
                     │ SNAPSHOTS DIR │
                     │ (Disk Backup) │
                     └───────────────┘
```

## Services

| Service | Path | Port | What it does |
|---------|------|------|-------------|
| **Engine** | `apps/engine` | — | Single-threaded in-memory matching engine. BTree orderbooks, price-time priority, event-sourced with snapshot recovery |
| **Backend** | `apps/backend` | 3000 | Express REST API. Auth (JWT), order placement, balance deposits. Talks to engine via RPC-over-Redis-Streams |
| **WebSocket** | `apps/websocket` | 8080 | Real-time market data fan-out. Maintains its own orderbook mirror from engine events. Ingests Binance BTC index price |
| **Frontend** | `apps/frontend` | 3001 | Next.js trading UI. TradingView charts, live orderbook, order form, recent trades. Zustand state management |
| **db_poller** | `apps/db_poller` | — | Event consumer. Reads engine events via Redis consumer group, persists to PostgreSQL |
| **Funding Engine** | `apps/funding_engine` | — | Periodic funding rate application (mark vs index price divergence) |

## Shared Packages

| Package | What it does |
|---------|-------------|
| `packages/types` | Shared TypeScript types, enums, event definitions, engine command interfaces |
| `packages/types/src/units.ts` | Fixed-point arithmetic. All money uses integers — no floats. BigInt helpers for safe cross-products |
| `packages/db` | Prisma client + PostgreSQL schema |
| `packages/typescript-config` | Shared `tsconfig` |
| `packages/eslint-config` | Shared ESLint rules |

## Key Design Decisions

**Fixed-point arithmetic** — Prices scale by 10⁴, quantities by 10⁸, money by 10⁴. Cross-products go through BigInt so nothing exceeds 2⁵³. Margin is ceiled, PnL is floored (conservative for the exchange). API boundary speaks decimal strings; integers flow everywhere else.

**Event sourcing** — Every engine state mutation emits an event to `engine:events`. Multiple consumers (WebSocket server, db_poller) read independently. Engine recovers from snapshots + event replay on boot.

**RPC over Redis Streams** — Backend publishes to `engine:requests` with a `correlationId`, then awaits the matching response on `engine:responses`. Decouples the HTTP server from the engine process entirely.

**Single-threaded engine** — Commands process sequentially from one Redis stream. Deterministic ordering is non-negotiable for financial correctness.

## Tech Stack

- **Runtime:** Bun
- **Monorepo:** Turborepo
- **Language:** TypeScript
- **Frontend:** Next.js, Zustand, TradingView Lightweight Charts
- **Backend:** Express, Zod, JWT
- **Database:** PostgreSQL (Prisma ORM)
- **Streams/Cache:** Redis Streams
- **Data structures:** sorted-btree for orderbooks

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Redis](https://redis.io) running on localhost:6379
- [Docker](https://docker.com) (for PostgreSQL)

### Setup

```bash
# Install dependencies
bun install

# Start PostgreSQL
docker run -d --name perps-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=exchange \
  -p 5432:5432 postgres:16

# Run Prisma migrations
cd packages/db && bunx prisma migrate deploy
```

### Run

Six terminals:

```bash
# 1. Engine
cd apps/engine && bun run src/index.ts

# 2. WebSocket server
cd apps/websocket && bun run index.ts

# 3. Backend API
cd apps/backend && bun run dev

# 4. db_poller (optional — persistence)
cd apps/db_poller && bun run index.ts

# 5. Simulator (populates orderbook + generates trades)
cd apps/backend && bun run scripts/simulate.ts

# 6. Frontend
cd apps/frontend && bunx next dev -p 3001
```

Open [http://localhost:3001](http://localhost:3001) — sign in with `demo@perpsx.io` / `demo1234`.

### Engine Tests

```bash
cd apps/engine && bun test
```
