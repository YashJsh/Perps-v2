import {
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { createClient } from "redis";
import BTree from "sorted-btree";
import fs from "fs";
import path from "path";
import {
  EngineRequestOptions,
  OrderStatus,
  Side,
  Type,
  type EngineResponse,
  type CreateOrderResponse,
  type Orderbook,
  type RestingOrder,
} from "types";
import { engineHandlePlease } from "../../engine/src/engine/engine";
import {
  BALANCES,
  FILLS,
  MARKPRICE,
  ORDER,
  ORDERBOOK,
  POSITION,
  LASTTRADEDPRICE,
  ENGINE_META_DATA,
} from "../../engine/src/store/store";
import { sendToEngine, pendingResponse } from "../src/utils/engine_request";
import { takeSnapshot } from "../../engine/src/engine/snapshot";
import { checkLiquidation } from "../../engine/src/engine/liquidation";

const REDIS_URL = "redis://localhost:6379";
const SYMBOL = "BTC-USD";

const testRedis = createClient({ url: REDIS_URL });

const createOrderbook = (): Orderbook => ({
  asks: new BTree<number, RestingOrder[]>(),
  bids: new BTree<number, RestingOrder[]>(),
});

const resetEngineStore = () => {
  BALANCES.clear();
  FILLS.clear();
  MARKPRICE.clear();
  ORDER.clear();
  ORDERBOOK.clear();
  POSITION.clear();
  LASTTRADEDPRICE.clear();
  ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = "0-0";
};

const seedRestingAsk = (price = 100, qty = 2, userId = "seller") => {
  let book = ORDERBOOK.get(SYMBOL);
  if (!book) {
    book = createOrderbook();
    ORDERBOOK.set(SYMBOL, book);
  }
  const resting: RestingOrder[] = [];
  for (let i = 0; i < qty; i++) {
    const orderId = crypto.randomUUID();
    ORDER.set(orderId, {
      orderId,
      userId,
      status: OrderStatus.Open,
      side: Side.Sell,
      type: Type.Limit,
      quantity: 1,
      filledQty: 0,
      remainingQty: 1,
      price,
      symbol: SYMBOL,
      timestamp: Date.now(),
      leverage: 5,
    });
    resting.push({
      orderId,
      userId,
      side: Side.Sell,
      filledQty: 0,
      remainingQty: 1,
      symbol: SYMBOL,
      price,
      timestamp: Date.now(),
    });
  }
  book.asks.set(price, resting);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let abortController: AbortController;
let workers: Promise<void>[];

let workersReadyResolve: () => void;
const workersReady = new Promise<void>((r) => {
  workersReadyResolve = r;
});
let workersReadyCount = 0;

const startEngineConsumer = async (signal: AbortSignal) => {
  const client = createClient({ url: REDIS_URL });
  await client.connect();
  signal.addEventListener("abort", () => client.disconnect(), { once: true });

  let lastId = "$";
  workersReadyCount++;
  if (workersReadyCount >= 2) workersReadyResolve();
  while (!signal.aborted) {
    try {
      const result = await client.xRead(
        [{ key: "engine_data", id: lastId }],
        { BLOCK: 0, COUNT: 100 },
      );
      if (signal.aborted || !result || !result[0]?.messages?.length) continue;

      for (const entry of result[0].messages) {
        lastId = entry.id;
        const data = JSON.parse(entry.message.data);
        const streamId = entry.id;

        let response: EngineResponse | undefined;
        try {
          const res = engineHandlePlease(data, streamId);
          if (res) response = res as EngineResponse;
        } catch (err) {
          response = {
            correlationId: data.correlationId,
            ok: false,
            error: err instanceof Error ? err.message : "Unknown engine error",
          };
        }

        if (response) {
          await client.xAdd("engine_response", "*", {
            response: JSON.stringify(response),
          });
        }
      }
    } catch (err) {
      if (!signal.aborted) {
        console.error("Engine consumer error:", err);
      }
    }
  }
};

const startResponseListener = async (signal: AbortSignal) => {
  const client = createClient({ url: REDIS_URL });
  await client.connect();
  signal.addEventListener("abort", () => client.disconnect(), { once: true });

  let lastId = "$";
  workersReadyCount++;
  if (workersReadyCount >= 2) workersReadyResolve();
  while (!signal.aborted) {
    try {
      const result = await client.xRead(
        [{ key: "engine_response", id: lastId }],
        { BLOCK: 0, COUNT: 100 },
      );
      if (signal.aborted || !result || !result[0]?.messages?.length) continue;

      for (const entry of result[0].messages) {
        lastId = entry.id;
        const data = JSON.parse(entry.message.response) as EngineResponse;
        const pending = pendingResponse.get(data.correlationId);
        if (pending) {
          pending.resolve(data);
          pendingResponse.delete(data.correlationId);
        }
      }
    } catch (err) {
      if (!signal.aborted) {
        console.error("Response listener error:", err);
      }
    }
  }
};

beforeAll(async () => {
  await testRedis.connect();
  abortController = new AbortController();
  workers = [
    startEngineConsumer(abortController.signal),
    startResponseListener(abortController.signal),
  ];
  await workersReady;
  // clear stale entries so workers start fresh
  await testRedis.del("engine_data");
  await testRedis.del("engine_response");
  await sleep(100);
});

beforeEach(async () => {
  resetEngineStore();
});

afterAll(async () => {
  abortController.abort();
  await Promise.all(workers);
  const snapshotDir = path.join(process.cwd(), "snapshots");
  if (fs.existsSync(snapshotDir)) {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
  }
  await testRedis.quit();
});

test("limit buy order is queued and processed with no match", async () => {
  ORDERBOOK.set(SYMBOL, createOrderbook());
  BALANCES.set("user-1", { available: 10_000, locked: 0 });

  const result = await sendToEngine(EngineRequestOptions.CreateOrder, {
    userId: "user-1",
    symbol: SYMBOL,
    price: 100,
    quantity: 1,
    side: Side.Buy,
    type: Type.Limit,
    leverage: 5,
  });

  if (!result.ok) console.log("TEST 1 ERROR:", result.error);
  expect(result.ok).toBe(true);
  expect(result.data).toHaveProperty("filledQty", 0);
  expect(result.data).toHaveProperty("remainingQty", 1);
  expect(result.data).toHaveProperty("orderId");
});

test("limit buy order matches against a resting ask", async () => {
  BALANCES.set("buyer", { available: 10_000, locked: 0 });
  BALANCES.set("seller", { available: 10_000, locked: 0 });
  seedRestingAsk(100, 2, "seller");

  const result = await sendToEngine(EngineRequestOptions.CreateOrder, {
    userId: "buyer",
    symbol: SYMBOL,
    price: 105,
    quantity: 2,
    side: Side.Buy,
    type: Type.Limit,
    leverage: 5,
  });

  if (!result.ok) console.log("TEST 2 ERROR:", result.error);
  expect(result.ok).toBe(true);
  expect(result.data).toHaveProperty("filledQty", 2);
  expect(result.data).toHaveProperty("remainingQty", 0);

  const orderId = (result.data as CreateOrderResponse).orderId;
  const order = ORDER.get(orderId);
  expect(order).toBeDefined();
  expect(order!.filledQty).toBe(2);
  expect(order!.remainingQty).toBe(0);
  expect(order!.status).toBe(OrderStatus.Filled);

  const positionKey = "buyer" + SYMBOL;
  const position = POSITION.get(positionKey);
  expect(position).toBeDefined();
  expect(position!.size).toBe(2);
});

test("multiple concurrent orders all resolve correctly", async () => {
  BALANCES.set("trader-1", { available: 100_000, locked: 0 });
  seedRestingAsk(100, 3, "seller-1");
  seedRestingAsk(101, 3, "seller-2");
  seedRestingAsk(102, 3, "seller-3");

  const results = await Promise.all([
    sendToEngine(EngineRequestOptions.CreateOrder, {
      userId: "trader-1",
      symbol: SYMBOL,
      price: 105,
      quantity: 2,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    }),
    sendToEngine(EngineRequestOptions.CreateOrder, {
      userId: "trader-1",
      symbol: SYMBOL,
      price: 106,
      quantity: 2,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    }),
    sendToEngine(EngineRequestOptions.CreateOrder, {
      userId: "trader-1",
      symbol: SYMBOL,
      price: 107,
      quantity: 2,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    }),
  ]);

  expect(results).toHaveLength(3);
  for (const r of results) {
    if (!r.ok) console.log("TEST 3 ERROR:", r.error);
    expect(r.ok).toBe(true);
    expect(r.data).toBeDefined();
    expect((r.data as CreateOrderResponse).filledQty).toBeGreaterThan(0);
    expect((r.data as CreateOrderResponse).orderId).toBeDefined();
  }

  const allOrders = [...ORDER.values()];
  const openBuyOrders = allOrders.filter(
    (o) => o.side === Side.Buy && o.status !== 1,
  );
  const filledBuyOrders = allOrders.filter(
    (o) => o.side === Side.Buy && o.status === 1,
  );
  expect(openBuyOrders.length + filledBuyOrders.length).toBeGreaterThanOrEqual(
    3,
  );
});

test("snapshot captures full engine state", async () => {
  ORDERBOOK.set(SYMBOL, createOrderbook());
  BALANCES.set("user-1", { available: 5_000, locked: 0 });
  BALANCES.set("user-2", { available: 3_000, locked: 100 });
  ORDER.set("test-order-1", {
    orderId: "test-order-1",
    userId: "user-1",
    status: OrderStatus.Open,
    side: Side.Buy,
    type: Type.Limit,
    quantity: 1,
    filledQty: 0,
    remainingQty: 1,
    price: 100,
    symbol: SYMBOL,
    timestamp: Date.now(),
    leverage: 5,
  });
  POSITION.set("user-1" + SYMBOL, {
    userId: "user-1",
    averageEntryPrice: 100,
    liquidationPrice: 80,
    realizedPnl: null,
    size: 2,
    side: Side.Buy,
    margin: 40,
    leverage: 5,
    symbol: SYMBOL,
    market: SYMBOL,
  });
  LASTTRADEDPRICE.set(SYMBOL, 99_500);
  MARKPRICE.set(SYMBOL, 100_000);
  ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = "999-0";

  const streamId = "1000-0";
  const snapshotResult = takeSnapshot(streamId);

  expect(snapshotResult.event).toBeDefined();
  expect(snapshotResult.event.snapshotId).toBeDefined();
  expect(snapshotResult.event.streamId).toBe(streamId);
  expect(snapshotResult.event.type).toBe("SNAPSHOT_CREATED_EVENT");

  const snapshotDir = path.join(process.cwd(), "snapshots");
  expect(fs.existsSync(snapshotDir)).toBe(true);

  const files = fs.readdirSync(snapshotDir);
  const snapshotFile = files.find((f) =>
    f.includes(snapshotResult.event.snapshotId),
  );
  expect(snapshotFile).toBeDefined();

  const snapshotPath = path.join(snapshotDir, snapshotFile!);
  const raw = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

  expect(raw.snapShotId).toBe(snapshotResult.event.snapshotId);
  expect(raw.last_procccessed_command_id).toBe("999-0");
  expect(raw.balances["user-1"].available).toBe(5_000);
  expect(raw.balances["user-2"].available).toBe(3_000);
  expect(raw.positions).toHaveProperty("user-1" + SYMBOL);
  expect(raw.orders).toHaveProperty("test-order-1");
  expect(raw.MarkPrices[SYMBOL]).toBe(100_000);
  expect(raw.IndexPrice[SYMBOL]).toBe(99_500);
});

test("liquidation creates closing order when price breaches buffer", async () => {
  // A long position at $100, 5x leverage → liquidation price = 100 - 100/5 = $80
  // Buffer = 80 + 80*0.1 = $88
  // Mark price $90 > $88 → should trigger liquidation sell

  BALANCES.set("trader", { available: 10_000, locked: 200 });
  ORDERBOOK.set(SYMBOL, createOrderbook());

  const bidId = "liq-bid-1";
  ORDER.set(bidId, {
    orderId: bidId,
    userId: "liquidity-provider",
    status: OrderStatus.Open,
    side: Side.Buy,
    type: Type.Limit,
    quantity: 2,
    filledQty: 0,
    remainingQty: 2,
    price: 90,
    symbol: SYMBOL,
    timestamp: Date.now(),
    leverage: 5,
  });
  const book = ORDERBOOK.get(SYMBOL)!;
  book.bids.set(90, [
    {
      orderId: bidId,
      userId: "liquidity-provider",
      side: Side.Buy,
      filledQty: 0,
      remainingQty: 2,
      symbol: SYMBOL,
      price: 90,
      timestamp: Date.now(),
    },
  ]);

  POSITION.set("trader" + SYMBOL, {
    userId: "trader",
    averageEntryPrice: 100,
    liquidationPrice: 80,
    realizedPnl: null,
    size: 2,
    side: Side.Buy,
    margin: 40,
    leverage: 5,
    symbol: SYMBOL,
    market: SYMBOL,
  });

  const streamId = "2000-0";
  checkLiquidation(90, streamId);

  const liqOrders = [...ORDER.values()].filter(
    (o) => o.userId === "trader" && o.side === Side.Sell,
  );
  expect(liqOrders.length).toBeGreaterThan(0);

  const liqOrder = liqOrders[0];
  expect(liqOrder.type).toBe(Type.Market);
  expect(liqOrder.quantity).toBe(2);
  expect(liqOrder.price).toBe(90);

  const position = POSITION.get("trader" + SYMBOL);
  expect(position).toBeDefined();
  expect(position!.realizedPnl).toBeDefined();
});
