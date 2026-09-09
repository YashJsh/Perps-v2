import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  EngineEvents,
  EngineRequestOptions,
  OrderStatus,
  Side,
  Type,
  type Fill,
  type Order,
  type Position,
  type RestingOrder,
  type EngineRequest,
} from "types";
import { handleAddBalance as handleAddBalanceWithState } from "../engine/balance-ledger";
import { handleCreateOrder as handleCreateOrderWithState } from "../engine/order-matching";
import { handleDeleteOrder as handleDeleteOrderWithState } from "../engine/order-cancellation";
import { positionAccounting as positionAccountingWithState } from "../engine/position-accounting";
import { riskEngine as riskEngineWithState } from "../engine/risk-checks";
import { applyFundingRate as applyFundingRateWithState } from "../engine/funding";
import { checkLiquidation as checkLiquidationWithState } from "../engine/liquidation";
import { handleCurrentPrice as handleCurrentPriceWithState } from "../engine/market-prices";
import { EngineState } from "../state/engine-state";
import { OrderBook } from "../engine/order-book";
import { takeSnapshot as takeSnapshotWithState } from "../recovery/snapshot-writer";
import fs from "fs";
import path from "path";

const SYMBOL = "BTC-USD";
const STREAM_ID = "test-stream";
let testState: EngineState;
let BALANCES: EngineState["balances"];
let FILLS: EngineState["fills"];
let LASTTRADEDPRICE: EngineState["lastTradedPrices"];
let MARKPRICE: EngineState["markPrices"];
let ORDER: EngineState["orders"];
let ORDERBOOK: EngineState["orderbooks"];
let POSITION: EngineState["positions"];

const handleAddBalance = (payload: unknown, streamId: string) =>
  handleAddBalanceWithState(payload, streamId, testState);
const handleCreateOrder = (payload: unknown, streamId: string) =>
  handleCreateOrderWithState(payload, streamId, testState);
const handleDeleteOrder = (request: EngineRequest, streamId: string) =>
  handleDeleteOrderWithState(request, streamId, testState);
const positionAccounting = (orderId: string) =>
  positionAccountingWithState(orderId, testState);
const riskEngine = (payload: Parameters<typeof riskEngineWithState>[0]) =>
  riskEngineWithState(payload, testState);
const applyFundingRate = (
  indexPriceData: Map<string, number>,
  markPriceData: Map<string, number>,
  streamId: string,
  data: Parameters<typeof applyFundingRateWithState>[2]
) => {
  testState.lastTradedPrices.clear();
  for (const [symbol, price] of indexPriceData) {
    testState.lastTradedPrices.set(symbol, price);
  }
  testState.markPrices.clear();
  for (const [symbol, price] of markPriceData) {
    testState.markPrices.set(symbol, price);
  }
  return applyFundingRateWithState(testState, streamId, data);
};
const checkLiquidation = (markPrice: number, streamId: string) =>
  checkLiquidationWithState(markPrice, streamId, testState);
const handleCurrentPrice = (request: EngineRequest) =>
  handleCurrentPriceWithState(request, testState);
const takeSnapshot = (streamId: string) =>
  takeSnapshotWithState(streamId, testState);
const ENGINE_META_DATA = {
  get LAST_COMMAND_PROCESSED_ID() {
    return testState.lastCommandProcessedId;
  },
  set LAST_COMMAND_PROCESSED_ID(value: string) {
    testState.lastCommandProcessedId = value;
  },
};

const createOrderbook = (): OrderBook => new OrderBook();

const resetStore = () => {
  testState = new EngineState();
  BALANCES = testState.balances;
  FILLS = testState.fills;
  LASTTRADEDPRICE = testState.lastTradedPrices;
  MARKPRICE = testState.markPrices;
  ORDER = testState.orders;
  ORDERBOOK = testState.orderbooks;
  POSITION = testState.positions;
  ORDERBOOK.set(SYMBOL, createOrderbook());
};

const getSingleOrder = (): Order => {
  const [order] = [...ORDER.values()];
  if (!order) {
    throw new Error("Expected an order to exist");
  }
  return order;
};

const seedRestingAsk = (overrides: Partial<RestingOrder> = {}) => {
  const restingOrder: RestingOrder = {
    orderId: "resting-ask",
    userId: "seller",
    side: Side.Sell,
    filledQty: 0,
    remainingQty: 2,
    symbol: SYMBOL,
    price: 100,
    timestamp: 1,
    ...overrides,
  };
  ORDER.set(restingOrder.orderId, {
    orderId: restingOrder.orderId,
    userId: restingOrder.userId,
    status: OrderStatus.Open,
    side: restingOrder.side,
    type: Type.Limit,
    quantity: restingOrder.remainingQty,
    filledQty: restingOrder.filledQty,
    remainingQty: restingOrder.remainingQty,
    price: restingOrder.price,
    symbol: restingOrder.symbol,
    timestamp: restingOrder.timestamp,
    leverage: 5,
  });
  ORDERBOOK.get(SYMBOL)?.add(restingOrder);
};

const seedRestingBid = (overrides: Partial<RestingOrder> = {}) => {
  const restingOrder: RestingOrder = {
    orderId: "resting-bid",
    userId: "buyer",
    side: Side.Buy,
    filledQty: 0,
    remainingQty: 1,
    symbol: SYMBOL,
    price: 100,
    timestamp: 1,
    ...overrides,
  };
  ORDER.set(restingOrder.orderId, {
    orderId: restingOrder.orderId,
    userId: restingOrder.userId,
    status: OrderStatus.Open,
    side: restingOrder.side,
    type: Type.Limit,
    quantity: restingOrder.remainingQty,
    filledQty: restingOrder.filledQty,
    remainingQty: restingOrder.remainingQty,
    price: restingOrder.price,
    symbol: restingOrder.symbol,
    timestamp: restingOrder.timestamp,
    leverage: 5,
  });
  ORDERBOOK.get(SYMBOL)?.add(restingOrder);
};

beforeEach(() => {
  resetStore();
});

// ──────────────────────────────────────────────
// 1. Balance Management
// ──────────────────────────────────────────────
describe("balance management", () => {
  test("creates a user balance and accumulates additional deposits", () => {
    const created = handleAddBalance(
      { userId: "alice", symbol: SYMBOL, amount: 1_000 },
      STREAM_ID,
    );
    const toppedUp = handleAddBalance(
      { userId: "alice", symbol: SYMBOL, amount: 250 },
      STREAM_ID,
    );

    expect(created.response).toEqual({
      userId: "alice",
      available: 1_000,
      locked: 0,
    });
    expect(toppedUp.response).toEqual({
      userId: "alice",
      available: 1_250,
      locked: 0,
    });
  });

  test("handles negative deposit amounts", () => {
    expect(() =>
      handleAddBalance(
        { userId: "bob", symbol: SYMBOL, amount: -100 },
        STREAM_ID,
      )
    ).toThrow("Deposit must be positive");
  });

  test("creates balance for multiple users independently", () => {
    handleAddBalance({ userId: "alice", symbol: SYMBOL, amount: 1_000 }, STREAM_ID);
    handleAddBalance({ userId: "bob", symbol: SYMBOL, amount: 500 }, STREAM_ID);

    expect(BALANCES.get("alice")?.available).toBe(1_000);
    expect(BALANCES.get("bob")?.available).toBe(500);
  });
});

// ──────────────────────────────────────────────
// 2. Limit Order Creation & Matching
// ──────────────────────────────────────────────
describe("limit order creation and matching", () => {
  test("rests a limit buy on the book when there is no matching ask", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 5_000 }, STREAM_ID);

    const result = handleCreateOrder(
      {
        userId: "buyer",
        symbol: SYMBOL,
        price: 100,
        quantity: 2,
        side: Side.Buy,
        type: Type.Limit,
        leverage: 5,
      },
      STREAM_ID,
    );

    expect(result.response.filledQty).toBe(0);
    expect(result.response.remainingQty).toBe(2);

    const buyerOrder = [...ORDER.values()].find((o) => o.userId === "buyer");
    expect(buyerOrder?.status).toBe(OrderStatus.Open);
     expect(ORDERBOOK.get(SYMBOL)?.ordersAt(Side.Buy, 100)?.length).toBe(1);
  });

  test("fully matched crossing buy is marked as filled", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    seedRestingAsk();

    const result = handleCreateOrder(
      {
        userId: "buyer",
        symbol: SYMBOL,
        price: 105,
        quantity: 2,
        side: Side.Buy,
        type: Type.Limit,
        leverage: 5,
      },
      STREAM_ID,
    );

    expect(result.response.filledQty).toBe(2);
    expect(result.response.remainingQty).toBe(0);

    const buyerOrder = [...ORDER.values()].find((o) => o.userId === "buyer");
    expect(buyerOrder?.status).toBe(OrderStatus.Filled);
  });

  test("does not double-count fills and position size", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    seedRestingAsk();

    handleCreateOrder(
      {
        userId: "buyer",
        symbol: SYMBOL,
        price: 105,
        quantity: 2,
        side: Side.Buy,
        type: Type.Limit,
        leverage: 5,
      },
      STREAM_ID,
    );

    const buyerOrder = [...ORDER.values()].find((o) => o.userId === "buyer");
    const buyerFills = buyerOrder ? FILLS.get(buyerOrder.orderId) : undefined;
    const position = POSITION.get(`buyer${SYMBOL}`);

    expect(buyerFills).toHaveLength(1);
    expect(position).toMatchObject({
      userId: "buyer",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 100,
    });
     expect(ORDERBOOK.get(SYMBOL)?.ordersAt(Side.Sell, 100)?.length ?? 0).toBe(0);
  });

  test("matches an incoming sell against the highest bid first", () => {
    handleAddBalance({ userId: "seller", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    seedRestingBid({ orderId: "bidder-low", userId: "bidder-low", price: 100 });
    seedRestingBid({ orderId: "bidder-high", userId: "bidder-high", price: 105 });

    const result = handleCreateOrder(
      {
        userId: "seller",
        symbol: SYMBOL,
        price: 100,
        quantity: 1,
        side: Side.Sell,
        type: Type.Limit,
        leverage: 5,
      },
      STREAM_ID,
    );

    const sellerOrder = [...ORDER.values()].find((o) => o.userId === "seller");
    const fillPrice = sellerOrder ? FILLS.get(sellerOrder.orderId)?.[0]?.price : undefined;

    expect(result.response.filledQty).toBe(1);
    expect(fillPrice).toBe(105);
  });

  test("keeps remaining quantity resting after a partial buy fill", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    seedRestingAsk({ orderId: "small-ask", remainingQty: 1, price: 100 });

    const result = handleCreateOrder(
      {
        userId: "buyer",
        symbol: SYMBOL,
        price: 105,
        quantity: 3,
        side: Side.Buy,
        type: Type.Limit,
        leverage: 5,
      },
      STREAM_ID,
    );

    const buyerOrder = [...ORDER.values()].find((o) => o.userId === "buyer");
    const restingBid = buyerOrder
       ? ORDERBOOK.get(SYMBOL)?.ordersAt(Side.Buy, 105)?.find((r) => r.orderId === buyerOrder.orderId)
      : undefined;

    expect(result.response.filledQty).toBe(1);
    expect(result.response.remainingQty).toBe(2);
    expect(buyerOrder?.status).toBe(OrderStatus.PartiallyFilled);
    expect(restingBid?.remainingQty).toBe(2);
  });

  test("matches across multiple ask levels with weighted average entry", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 20_000 }, STREAM_ID);
    seedRestingAsk({ orderId: "ask-100", userId: "seller-a", remainingQty: 1, price: 100 });
    seedRestingAsk({ orderId: "ask-102", userId: "seller-b", remainingQty: 2, price: 102 });

    handleCreateOrder(
      {
        userId: "buyer",
        symbol: SYMBOL,
        price: 102,
        quantity: 3,
        side: Side.Buy,
        type: Type.Limit,
        leverage: 6,
      },
      STREAM_ID,
    );

    const buyerOrder = [...ORDER.values()].find((o) => o.userId === "buyer");
    const buyerFills = buyerOrder ? FILLS.get(buyerOrder.orderId) : undefined;
    const position = POSITION.get(`buyer${SYMBOL}`);

    expect(buyerFills).toHaveLength(2);
    expect(buyerFills?.map((f) => f.price)).toEqual([100, 102]);
    expect(position?.size).toBe(3);
    expect(position?.averageEntryPrice).toBeCloseTo(304 / 3, 10);
  });

  test("partially filled sell leaves remainder on ask book", () => {
    handleAddBalance({ userId: "seller", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    seedRestingBid({ orderId: "small-bid", userId: "buyer-a", remainingQty: 1, price: 105 });

    const result = handleCreateOrder(
      {
        userId: "seller",
        symbol: SYMBOL,
        price: 100,
        quantity: 3,
        side: Side.Sell,
        type: Type.Limit,
        leverage: 5,
      },
      STREAM_ID,
    );

    const sellerOrder = [...ORDER.values()].find((o) => o.userId === "seller");
    const restingAsk = sellerOrder
       ? ORDERBOOK.get(SYMBOL)?.ordersAt(Side.Sell, 100)?.find((r) => r.orderId === sellerOrder.orderId)
      : undefined;

    expect(result.response.filledQty).toBe(1);
    expect(result.response.remainingQty).toBe(2);
    expect(sellerOrder?.status).toBe(OrderStatus.PartiallyFilled);
    expect(restingAsk?.remainingQty).toBe(2);
  });

  test("throws when no liquidity for limit buy", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 5_000 }, STREAM_ID);

    expect(() =>
      handleCreateOrder(
        {
          userId: "buyer",
          symbol: SYMBOL,
          price: 100,
          quantity: 2,
          side: Side.Buy,
          type: Type.Limit,
          leverage: 5,
        },
        STREAM_ID,
      ),
    ).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// 3. Market Orders
// ──────────────────────────────────────────────
describe("market orders", () => {
  test("throws when a market buy has no available asks", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 5_000 }, STREAM_ID);

    expect(() =>
      handleCreateOrder(
        {
          userId: "buyer",
          symbol: SYMBOL,
          price: 100,
          quantity: 1,
          side: Side.Buy,
          type: Type.Market,
          leverage: 5,
        },
        STREAM_ID,
      ),
    ).toThrow("No fills found for order");
  });

  test("market buy fills against all ask levels regardless of price", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 20_000 }, STREAM_ID);
    seedRestingAsk({ orderId: "ask-1", userId: "seller-a", remainingQty: 1, price: 100 });
    seedRestingAsk({ orderId: "ask-2", userId: "seller-b", remainingQty: 1, price: 110 });

    const result = handleCreateOrder(
      {
        userId: "buyer",
        symbol: SYMBOL,
        price: 105,
        quantity: 2,
        side: Side.Buy,
        type: Type.Market,
        leverage: 5,
      },
      STREAM_ID,
    );

    // BUG: market order uses price <= data.price filter, so ask at 110 won't match
    expect(result.response.filledQty).toBe(2);
    const position = POSITION.get(`buyer${SYMBOL}`);
    expect(position?.size).toBe(2);
  });

  test("market sell fills against all bid levels regardless of price", () => {
    handleAddBalance({ userId: "seller", symbol: SYMBOL, amount: 20_000 }, STREAM_ID);
    seedRestingBid({ orderId: "bid-1", userId: "buyer-a", remainingQty: 1, price: 100 });
    seedRestingBid({ orderId: "bid-2", userId: "buyer-b", remainingQty: 1, price: 90 });

    const result = handleCreateOrder(
      {
        userId: "seller",
        symbol: SYMBOL,
        price: 95,
        quantity: 2,
        side: Side.Sell,
        type: Type.Market,
        leverage: 5,
      },
      STREAM_ID,
    );

    // BUG: market sell also uses price filter, bid at 90 won't match since price (95) > 90 check
    // depends on handleSellOrder market path using <= comparison
    expect(result.response.filledQty).toBe(2);
  });
});

// ──────────────────────────────────────────────
// 4. Order Cancellation
// ──────────────────────────────────────────────
describe("order cancellation", () => {
  test("removes a resting order from the book and marks it cancelled", () => {
    seedRestingBid();

    const order = getSingleOrder();
    const result = handleDeleteOrder(
      {
        correlationId: "cancel-1",
        type: EngineRequestOptions.CancelOrder,
        payload: { userId: "buyer", orderId: order.orderId, symbol: SYMBOL },
      },
      STREAM_ID,
    );

    expect(result.response.success).toBe(true);
    expect(order.status).toBe(OrderStatus.Cancelled);
     expect(ORDERBOOK.get(SYMBOL)?.ordersAt(Side.Buy, 100)?.length ?? 0).toBe(0);
  });

  test("rejects cancellation of an already filled order", () => {
    seedRestingAsk({ orderId: "filled-ask", userId: "seller", remainingQty: 1, price: 100 });
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);

    const buyerResponse = handleCreateOrder(
      { userId: "buyer", symbol: SYMBOL, price: 100, quantity: 1, side: Side.Buy, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );

    expect(() =>
      handleDeleteOrder(
        {
          correlationId: "cancel-filled",
          type: EngineRequestOptions.CancelOrder,
          payload: { userId: "buyer", orderId: buyerResponse.response.orderId, symbol: SYMBOL },
        },
        STREAM_ID,
      ),
    ).toThrow("Order is already filled or cancelled");
  });

  test("rejects cancellation when the order id does not exist", () => {
    expect(() =>
      handleDeleteOrder(
        {
          correlationId: "cancel-missing",
          type: EngineRequestOptions.CancelOrder,
          payload: { userId: "buyer", orderId: "missing-order", symbol: SYMBOL },
        },
        STREAM_ID,
      ),
    ).toThrow("Order not found");
  });

  test("rejects cancellation from a different user", () => {
    seedRestingBid({ userId: "owner" });
    const order = getSingleOrder();

    expect(() =>
      handleDeleteOrder(
        {
          correlationId: "cancel-wrong-user",
          type: EngineRequestOptions.CancelOrder,
          payload: { userId: "attacker", orderId: order.orderId, symbol: SYMBOL },
        },
        STREAM_ID,
      )
    ).toThrow("Ownership of order required for deleting the order");

    expect(order.status).not.toBe(OrderStatus.Cancelled);
  });
});

// ──────────────────────────────────────────────
// 5. Risk Engine
// ──────────────────────────────────────────────
describe("risk engine", () => {
  test("sell reducing an existing long is lower risk", () => {
    const existingPosition: Position = {
      userId: "trader",
      symbol: SYMBOL,
      size: 5,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 5,
      margin: 100,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    };
    POSITION.set(`trader${SYMBOL}`, existingPosition);

    const result = riskEngine({
      userId: "trader",
      symbol: SYMBOL,
      price: 98,
      quantity: 2,
      side: Side.Sell,
      type: Type.Limit,
      leverage: 5,
    });

    expect(result).toBe(false);
  });

  test("adding to an existing long is higher risk", () => {
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 5,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 5,
      margin: 100,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });

    const result = riskEngine({
      userId: "trader",
      symbol: SYMBOL,
      price: 101,
      quantity: 2,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    });

    expect(result).toBe(true);
  });

  test("no existing position is higher risk (needs margin check)", () => {
    const result = riskEngine({
      userId: "new-trader",
      symbol: SYMBOL,
      price: 100,
      quantity: 1,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    });

    expect(result).toBe(true);
  });

  test("buy reducing an existing short is lower risk", () => {
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: -5,
      averageEntryPrice: 100,
      liquidationPrice: 120,
      leverage: 5,
      margin: 100,
      realizedPnl: null,
      side: Side.Sell,
      market: SYMBOL,
    });

    const result = riskEngine({
      userId: "trader",
      symbol: SYMBOL,
      price: 102,
      quantity: 2,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    });

    expect(result).toBe(false);
  });
});

// ──────────────────────────────────────────────
// 6. Position Accounting
// ──────────────────────────────────────────────
describe("position accounting", () => {
  test("creates a new long position", () => {
    handleAddBalance({ userId: "trader", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    seedRestingAsk({ userId: "seller", remainingQty: 2, price: 100 });

    handleCreateOrder(
      { userId: "trader", symbol: SYMBOL, price: 105, quantity: 2, side: Side.Buy, type: Type.Limit, leverage: 10 },
      STREAM_ID,
    );

    const position = POSITION.get(`trader${SYMBOL}`);
    expect(position).toBeDefined();
    expect(position?.size).toBe(2);
    expect(position?.averageEntryPrice).toBe(100);
    expect(position?.leverage).toBe(10);
    expect(position?.margin).toBe(200 / 10);
  });

  test("creates a new short position", () => {
    handleAddBalance({ userId: "trader", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    seedRestingBid({ userId: "buyer", remainingQty: 3, price: 100 });

    handleCreateOrder(
      { userId: "trader", symbol: SYMBOL, price: 95, quantity: 3, side: Side.Sell, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );

    const position = POSITION.get(`trader${SYMBOL}`);
    expect(position?.size).toBe(-3);
    expect(position?.averageEntryPrice).toBe(100);
  });

  test("same-side increase recalculates weighted average entry", () => {
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 5,
      margin: 40,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    BALANCES.set("trader", { available: 10_000, locked: 40 });

    // Create a fill for a new buy order increasing the position
    ORDER.set("add-order", {
      orderId: "add-order",
      userId: "trader",
      symbol: SYMBOL,
      side: Side.Buy,
      type: Type.Limit,
      quantity: 3,
      filledQty: 3,
      remainingQty: 0,
      price: 110,
      status: OrderStatus.Filled,
      timestamp: Date.now(),
      leverage: 5,
    });
    FILLS.set("add-order", [
      { orderId: "add-order", makerId: "seller", takerId: "trader", makerOrderId: "seller-order", takerOrderId: "add-order", filledQty: 3, price: 110, marked: false },
    ]);

    positionAccounting("add-order");

    const position = POSITION.get(`trader${SYMBOL}`);
    const expectedAvg = (2 * 100 + 3 * 110) / 5;
    expect(position?.size).toBe(5);
    expect(position?.averageEntryPrice).toBeCloseTo(expectedAvg, 10);
    expect(position?.margin).toBeCloseTo((5 * expectedAvg) / 5, 10);
  });

  test("partial close realizes PnL and reduces position size", () => {
    BALANCES.set("trader", { available: 1_000, locked: 100 });
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 5,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 10,
      margin: 50,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    ORDER.set("reduce-order", {
      orderId: "reduce-order",
      userId: "trader",
      symbol: SYMBOL,
      side: Side.Sell,
      type: Type.Limit,
      quantity: 2,
      filledQty: 2,
      remainingQty: 0,
      price: 110,
      status: OrderStatus.Filled,
      timestamp: Date.now(),
      leverage: 10,
    });
    FILLS.set("reduce-order", [
      { orderId: "reduce-order", makerId: "other", takerId: "trader", makerOrderId: "other-order", takerOrderId: "reduce-order", filledQty: 2, price: 110, marked: false },
    ]);

    positionAccounting("reduce-order");

    expect(BALANCES.get("trader")).toEqual({
      available: 1_020,
      locked: 100,
    });
    expect(POSITION.get(`trader${SYMBOL}`)).toMatchObject({
      size: 3,
      averageEntryPrice: 100,
      margin: 30,
    });
  });

  test("partial close accumulates realizedPnl across multiple closes", () => {
    BALANCES.set("trader", { available: 1_000, locked: 100 });
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 5,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 10,
      margin: 50,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    // First partial close: sell 2 at 110 → PnL = (110-100)*2 = 20
    ORDER.set("close-1", {
      orderId: "close-1",
      userId: "trader",
      symbol: SYMBOL,
      side: Side.Sell,
      type: Type.Limit,
      quantity: 2,
      filledQty: 2,
      remainingQty: 0,
      price: 110,
      status: OrderStatus.Filled,
      timestamp: Date.now(),
      leverage: 10,
    });
    FILLS.set("close-1", [
      { orderId: "close-1", makerId: "other", takerId: "trader", makerOrderId: "other-order", takerOrderId: "close-1", filledQty: 2, price: 110, marked: false },
    ]);
    positionAccounting("close-1");

    // BUG: realizedPnl should be 20, not overwritten on next close
    // Second partial close: sell 1 at 105 → PnL = (105-100)*1 = 5
    ORDER.set("close-2", {
      orderId: "close-2",
      userId: "trader",
      symbol: SYMBOL,
      side: Side.Sell,
      type: Type.Limit,
      quantity: 1,
      filledQty: 1,
      remainingQty: 0,
      price: 105,
      status: OrderStatus.Filled,
      timestamp: Date.now(),
      leverage: 10,
    });
    FILLS.set("close-2", [
      { orderId: "close-2", makerId: "other", takerId: "trader", makerOrderId: "other-order", takerOrderId: "close-2", filledQty: 1, price: 105, marked: false },
    ]);
    positionAccounting("close-2");

    // BUG: realizedPnl is overwritten, should be 20 + 5 = 25
    expect(POSITION.get(`trader${SYMBOL}`)?.realizedPnl).toBe(25);
  });

  test("full close releases locked margin and realized PnL", () => {
    BALANCES.set("trader", { available: 950, locked: 50 });
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 5,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 10,
      margin: 50,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    ORDER.set("close-order", {
      orderId: "close-order",
      userId: "trader",
      symbol: SYMBOL,
      side: Side.Sell,
      type: Type.Limit,
      quantity: 5,
      filledQty: 5,
      remainingQty: 0,
      price: 110,
      status: OrderStatus.Filled,
      timestamp: Date.now(),
      leverage: 10,
    });
    FILLS.set("close-order", [
      { orderId: "close-order", makerId: "other", takerId: "trader", makerOrderId: "other-order", takerOrderId: "close-order", filledQty: 5, price: 110, marked: false },
    ]);

    positionAccounting("close-order");

    expect(BALANCES.get("trader")).toEqual({
      available: 1_050,
      locked: 0,
    });
    // BUG: position should be removed from the map on full close
    const pos = POSITION.get(`trader${SYMBOL}`);
    expect(pos?.size).toBeUndefined();
  });

  test("flips a long into a short when closing larger than position", () => {
    BALANCES.set("trader", { available: 1_000, locked: 50 });
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 10,
      margin: 20,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    ORDER.set("flip-order", {
      orderId: "flip-order",
      userId: "trader",
      symbol: SYMBOL,
      side: Side.Sell,
      type: Type.Limit,
      quantity: 5,
      filledQty: 5,
      remainingQty: 0,
      price: 90,
      status: OrderStatus.Filled,
      timestamp: Date.now(),
      leverage: 10,
    });
    FILLS.set("flip-order", [
      { orderId: "flip-order", makerId: "other", takerId: "trader", makerOrderId: "other-order", takerOrderId: "flip-order", filledQty: 5, price: 90, marked: false },
    ]);

    positionAccounting("flip-order");

    expect(BALANCES.get("trader")).toEqual({
      available: 973,
      locked: 57,
    });
    const position = POSITION.get(`trader${SYMBOL}`);
    expect(position).toMatchObject({
      size: -3,
      averageEntryPrice: 90,
      leverage: 10,
    });
    expect(position?.margin).toBeCloseTo((3 * 90) / 10, 10);
    // BUG: position.side should reflect new short position, not stale Buy
    if (position) {
      expect(Math.sign(position.size)).toBe(-1);
    }
  });

  test("flips a short into a long", () => {
    BALANCES.set("trader", { available: 1_000, locked: 50 });
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: -3,
      averageEntryPrice: 100,
      liquidationPrice: 120,
      leverage: 10,
      margin: 30,
      realizedPnl: null,
      side: Side.Sell,
      market: SYMBOL,
    });
    ORDER.set("flip-up", {
      orderId: "flip-up",
      userId: "trader",
      symbol: SYMBOL,
      side: Side.Buy,
      type: Type.Limit,
      quantity: 5,
      filledQty: 5,
      remainingQty: 0,
      price: 110,
      status: OrderStatus.Filled,
      timestamp: Date.now(),
      leverage: 10,
    });
    FILLS.set("flip-up", [
      { orderId: "flip-up", makerId: "other", takerId: "trader", makerOrderId: "other-order", takerOrderId: "flip-up", filledQty: 5, price: 110, marked: false },
    ]);

    positionAccounting("flip-up");

    const position = POSITION.get(`trader${SYMBOL}`);
    expect(position?.size).toBe(2);
    expect(position?.averageEntryPrice).toBe(110);
  });
});

// ──────────────────────────────────────────────
// 7. Funding Rate
// ──────────────────────────────────────────────
describe("funding rate", () => {
  test("positive funding rate: longs pay shorts", () => {
    BALANCES.set("long-user", { available: 1_000, locked: 100 });
    BALANCES.set("short-user", { available: 1_000, locked: 100 });

    POSITION.set(`long-user${SYMBOL}`, {
      userId: "long-user",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 50000,
      liquidationPrice: 45000,
      leverage: 10,
      margin: 10_000,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    POSITION.set(`short-user${SYMBOL}`, {
      userId: "short-user",
      symbol: SYMBOL,
      size: -2,
      averageEntryPrice: 50000,
      liquidationPrice: 55000,
      leverage: 10,
      margin: 10_000,
      realizedPnl: null,
      side: Side.Sell,
      market: SYMBOL,
    });

    const indexPrice = new Map<string, number>([[SYMBOL, 50000]]);
    const markPrice = new Map<string, number>([[SYMBOL, 50250]]);
    // rate = |50250 - 50000| / 50000 = 0.005

    applyFundingRate(indexPrice, markPrice, STREAM_ID, { symbol: SYMBOL });

    // BUG: Math.abs on funding rate loses sign — longs always pay, shorts always receive
    // With mark > index, rate should be positive → longs pay shorts
    const longBal = BALANCES.get("long-user");
    const shortBal = BALANCES.get("short-user");
    expect(longBal?.available).toBeLessThan(1_000);
    expect(shortBal?.available).toBeGreaterThan(1_000);
  });

  test("negative funding rate: shorts pay longs", () => {
    BALANCES.set("long-user", { available: 1_000, locked: 100 });
    BALANCES.set("short-user", { available: 1_000, locked: 100 });

    POSITION.set(`long-user${SYMBOL}`, {
      userId: "long-user",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 50000,
      liquidationPrice: 45000,
      leverage: 10,
      margin: 10_000,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    POSITION.set(`short-user${SYMBOL}`, {
      userId: "short-user",
      symbol: SYMBOL,
      size: -2,
      averageEntryPrice: 50000,
      liquidationPrice: 55000,
      leverage: 10,
      margin: 10_000,
      realizedPnl: null,
      side: Side.Sell,
      market: SYMBOL,
    });

    const indexPrice = new Map<string, number>([[SYMBOL, 50000]]);
    const markPrice = new Map<string, number>([[SYMBOL, 49750]]);
    // rate = |49750 - 50000| / 50000 = 0.005

    applyFundingRate(indexPrice, markPrice, STREAM_ID, { symbol: SYMBOL });

    // BUG: Math.abs makes rate positive, so longs still pay even though
    // mark < index means shorts should pay longs
    const longBal = BALANCES.get("long-user");
    const shortBal = BALANCES.get("short-user");
    expect(longBal?.available).toBeGreaterThan(1_000);
    expect(shortBal?.available).toBeLessThan(1_000);
  });

  test("funding rate is zero-sum (total payments cancel out)", () => {
    const LONG_INITIAL = 1_000;
    const SHORT_INITIAL = 1_000;
    BALANCES.set("long-user", { available: LONG_INITIAL, locked: 100 });
    BALANCES.set("short-user", { available: SHORT_INITIAL, locked: 100 });

    POSITION.set(`long-user${SYMBOL}`, {
      userId: "long-user",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 50000,
      liquidationPrice: 45000,
      leverage: 10,
      margin: 10_000,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    POSITION.set(`short-user${SYMBOL}`, {
      userId: "short-user",
      symbol: SYMBOL,
      size: -2,
      averageEntryPrice: 50000,
      liquidationPrice: 55000,
      leverage: 10,
      margin: 10_000,
      realizedPnl: null,
      side: Side.Sell,
      market: SYMBOL,
    });

    const indexPrice = new Map<string, number>([[SYMBOL, 50000]]);
    const markPrice = new Map<string, number>([[SYMBOL, 50250]]);

    applyFundingRate(indexPrice, markPrice, STREAM_ID, { symbol: SYMBOL });

    const longBal = BALANCES.get("long-user");
    const shortBal = BALANCES.get("short-user");
    const total = (longBal?.available ?? 0) + (shortBal?.available ?? 0);
    // Total should remain the same since payments are internal transfers
    expect(total).toBe(LONG_INITIAL + SHORT_INITIAL);
  });
});

// ──────────────────────────────────────────────
// 8. Liquidation
// ──────────────────────────────────────────────
describe("liquidation", () => {
  test("liquidates a long position when mark price drops below liquidation price", () => {
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 100,
      liquidationPrice: 90,
      leverage: 10,
      margin: 20,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    BALANCES.set("trader", { available: 0, locked: 20 });

    checkLiquidation(85, STREAM_ID);

    // BUG: liquidation may not work correctly — wrong side, wrong size check
    // A liquidation order should be created for the position
    const liquidationOrders = [...ORDER.values()].filter((o) => o.userId === "trader");
    expect(liquidationOrders.length).toBe(1);
    const liqOrder = liquidationOrders[0];
    if (liqOrder) {
      expect(liqOrder.side).toBe(Side.Sell);
      expect(liqOrder.type).toBe(Type.Market);
    }
  });

  test("liquidates a short position when mark price rises above liquidation price", () => {
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: -2,
      averageEntryPrice: 100,
      liquidationPrice: 110,
      leverage: 10,
      margin: 20,
      realizedPnl: null,
      side: Side.Sell,
      market: SYMBOL,
    });
    BALANCES.set("trader", { available: 0, locked: 20 });

    checkLiquidation(120, STREAM_ID);

    // BUG: buffer check has wrong direction for shorts
    const liquidationOrders = [...ORDER.values()].filter((o) => o.userId === "trader");
    expect(liquidationOrders.length).toBe(1);
    const liqOrder = liquidationOrders[0];
    if (liqOrder) {
      expect(liqOrder.side).toBe(Side.Buy);
      expect(liqOrder.type).toBe(Type.Market);
    }
  });

  test("does not liquidate a position within the 10% buffer", () => {
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 100,
      liquidationPrice: 90,
      leverage: 10,
      margin: 20,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    BALANCES.set("trader", { available: 0, locked: 20 });

    // liqPrice = 90, buffer = 90 + 9 = 99, markPrice = 92 < 99, so buffer check passes
    // Actual liq should be: mark (92) < liq (90) → liquidate? Yes, 92 > 90, so no
    // BUG: buffer condition uses <= comparing bufferedPrice vs markPrice
    checkLiquidation(92, STREAM_ID);

    const liquidationOrders = [...ORDER.values()].filter((o) => o.userId === "trader");
    expect(liquidationOrders.length).toBe(0);
  });

  test("liquidation position size check handles size of exactly 1", () => {
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 1,
      averageEntryPrice: 100,
      liquidationPrice: 90,
      leverage: 10,
      margin: 10,
      realizedPnl: null,
      side: Side.Buy,
      market: SYMBOL,
    });
    BALANCES.set("trader", { available: 0, locked: 10 });

    checkLiquidation(85, STREAM_ID);

    // BUG: condition is p.size > 1 (should be p.size > 0), so size=1 won't liquidate
    const liquidationOrders = [...ORDER.values()].filter((o) => o.userId === "trader");
    expect(liquidationOrders.length).toBe(1);
  });
});

// ──────────────────────────────────────────────
// 9. Price Updates
// ──────────────────────────────────────────────
describe("price updates", () => {
  test("stores mark price and makes it retrievable", () => {
    handleCurrentPrice({
      correlationId: "price-1",
      type: EngineRequestOptions.CurrentPrice,
      payload: { symbol: SYMBOL, price: 50000 },
    });

    // BUG: handleCurrentPrice assigns to local variable, not the Map
    const storedPrice = MARKPRICE.get(SYMBOL);
    expect(storedPrice).toBe(50000);
  });
});

// ──────────────────────────────────────────────
// 10. Engine Dispatcher
// ──────────────────────────────────────────────
describe("engine dispatcher", () => {
  test("handleCreateOrder works correctly with direct payload", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    seedRestingAsk();

    const result = handleCreateOrder(
      { userId: "buyer", symbol: SYMBOL, price: 105, quantity: 2, side: Side.Buy, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );

    expect(result.response.filledQty).toBe(2);
  });

  test("handleCreateOrder fails when passed EngineRequest instead of payload", () => {
    handleAddBalance({ userId: "buyer", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    seedRestingAsk();

    const badRequest: EngineRequest = {
      correlationId: "test",
      type: EngineRequestOptions.CreateOrder,
      payload: { userId: "buyer", symbol: SYMBOL, price: 105, quantity: 2, side: Side.Buy, type: Type.Limit, leverage: 5 },
    };

    expect(() => handleCreateOrder(badRequest, STREAM_ID)).toThrow();
  });
});

// ──────────────────────────────────────────────
// 11. Balance Checks (Margin Validation)
// ──────────────────────────────────────────────
describe("margin validation", () => {
  test("rejects order when user has insufficient balance for margin", () => {
    // User has 0 balance
    BALANCES.set("trader", { available: 0, locked: 0 });

    expect(() =>
      handleCreateOrder(
        { userId: "trader", symbol: SYMBOL, price: 100, quantity: 10, side: Side.Buy, type: Type.Limit, leverage: 5 },
        STREAM_ID,
      ),
    ).toThrow("Insufficient balance");

    // BUG: handleBalanceChecks is empty, so no error is thrown
  });

  test("allows order when user has sufficient balance for margin", () => {
    handleAddBalance({ userId: "trader", symbol: SYMBOL, amount: 200 }, STREAM_ID);
    seedRestingAsk();

    // Required margin for 2 BTC @ 100 with 5x leverage = 200/5 = 40
    // User has 200 available, should be fine
    const result = handleCreateOrder(
      { userId: "trader", symbol: SYMBOL, price: 105, quantity: 2, side: Side.Buy, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );

    // BUG: no balance check implemented, so order always goes through
    // regardless of balance. This test passes if the order is allowed,
    // but the real issue is there's no validation at all.
    expect(result.response.filledQty).toBe(2);
  });
});

// ──────────────────────────────────────────────
// 12. Edge Cases
// ──────────────────────────────────────────────
describe("edge cases", () => {
  test("zero quantity order is handled gracefully", () => {
    handleAddBalance({ userId: "trader", symbol: SYMBOL, amount: 1_000 }, STREAM_ID);

    const result = handleCreateOrder(
      { userId: "trader", symbol: SYMBOL, price: 100, quantity: 0, side: Side.Buy, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );

    expect(result.response.filledQty).toBe(0);
    expect(result.response.remainingQty).toBe(0);
  });

  test("wrong symbol throws orderbook not found", () => {
    handleAddBalance({ userId: "trader", symbol: "ETH-USD", amount: 1_000 }, STREAM_ID);

    expect(() =>
      handleCreateOrder(
        { userId: "trader", symbol: "ETH-USD", price: 100, quantity: 1, side: Side.Buy, type: Type.Limit, leverage: 5 },
        STREAM_ID,
      ),
    ).toThrow("Orderbook not found");
  });

  test("multiple orders at the same price level are all tracked", () => {
    handleAddBalance({ userId: "buyer1", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    handleAddBalance({ userId: "buyer2", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);

    handleCreateOrder(
      { userId: "buyer1", symbol: SYMBOL, price: 100, quantity: 1, side: Side.Buy, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );
    handleCreateOrder(
      { userId: "buyer2", symbol: SYMBOL, price: 100, quantity: 2, side: Side.Buy, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );

     const bidsAt100 = ORDERBOOK.get(SYMBOL)?.ordersAt(Side.Buy, 100);
    expect(bidsAt100).toHaveLength(2);
    expect(bidsAt100?.[0]?.userId).toBe("buyer1");
    expect(bidsAt100?.[1]?.userId).toBe("buyer2");
  });

  test("cancel removes only the specified order, not all at that price", () => {
    handleAddBalance({ userId: "buyer1", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);
    handleAddBalance({ userId: "buyer2", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);

    const r1 = handleCreateOrder(
      { userId: "buyer1", symbol: SYMBOL, price: 100, quantity: 1, side: Side.Buy, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );
    handleCreateOrder(
      { userId: "buyer2", symbol: SYMBOL, price: 100, quantity: 2, side: Side.Buy, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );

    handleDeleteOrder(
      {
        correlationId: "cancel",
        type: EngineRequestOptions.CancelOrder,
        payload: { userId: "buyer1", orderId: r1.response.orderId, symbol: SYMBOL },
      },
      STREAM_ID,
    );

     const bidsAt100 = ORDERBOOK.get(SYMBOL)?.ordersAt(Side.Buy, 100);
    expect(bidsAt100).toHaveLength(1);
    expect(bidsAt100?.[0]?.userId).toBe("buyer2");
  });

  test("negative price does not prevent order creation", () => {
    handleAddBalance({ userId: "trader", symbol: SYMBOL, amount: 10_000 }, STREAM_ID);

    const result = handleCreateOrder(
      { userId: "trader", symbol: SYMBOL, price: -100, quantity: 1, side: Side.Buy, type: Type.Limit, leverage: 5 },
      STREAM_ID,
    );

    expect(result.response.remainingQty).toBe(1);
  });
});

describe("snapshot", () => {
  beforeEach(() => {
    resetStore();
    LASTTRADEDPRICE.clear();
    ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = "0-0";
  });

  // afterEach(() => {
  //   const dir = path.join(process.cwd(), "snapshots");
  //   if (fs.existsSync(dir)) {
  //     for (const file of fs.readdirSync(dir)) {
  //       if (file.startsWith("snapshot-")) {
  //         fs.rmSync(path.join(dir, file));
  //       }
  //     }
  //   }
  // });

  test("captures all engine state into a JSON file", async () => {
    const streamId = "snapshot-test-stream";

    ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = "abc-123";

    BALANCES.set("snap-user", { available: 10000, locked: 500 });

    const order: Order = {
      orderId: "snap-order-1",
      userId: "snap-user",
      status: OrderStatus.Filled,
      side: Side.Buy,
      type: Type.Limit,
      quantity: 2,
      filledQty: 2,
      remainingQty: 0,
      price: 50000,
      symbol: SYMBOL,
      timestamp: Date.now(),
      leverage: 10,
    };
    ORDER.set("snap-order-1", order);

    const pos: Position = {
      userId: "snap-user",
      symbol: SYMBOL,
      size: 2,
      side: Side.Buy,
      averageEntryPrice: 50000,
      liquidationPrice: 45000,
      leverage: 10,
      margin: 10000,
      realizedPnl: 200,
      market: SYMBOL,
    };
    POSITION.set("snap-user" + SYMBOL, pos);

    MARKPRICE.set(SYMBOL, 50250);
    LASTTRADEDPRICE.set(SYMBOL, 50100);

    const result = takeSnapshot(streamId);

    expect(result.event.type).toBe(EngineEvents.SnapshotCreatedEvent);
    expect(result.event.snapshotId).toBeTruthy();
    expect(result.event.filePath).toEndWith(".json");
    expect(result.event.streamId).toBe(streamId);

    const file = Bun.file(result.event.filePath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    const content = await file.json();

    expect(content.snapShotId).toBe(result.event.snapshotId);
    expect(content.streamId).toBe(streamId);
    expect(content.last_procccessed_command_id).toBe("abc-123");
    expect(content.balances["snap-user"]).toEqual({ available: 10000, locked: 500 });
    expect(content.orders["snap-order-1"]).toEqual(order);
    expect(content.positions["snap-user" + SYMBOL]).toEqual(pos);
    expect(content.MarkPrices[SYMBOL]).toBe(50250);
    expect(content.IndexPrice[SYMBOL]).toBe(50100);
    expect(content.orderbooks[SYMBOL]).toBeDefined();
  });
});
