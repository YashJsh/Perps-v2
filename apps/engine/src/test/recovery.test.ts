import { afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import BTree from "sorted-btree";
import { EngineRequestOptions, type EngineRequest } from "types";
import { BALANCES, POSITION, ORDER, ORDERBOOK, MARKPRICE, LASTTRADEDPRICE } from "../store/store";
import { rehydrateState } from "../recovery/rehydrate";
import { engineHandlePlease } from "../engine/engine";
import { loadLatestSnapShot } from "../recovery/loadSnapshot";
import fs from "fs";
import path from "path";

// Mock the Redis event publisher stream to verify silent vs live execution
const mockSendToEngineStream = mock(() => Promise.resolve());
mock.module("../redis/engine_events", () => ({
  sendToEngineStream: mockSendToEngineStream,
}));

describe("State Rehydration", () => {
  beforeEach(() => {
    BALANCES.clear();
    POSITION.clear();
    ORDER.clear();
    ORDERBOOK.clear();
    MARKPRICE.clear();
    LASTTRADEDPRICE.clear();
  });

  test("rehydrateState correctly reconstructs store from snapshot payload", () => {
    const mockSnapshot = {
      last_processed_command_id: "105-0",
      orders: {
        "order-1": { orderId: "order-1", userId: "alice", price: 50000, quantity: 1 }
      },
      balances: {
        "alice": { available: 1000, locked: 200 }
      },
      positions: {
        "aliceBTC-USD": { size: 2, averageEntryPrice: 48000, margin: 200 }
      },
      orderbooks: {
        "BTC-USD": {
          asks: { "51000": [{ orderId: "order-ask" }] },
          bids: { "49000": [{ orderId: "order-bid" }] }
        }
      },
      MarkPrices: { "BTC-USD": 49500 },
      IndexPrice: { "BTC-USD": 49600 }
    };

    rehydrateState(mockSnapshot);

    // Verify Balances
    expect(BALANCES.get("alice")).toEqual({ available: 1000, locked: 200 });

    // Verify Positions
    expect(POSITION.get("aliceBTC-USD")).toEqual({ size: 2, averageEntryPrice: 48000, margin: 200 } as any);

    // Verify Orders
    expect(ORDER.get("order-1")).toEqual({ orderId: "order-1", userId: "alice", price: 50000, quantity: 1 } as any);

    // Verify Orderbook Sorted B-Trees
    const book = ORDERBOOK.get("BTC-USD");
    expect(book).toBeDefined();
    expect(book?.asks.get(51000)).toEqual([{ orderId: "order-ask" }] as any);
    expect(book?.bids.get(49000)).toEqual([{ orderId: "order-bid" }] as any);

    // Verify Mark/Index Prices
    expect(MARKPRICE.get("BTC-USD")).toBe(49500);
    expect(LASTTRADEDPRICE.get("BTC-USD")).toBe(49600);
  });
});

describe("Silent Catch-Up Replay Logic", () => {
  beforeEach(() => {
    BALANCES.clear();
    mockSendToEngineStream.mockClear();
  });

  test("does not publish stream events when running with isReplay: true", () => {
    BALANCES.set("alice", { available: 1000, locked: 0 });

    const request: EngineRequest = {
      correlationId: "correlation-replay",
      type: EngineRequestOptions.AddBalance,
      payload: { userId: "alice", symbol: "BTC-USD", amount: 500 }
    };

    engineHandlePlease(request, "200-1", { isReplay: true });

    // Replay executes state mutations silently
    expect(BALANCES.get("alice")?.available).toBe(1500);
    expect(mockSendToEngineStream).not.toHaveBeenCalled();
  });

  test("publishes stream events normally when running without isReplay: true", () => {
    BALANCES.set("alice", { available: 1000, locked: 0 });

    const request: EngineRequest = {
      correlationId: "correlation-live",
      type: EngineRequestOptions.AddBalance,
      payload: { userId: "alice", symbol: "BTC-USD", amount: 500 }
    };

    engineHandlePlease(request, "200-2");

    // Live execution mutates state and broadcasts notifications
    expect(BALANCES.get("alice")?.available).toBe(1500);
    expect(mockSendToEngineStream).toHaveBeenCalled();
  });
});

describe("Snapshot Loading Resolution", () => {
  const tempDir = path.resolve(__dirname, "../../snapshots");
  const tempFile = path.join(tempDir, "snapshot-test-temp.json");

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  });

  test("loadLatestSnapShot discovers and loads the latest snapshot file correctly", () => {
    const testData = { last_processed_command_id: "999-0", data: "test" };
    fs.writeFileSync(tempFile, JSON.stringify(testData), "utf-8");

    const loaded = loadLatestSnapShot();
    expect(loaded).toBeDefined();
    expect(loaded?.last_processed_command_id).toBe("999-0");
  });
});
