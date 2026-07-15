# Perps V2 - Backend Completion Plan

## Phase 1: Critical Bug Fixes (Engine Core)

These bugs break correctness and must be fixed first.

---

### 1.1 `handleCurrentPrice` — Price never updates the Map

**File:** `apps/engine/src/engine/price.ts:14`

**Bug:** Line 14 assigns `markPrice = payload.price` to a local variable instead of updating the Map. Price never propagates after the initial set.

**Fix:** Replace `markPrice = payload.price` with `MARKPRICE.set(payload.symbol, payload.price)`.

```ts
// BEFORE (broken)
markPrice = payload.price;

// AFTER (fixed)
MARKPRICE.set(payload.symbol, payload.price);
```

---

### 1.2 `handleBalanceChecks` — Empty function, no margin validation

**File:** `apps/engine/src/engine/balance.ts:62-64`

**Bug:** `handleBalanceChecks()` body is empty. Called from `createOrder.ts:13` but does nothing — any order passes regardless of balance.

**Fix:** Implement actual margin check:

```ts
const handleBalanceChecks = (
  userId: string,
  quantity: number,
  price: number,
  leverage: number
) => {
  const balance = BALANCES.get(userId);
  if (!balance) {
    throw new Error("User balance not found");
  }

  const requiredMargin = (quantity * price) / leverage;
  if (balance.available < requiredMargin) {
    throw new Error("Insufficient balance");
  }

  // Lock the margin
  balance.available -= requiredMargin;
  balance.locked += requiredMargin;

  return requiredMargin;
};
```

**Also update** `apps/engine/src/engine/createOrder.ts:11-14` to pass the correct arguments:

```ts
// BEFORE
const risk = riskEngine(data);
if (risk) {
  handleBalanceChecks();
}

// AFTER
const risk = riskEngine(data);
if (risk) {
  handleBalanceChecks(data.userId, data.quantity, data.price, data.leverage);
}
```

---

### 1.3 `positionAccounting` — `realizedPnl` overwritten on each close

**File:** `apps/engine/src/engine/position.ts:107`

**Bug:** On full close (case 1, `new_qty == 0`), line 107 does `position.realizedPnl = calculatePnl` instead of accumulating across partial closes.

**Fix:**

```ts
// BEFORE
position.realizedPnl = calculatePnl;

// AFTER
position.realizedPnl = (position.realizedPnl ?? 0) + calculatePnl;
```

---

### 1.4 `positionAccounting` — Position not removed from map on full close

**File:** `apps/engine/src/engine/position.ts:102-112`

**Bug:** When `new_qty == 0`, the position entry remains in `POSITION` with `size: 0` instead of being cleaned up.

**Fix:** After the balance updates in the `new_qty == 0` block, delete the position:

```ts
if (new_qty == 0) {
  const exitPrice = new_notional_value / Math.abs(incoming_signed_exposure);
  const calculatePnl = position.size > 0
    ? updateRealizedPnlLong(position.averageEntryPrice, position.size, exitPrice)
    : updateRealizedPnlShort(position.averageEntryPrice, position.size, exitPrice);

  position.realizedPnl = (position.realizedPnl ?? 0) + calculatePnl;
  balances.available += calculatePnl + balances.locked;
  balances.locked -= position.margin;

  POSITION.delete(order.userId + order.symbol);  // <-- ADD THIS
  return;
}
```

---

### 1.5 `positionAccounting` — Flip case doesn't lock new margin

**File:** `apps/engine/src/engine/position.ts:131-151`

**Bug:** On position flip, `balances.locked -= position.margin` releases old margin but doesn't lock the new margin for the flipped position.

**Fix:** After setting the new margin on line 146, lock it on the balance:

```ts
// After line 146: position.margin = Math.abs(new_qty) * exitPrice / order.leverage;
balances.locked += position.margin;  // <-- ADD THIS
```

---

### 1.6 Market orders use price filter (should match all liquidity)

**File:** `apps/engine/src/engine/createOrder.ts:191-277, 463-555`

**Bug:** Market buy at line 192: `if (price == data.price)` — market orders should match ALL available liquidity regardless of price. Same for market sell at line 467.

**Fix:** For `Type.Market`, remove the price filter entirely:

- **Market buy** (in `handleBuyOrder`): Walk all asks ascending (cheapest first) until quantity is filled. No price check.
- **Market sell** (in `handleSellOrder`): Walk all bids descending (best bid first) until quantity is filled. No price check.

```ts
// Market buy — change the inner loop condition
// BEFORE
if (price == data.price) { ... }

// AFTER (for market orders only)
// Remove the price check entirely, just iterate all asks ascending
```

For limit orders, keep the existing price filters (`price <= data.price` for buys, `price >= data.price` for sells).

---

### 1.7 Cancel order authorization — verify fix

**File:** `apps/engine/src/engine/deleteOrder.ts:21-24`

**Status:** The code at line 21-24 checks `order.userId != payload.userId` and throws. This should already work. The test at line 522-526 tests this scenario.

**Action:** Run the test suite to verify. If test passes, mark as fixed. If not, ensure the throw happens before `order.status = OrderStatus.Cancelled` at line 60.

---

### 1.8 Liquidation — buffer check direction wrong for shorts

**File:** `apps/engine/src/engine/liquidation.ts:14-15`

**Bug:** `const bufferedPrice = p.liquidationPrice + (p.liquidationPrice * 0.1)` always adds buffer. For shorts, liquidation price is ABOVE entry, so buffer should subtract.

**Fix:**

```ts
// BEFORE
const bufferedPrice = p.liquidationPrice + (p.liquidationPrice * 0.1);

// AFTER
const buffer = p.liquidationPrice * 0.1;
const bufferedPrice = p.side === Side.Buy
  ? p.liquidationPrice + buffer   // long: buffer above liq price
  : p.liquidationPrice - buffer;  // short: buffer below liq price
```

---

### 1.9 Liquidation — size check uses `> 1` instead of `> 0`

**File:** `apps/engine/src/engine/liquidation.ts:17`

**Bug:** `const side = p.size > 1 ? Side.Buy : Side.Sell` — positions with size exactly 1 won't be liquidated.

**Fix:** Use `p.side` directly instead of deriving from size:

```ts
// BEFORE
const side = p.size > 1 ? Side.Buy : Side.Sell;

// AFTER — derive liquidation order side from position side
const closeSide = p.side === Side.Buy ? Side.Sell : Side.Buy;
```

Then use `closeSide` in the `handleCreateOrder` calls below.

---

### 1.10 Liquidation — full rewrite of liquidation logic

**File:** `apps/engine/src/engine/liquidation.ts`

After fixing 1.8 and 1.9, the entire function should be cleaned up:

```ts
const checkLiquidation = (markPrice: number, streamId: string) => {
  const positions = POSITION.values();
  positions.forEach((p) => {
    // Update unrealized PnL
    if (p.size > 0) {
      p.realizedPnl = updateUnrealizedPnlLong(p.averageEntryPrice, p.size, markPrice);
    } else {
      p.realizedPnl = updateUnrealizedPnlShort(p.averageEntryPrice, p.size, markPrice);
    }

    // Check if position should be liquidated
    const shouldLiquidate = p.side === Side.Buy
      ? markPrice <= p.liquidationPrice  // long: price dropped below liq
      : markPrice >= p.liquidationPrice; // short: price rose above liq

    // Buffer zone check — skip if within 10% buffer
    const buffer = p.liquidationPrice * 0.1;
    const bufferedPrice = p.side === Side.Buy
      ? p.liquidationPrice + buffer
      : p.liquidationPrice - buffer;

    const inBuffer = p.side === Side.Buy
      ? markPrice > bufferedPrice
      : markPrice < bufferedPrice;

    if (shouldLiquidate && !inBuffer && Math.abs(p.size) > 0) {
      const closeSide = p.side === Side.Buy ? Side.Sell : Side.Buy;
      handleCreateOrder({
        userId: p.userId,
        symbol: p.symbol,
        price: markPrice,
        quantity: Math.abs(p.size),
        side: closeSide,
        type: Type.Market,
        leverage: 0,
      }, streamId);
    }
  });
};
```

---

### 1.11 Funding rate — sign logic is broken

**File:** `apps/engine/src/engine/fundingRate.ts:18-40`

**Bug:** When `fundingRate < 0` (mark < index), shorts should pay longs. But line 37 `balance.available -= funding` where `funding` is negative means shorts RECEIVE instead of paying.

**Fix:** Use absolute funding amount and explicit payer/receiver logic:

```ts
const fundingRate = (markPrice - indexPrice) / indexPrice;
const absFundingRate = Math.abs(fundingRate);

for (const [key, position] of POSITION) {
  const notional_value = Math.abs(position.size) * position.averageEntryPrice;
  const funding = notional_value * absFundingRate;
  const balance = BALANCES.get(position.userId);
  if (!balance) continue;

  if (fundingRate > 0) {
    // Longs pay shorts
    if (position.side === Side.Buy) {
      balance.available -= funding;
    } else {
      balance.available += funding;
    }
  } else if (fundingRate < 0) {
    // Shorts pay longs
    if (position.side === Side.Sell) {
      balance.available -= funding;
    } else {
      balance.available += funding;
    }
  }
  // fundingRate === 0 → no payment

  const event: FundingPaymentEvent = {
    eventId: crypto.randomUUID(),
    userId: position.userId,
    fundingRate,
    market: position.market,
    paymentAmount: funding,
    streamId,
    timestamp: Date.now(),
    type: EngineEvents.FundingPaymentEvent,
  };
}
```

---

### 1.12 Engine dispatcher — inconsistent payload passing for `handleCurrentPrice`

**File:** `apps/engine/src/engine/engine.ts:41-43`

**Bug:** Line 42 passes `request` (full EngineRequest) to `handleCurrentPrice`, while all other handlers receive `request.payload`. Inconsistency.

**Fix:** Update `engine.ts` line 42 and `price.ts` to accept payload directly:

```ts
// engine.ts line 42
// BEFORE
handleCurrentPrice(request);

// AFTER
handleCurrentPrice(request.payload);
```

```ts
// price.ts
// BEFORE
const handleCurrentPrice = (request: EngineRequest) => {
  const payload = request.payload as { symbol: string; price: number };
  ...

// AFTER
const handleCurrentPrice = (payload: unknown) => {
  const data = payload as { symbol: string; price: number };
  ...
```

---

### 1.13 Backend cancel order doesn't send symbol

**File:** `apps/backend/src/controllers/exchange.controller.ts:33-36`

**Bug:** `cancelOrderController` sends `{ orderId, userId }` but `DeleteOrderPayload` requires `symbol`. Engine's `handleDeleteOrder` reads `payload.symbol`.

**Fix:**

```ts
// exchange.controller.ts
const sendToEng = await sendToEngine(EngineRequestOptions.CancelOrder, {
  orderId: body.orderId,
  userId: req.id,
  symbol: body.symbol,  // <-- ADD THIS
});
```

**Also update** `apps/backend/src/types/exchange.types.ts` to include `symbol` in `cancelOrderSchema`:

```ts
export const cancelOrderSchema = z.object({
  orderId: z.string(),
  symbol: z.string(),  // <-- ADD THIS
});
```

---

## Phase 2: Infrastructure Fixes

### 2.1 `db_polar` reads from wrong Redis stream

**File:** `apps/db_polar/index.ts:13`

**Bug:** `[{ key: "redis_test", id: ">" }]` should be `[{ key: "engine_events", id: ">" }]`.

**Fix:**

```ts
// BEFORE
const response = await client.xReadGroup("group_yash", "consumer-db-polar", [{ key: "redis_test", id: ">" }]);

// AFTER
const response = await client.xReadGroup("group_yash", "consumer-db-polar", [{ key: "engine_events", id: ">" }]);
```

---

### 2.2 Snapshot service uses wrong stream name

**File:** `apps/snapshot_service/index.ts:20`

**Bug:** `client.xAdd("engine-data", ...)` uses hyphen. Engine reads from `"engine_data"` (underscore).

**Fix:**

```ts
// BEFORE
await client.xAdd("engine-data", "*", { ... });

// AFTER
await client.xAdd("engine_data", "*", { ... });
```

---

### 2.3 Snapshot service `while(true)` with `setTimeout` is broken

**File:** `apps/snapshot_service/index.ts:17-25`

**Bug:** `while(true)` with `setTimeout` inside creates an infinite loop that fires setTimeouts without blocking. The loop spins at full speed creating thousands of timers.

**Fix:** Replace with `setInterval`:

```ts
const takeSnapShotService = () => {
  setInterval(async () => {
    await client.xAdd("engine_data", "*", {
      data: JSON.stringify(event),
    });
    console.log("Snapshot command sent");
  }, 60000);
};

takeSnapShotService();
```

---

### 2.4 Negative deposit amounts allowed

**File:** `apps/engine/src/engine/balance.ts:41`

**Bug:** `handleAddBalance` accepts negative amounts, allowing balance to go negative.

**Fix:** Add validation at the top of `handleAddBalance`:

```ts
if (data.amount <= 0) {
  throw new Error("Deposit amount must be positive");
}
```

---

## Phase 3: Missing Engine Features

### 3.1 Implement `ClosePosition` command handler

**Files:**
- `packages/types/index.ts` — add `ClosePositionPayload` type
- `apps/engine/src/engine/closePosition.ts` — new file
- `apps/engine/src/engine/engine.ts` — add to dispatcher

**Type definition:**

```ts
// packages/types/index.ts
export interface ClosePositionPayload {
  userId: string;
  symbol: string;
}
```

**Handler implementation:**

```ts
// apps/engine/src/engine/closePosition.ts
import { Side, Type, type ClosePositionPayload, type HandleResult, type CreateOrderResponse } from "types";
import { POSITION } from "../store/store";
import { handleCreateOrder } from "./createOrder";

export const handleClosePosition = (
  payload: unknown,
  streamId: string
): HandleResult<CreateOrderResponse> => {
  const data = payload as ClosePositionPayload;
  const position = POSITION.get(data.userId + data.symbol);

  if (!position) {
    throw new Error("No open position found");
  }

  // Create a market order to close the position
  const closeSide = position.side === Side.Buy ? Side.Sell : Side.Buy;
  const result = handleCreateOrder({
    userId: data.userId,
    symbol: data.symbol,
    price: 0, // market order, price doesn't matter
    quantity: Math.abs(position.size),
    side: closeSide,
    type: Type.Market,
    leverage: position.leverage,
  }, streamId);

  return result;
};
```

**Dispatcher update** (`engine.ts`):

```ts
if (request.type == EngineRequestOptions.ClosePosition) {
  const response = handleClosePosition(request.payload, streamId);
  const response_object: EngineResponse = {
    correlationId: request.correlationId,
    ok: true,
    data: response.response,
  };
  for (const event of response.events) {
    sendToEngineStream(event);
  }
  ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = streamId;
  return response_object;
}
```

---

### 3.2 Implement trading fees

**Files:**
- `packages/types/index.ts` — add fee fields
- `apps/engine/src/engine/createOrder.ts` — deduct fees on fills
- `apps/engine/src/engine/balance.ts` — fee deduction helper

**Fee constants:**

```ts
// packages/types/index.ts or a new fees.ts
export const MAKER_FEE_RATE = 0.001; // 0.1%
export const TAKER_FEE_RATE = 0.001; // 0.1%
```

**Update `Fill` type:**

```ts
interface Fill {
  orderId: string;
  makerId: string;
  takerId: string;
  makerOrderId: string;
  takerOrderId: string;
  filledQty: number;
  price: number;
  marked: boolean;
  fee: number;  // <-- ADD THIS
}
```

**Fee deduction in `createOrder.ts`:** After each fill, calculate and deduct fee:

```ts
const fee = matchingQty * sellingOrder.price * TAKER_FEE_RATE;
const buyerBalance = BALANCES.get(data.userId);
if (buyerBalance) buyerBalance.available -= fee;

const sellerBalance = BALANCES.get(sellingOrder.userId);
if (sellerBalance) sellerBalance.available -= fee;
```

---

### 3.3 Implement engine state recovery from snapshots

**Files:**
- `apps/engine/src/engine/snapshot.ts` — add `loadSnapshot` function
- `apps/engine/index.ts` — call on startup

**Implementation:**

```ts
// apps/engine/src/engine/snapshot.ts
export const loadSnapshot = (filePath: string) => {
  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  // Restore all Maps
  BALANCES.clear();
  for (const [k, v] of Object.entries(content.balances)) {
    BALANCES.set(k, v as Balance);
  }

  ORDER.clear();
  for (const [k, v] of Object.entries(content.orders)) {
    ORDER.set(k, v as Order);
  }

  ORDERBOOK.clear();
  for (const [k, v] of Object.entries(content.orderbooks)) {
    const ob = v as { asks: [number, RestingOrder[]][]; bids: [number, RestingOrder[]][] };
    ORDERBOOK.set(k, {
      asks: new BTree(ob.asks),
      bids: new BTree(ob.bids),
    });
  }

  POSITION.clear();
  for (const [k, v] of Object.entries(content.positions)) {
    POSITION.set(k, v as Position);
  }

  MARKPRICE.clear();
  for (const [k, v] of Object.entries(content.MarkPrices)) {
    MARKPRICE.set(k, v as number);
  }

  LASTTRADEDPRICE.clear();
  for (const [k, v] of Object.entries(content.IndexPrice)) {
    LASTTRADEDPRICE.set(k, v as number);
  }

  ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = content.last_procccessed_command_id;
};

export const loadLatestSnapshot = () => {
  if (!fs.existsSync(snapshotDir)) return false;
  const files = fs.readdirSync(snapshotDir)
    .filter((f) => f.startsWith("snapshot-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) return false;

  loadSnapshot(path.join(snapshotDir, files[0]));
  return true;
};
```

**Startup integration** (`apps/engine/index.ts`):

```ts
const main = async () => {
  const recovered = loadLatestSnapshot();
  if (recovered) {
    console.log("Engine state recovered from snapshot");
  } else {
    seedOrderBook();
  }
  // ... rest of main loop
};
```

---

## Phase 4: Backend API Endpoints

### 4.1 Market Data GET Endpoints

**File:** `apps/backend/src/routes/exchange.route.ts`

**New endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/orderbook/:symbol` | No | Top N levels of bids/asks |
| `GET` | `/api/positions` | Yes | User's open positions |
| `GET` | `/api/orders` | Yes | User's open orders |
| `GET` | `/api/orders/history` | Yes | User's order history from DB |
| `GET` | `/api/trades` | Yes | User's trade history from DB |
| `GET` | `/api/balance` | Yes | User's balance |

**Engine commands needed:**

Add new `EngineRequestOptions` enum values:
- `GetOrderbook` — returns top N price levels
- `GetPositions` — returns positions for a userId
- `GetOrders` — returns open orders for a userId
- `GetBalance` — returns balance for a userId

Each needs a handler in the engine that reads from the in-memory Maps and returns the data.

**Controller examples:**

```ts
// GET /api/orderbook/:symbol
export const getOrderbookController = async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const response = await sendToEngine(EngineRequestOptions.GetOrderbook, { symbol });
  res.status(200).json(response.data);
};

// GET /api/positions
export const getPositionsController = async (req: Request, res: Response) => {
  const response = await sendToEngine(EngineRequestOptions.GetPositions, { userId: req.id });
  res.status(200).json(response.data);
};

// GET /api/balance
export const getBalanceController = async (req: Request, res: Response) => {
  const response = await sendToEngine(EngineRequestOptions.GetBalance, { userId: req.id });
  res.status(200).json(response.data);
};
```

**DB query endpoints** (for history):

```ts
// GET /api/orders/history
export const getOrderHistoryController = async (req: Request, res: Response) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.status(200).json(orders);
};

// GET /api/trades
export const getTradeHistoryController = async (req: Request, res: Response) => {
  const trades = await prisma.fills.findMany({
    where: {
      OR: [{ maker_id: req.id }, { taker_id: req.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.status(200).json(trades);
};
```

---

### 4.2 WebSocket Server for Real-time Updates

**New file:** `apps/backend/src/ws/server.ts`

**Implementation:**

```ts
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "../utils/token";
import { subscriberClient } from "../utils/engine_request";

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
}

export const setupWebSocketServer = (server: any) => {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: AuthenticatedSocket, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(1008, "Authentication required");
      return;
    }

    try {
      const decoded = verifyToken(token);
      ws.userId = decoded.userId;
    } catch {
      ws.close(1008, "Invalid token");
      return;
    }

    ws.on("close", () => {
      console.log(`Client ${ws.userId} disconnected`);
    });
  });

  // Listen to engine events and broadcast
  const broadcastLoop = async () => {
    while (true) {
      const messages = await subscriberClient.xRead(
        [{ key: "engine_events", id: "$" }],
        { BLOCK: 0 }
      );
      if (!messages) continue;

      for (const msg of messages[0].messages) {
        const event = JSON.parse(msg.message.event as string);
        wss.clients.forEach((client: AuthenticatedSocket) => {
          if (client.readyState === WebSocket.OPEN) {
            // Send relevant events only
            client.send(JSON.stringify(event));
          }
        });
      }
    }
  };

  broadcastLoop();
};
```

---

## Phase 5: Type & Schema Improvements

### 5.1 Prisma Schema — Use Float instead of Int for prices

**File:** `packages/db/prisma/schema.prisma`

**Bug:** `price Int`, `quantity Int`, `averageEntryPrice Int` — crypto prices are decimal. $50,123.45 gets truncated to 50123.

**Fix:** Change `Int` to `Float` for all price/quantity fields:

```prisma
model Order {
  ...
  quantity  Float    // was Int
  price     Float    // was Int
  leverage  Float    // was Int
  ...
}

model Fills {
  ...
  qty  Float  // was Int
  ...
}

model Position {
  ...
  averageEntryPrice Float  // was Int
  averageExitPrice  Float  // was Int
  pnl               Float  // was Int
  size              Float  // was Int
  ...
}
```

Then run `bunx prisma migrate dev` to apply.

---

### 5.2 Add `symbol` field to `cancelOrderSchema`

**File:** `apps/backend/src/types/exchange.types.ts`

```ts
export const cancelOrderSchema = z.object({
  orderId: z.string(),
  symbol: z.string(),  // <-- ADD THIS
});
```

---

## Phase 6: Test Updates

### 6.1 Update tests to match fixed behavior

After all fixes, run `bun test` and update expectations:

- **Liquidation tests** (lines 1083-1183): Should now pass with corrected buffer/side logic
- **Market order tests** (lines 384-449): Should now pass since market orders match all liquidity
- **Balance check tests** (lines 1243-1273): Should now throw on insufficient balance
- **Funding rate tests** (lines 949-1077): Negative rate test should now pass
- **Position tests** (lines 812-853): Full close should remove position from map
- **Flip tests** (lines 855-904): Should now correctly lock new margin

### 6.2 New tests to add

- `ClosePosition` command — creates market order, closes position
- Trading fees — fee deducted on each fill, balance reflects fees
- Engine recovery — load snapshot, verify all Maps populated
- GET endpoints — orderbook, positions, orders, balance return correct data
- WebSocket — connection, authentication, event broadcast

---

## Execution Order

```
Phase 1 (Bug Fixes)           ← Do first, makes existing features work
  1.1  Price update fix
  1.2  Balance checks
  1.3  realizedPnl accumulation
  1.4  Position removal on close
  1.5  Flip margin locking
  1.6  Market order price filter
  1.7  Cancel order auth (verify)
  1.8  Liquidation buffer direction
  1.9  Liquidation size check
  1.10 Liquidation rewrite
  1.11 Funding rate sign
  1.12 Dispatcher payload consistency
  1.13 Cancel order missing symbol

Phase 2 (Infra Fixes)         ← Quick wins, high impact
  2.1  db_polar wrong stream
  2.2  Snapshot service wrong stream name
  2.3  Snapshot service loop fix
  2.4  Negative deposit validation

Phase 3 (Engine Features)     ← Core missing features
  3.1  ClosePosition handler
  3.2  Trading fees
  3.3  Snapshot recovery

Phase 4 (API Endpoints)       ← Client-facing
  4.1  GET endpoints
  4.2  WebSocket server

Phase 5 (Type/Schema)         ← Data integrity
  5.1  Prisma Float types
  5.2  Cancel order schema

Phase 6 (Tests)               ← Verify everything
  6.1  Update existing tests
  6.2  Add new tests
```

**Estimated scope:** ~15-20 files touched, ~500-700 lines changed/added.
