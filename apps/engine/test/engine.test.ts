import { beforeEach, describe, expect, test } from "bun:test";
import BTree from "sorted-btree";
import {
  EngineRequestOptions,
  OrderStatus,
  Side,
  Type,
  type Fill,
  type Order,
  type Orderbook,
  type Position,
  type RestingOrder,
} from "types";
import { handleAddBalance } from "../src/engine/balance";
import { handleCreateOrder } from "../src/engine/createOrder";
import { handleDeleteOrder } from "../src/engine/deleteOrder";
import { positionAccounting } from "../src/engine/position";
import { riskEngine } from "../src/engine/risk";
import {
  BALANCES,
  FILLS,
  ORDER,
  ORDERBOOK,
  POSITION,
} from "../src/store/store";

const SYMBOL = "BTC-USD";

const createOrderbook = (): Orderbook => ({
  asks: new BTree<number, RestingOrder[]>(),
  bids: new BTree<number, RestingOrder[]>(),
});

const resetStore = () => {
  BALANCES.clear();
  FILLS.clear();
  ORDER.clear();
  ORDERBOOK.clear();
  POSITION.clear();
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
  ORDERBOOK.get(SYMBOL)?.asks.set(restingOrder.price, [restingOrder]);
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
  ORDERBOOK.get(SYMBOL)?.bids.set(restingOrder.price, [restingOrder]);
};

beforeEach(() => {
  resetStore();
});

describe("balance management", () => {
  test("creates a user balance and accumulates additional deposits", () => {
    const created = handleAddBalance({
      userId: "alice",
      symbol: SYMBOL,
      amount: 1_000,
    });
    const toppedUp = handleAddBalance({
      userId: "alice",
      symbol: SYMBOL,
      amount: 250,
    });

    expect(created).toEqual({
      userId: "alice",
      available: 1_000,
      locked: 0,
    });
    expect(toppedUp).toEqual({
      userId: "alice",
      available: 1_250,
      locked: 0,
    });
  });
});

describe("order creation and matching", () => {
  test("rests a limit buy on the book when there is no matching ask", () => {
    handleAddBalance({
      userId: "buyer",
      symbol: SYMBOL,
      amount: 5_000,
    });

    expect(() =>
      handleCreateOrder({
        userId: "buyer",
        symbol: SYMBOL,
        price: 100,
        quantity: 2,
        side: Side.Buy,
        type: Type.Limit,
        leverage: 5,
      }),
    ).not.toThrow();
  });

  test("marks a fully matched crossing buy as filled", () => {
    handleAddBalance({
      userId: "buyer",
      symbol: SYMBOL,
      amount: 10_000,
    });
    seedRestingAsk();

    const response = handleCreateOrder({
      userId: "buyer",
      symbol: SYMBOL,
      price: 105,
      quantity: 2,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    });

    const buyerOrder = [...ORDER.values()].find((order) => order.userId === "buyer");

    expect(response).toEqual({
      success: true,
      order: buyerOrder,
    });
    expect(buyerOrder?.filledQty).toBe(2);
    expect(buyerOrder?.remainingQty).toBe(0);
    expect(buyerOrder?.status).toBe(OrderStatus.Filled);
  });
  test("does not double-count a matched buy when creating fills and position size", () => {
    handleAddBalance({
      userId: "buyer",
      symbol: SYMBOL,
      amount: 10_000,
    });
    seedRestingAsk();

    handleCreateOrder({
      userId: "buyer",
      symbol: SYMBOL,
      price: 105,
      quantity: 2,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    });

    const buyerOrder = [...ORDER.values()].find((order) => order.userId === "buyer");
    const buyerFills = buyerOrder ? FILLS.get(buyerOrder.orderId) : undefined;

    const position = POSITION.get(`buyer${SYMBOL}`);

    expect(buyerFills).toHaveLength(1);
    expect(position).toMatchObject({
      userId: "buyer",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 100,
      leverage: 5,
    });
    expect(ORDERBOOK.get(SYMBOL)?.asks.get(100)?.length ?? 0).toBe(0);
  });

  test("matches an incoming sell against the highest bid first", () => {
    handleAddBalance({
      userId: "seller",
      symbol: SYMBOL,
      amount: 10_000,
    });
    seedRestingBid({
      orderId: "bidder-low",
      userId: "bidder-low",
      price: 100,
    });
    seedRestingBid({
      orderId: "bidder-high",
      userId: "bidder-high",
      price: 105,
    });

    const response = handleCreateOrder({
      userId: "seller",
      symbol: SYMBOL,
      price: 100,
      quantity: 1,
      side: Side.Sell,
      type: Type.Limit,
      leverage: 5,
    });

    const sellerOrder = [...ORDER.values()].find((order) => order.userId === "seller");
    const fillPrice = sellerOrder ? FILLS.get(sellerOrder.orderId)?.[0]?.price : undefined;

    expect(response).toEqual({
      success: true,
      order: sellerOrder,
    });
    expect(fillPrice).toBe(105);
  });

  test("keeps the remaining quantity resting after a partial buy fill", () => {
    handleAddBalance({
      userId: "buyer",
      symbol: SYMBOL,
      amount: 10_000,
    });
    seedRestingAsk({
      orderId: "small-ask",
      remainingQty: 1,
      price: 100,
    });

    const response = handleCreateOrder({
      userId: "buyer",
      symbol: SYMBOL,
      price: 105,
      quantity: 3,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    });

    const buyerOrder = [...ORDER.values()].find((order) => order.userId === "buyer");
    const restingBid = buyerOrder
      ? ORDERBOOK.get(SYMBOL)?.bids.get(105)?.find((resting) => resting.orderId === buyerOrder.orderId)
      : undefined;

    expect(response).toEqual({
      success: true,
      order: buyerOrder,
    });
    expect(buyerOrder?.filledQty).toBe(1);
    expect(buyerOrder?.remainingQty).toBe(2);
    expect(buyerOrder?.status).toBe(OrderStatus.PartiallyFilled);
    expect(restingBid?.remainingQty).toBe(2);
  });

  test("matches across multiple ask levels and computes weighted average entry", () => {
    handleAddBalance({
      userId: "buyer",
      symbol: SYMBOL,
      amount: 20_000,
    });
    seedRestingAsk({
      orderId: "ask-100",
      userId: "seller-a",
      remainingQty: 1,
      price: 100,
    });
    seedRestingAsk({
      orderId: "ask-102",
      userId: "seller-b",
      remainingQty: 2,
      price: 102,
    });

    handleCreateOrder({
      userId: "buyer",
      symbol: SYMBOL,
      price: 102,
      quantity: 3,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 6,
    });

    const buyerOrder = [...ORDER.values()].find((order) => order.userId === "buyer");
    const buyerFills = buyerOrder ? FILLS.get(buyerOrder.orderId) : undefined;
    const position = POSITION.get(`buyer${SYMBOL}`);

    expect(buyerFills).toHaveLength(2);
    expect(buyerFills?.map((fill) => fill.price)).toEqual([100, 102]);
    expect(position?.size).toBe(3);
    expect(position?.averageEntryPrice).toBeCloseTo(304 / 3, 10);
  });

  test("marks a partially filled sell as partially filled and leaves the remainder on the ask book", () => {
    handleAddBalance({
      userId: "seller",
      symbol: SYMBOL,
      amount: 10_000,
    });
    seedRestingBid({
      orderId: "small-bid",
      userId: "buyer-a",
      remainingQty: 1,
      price: 105,
    });

    const response = handleCreateOrder({
      userId: "seller",
      symbol: SYMBOL,
      price: 100,
      quantity: 3,
      side: Side.Sell,
      type: Type.Limit,
      leverage: 5,
    });

    const sellerOrder = [...ORDER.values()].find((order) => order.userId === "seller");
    const restingAsk = sellerOrder
      ? ORDERBOOK.get(SYMBOL)?.asks.get(100)?.find((resting) => resting.orderId === sellerOrder.orderId)
      : undefined;

    expect(response).toEqual({
      success: true,
      order: sellerOrder,
    });
    expect(sellerOrder?.filledQty).toBe(1);
    expect(sellerOrder?.remainingQty).toBe(2);
    expect(sellerOrder?.status).toBe(OrderStatus.PartiallyFilled);
    expect(restingAsk?.remainingQty).toBe(2);
  });

  test("throws when a market buy has no available asks to execute against", () => {
    handleAddBalance({
      userId: "buyer",
      symbol: SYMBOL,
      amount: 5_000,
    });

    expect(() =>
      handleCreateOrder({
        userId: "buyer",
        symbol: SYMBOL,
        price: 100,
        quantity: 1,
        side: Side.Buy,
        type: Type.Market,
        leverage: 5,
      }),
    ).toThrow("No fills found for order");
  });
});

describe("order cancellation", () => {
  test("removes a resting order from the book and marks it cancelled", () => {
    seedRestingBid();

    const order = getSingleOrder();
    const response = handleDeleteOrder({
      correlationId: "cancel-1",
      type: EngineRequestOptions.CancelOrder,
      payload: {
        userId: "buyer",
        orderId: order.orderId,
        symbol: SYMBOL,
      },
    });

    expect(response).toEqual({
      success: true,
      message: "Order deleted successfully",
    });
    expect(order.status).toBe(OrderStatus.Cancelled);
    expect(ORDERBOOK.get(SYMBOL)?.bids.get(100)?.length ?? 0).toBe(0);
  });

  test("rejects cancellation of an already filled order", () => {
    seedRestingAsk({
      orderId: "filled-ask",
      userId: "seller",
      remainingQty: 1,
      price: 100,
    });
    handleAddBalance({
      userId: "buyer",
      symbol: SYMBOL,
      amount: 10_000,
    });

    const buyerResponse = handleCreateOrder({
      userId: "buyer",
      symbol: SYMBOL,
      price: 100,
      quantity: 1,
      side: Side.Buy,
      type: Type.Limit,
      leverage: 5,
    });
    const buyerOrderId = (buyerResponse as { order?: Order }).order?.orderId;

    expect(() =>
      handleDeleteOrder({
        correlationId: "cancel-filled",
        type: EngineRequestOptions.CancelOrder,
        payload: {
          userId: "buyer",
          orderId: buyerOrderId,
          symbol: SYMBOL,
        },
      }),
    ).toThrow("Order is already filled or cancelled");
  });

  test("rejects cancellation when the order id does not exist", () => {
    expect(() =>
      handleDeleteOrder({
        correlationId: "cancel-missing",
        type: EngineRequestOptions.CancelOrder,
        payload: {
          userId: "buyer",
          orderId: "missing-order",
          symbol: SYMBOL,
        },
      }),
    ).toThrow("Order not found");
  });
});

describe("risk and position accounting", () => {
  test("treats a sell that reduces an existing long as lower risk", () => {
    const existingPosition: Position = {
      userId: "trader",
      symbol: SYMBOL,
      size: 5,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 5,
      margin: 100,
      realizedPnl: null,
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

  test("treats adding to an existing long as higher risk", () => {
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 5,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 5,
      margin: 100,
      realizedPnl: null,
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

  test("realizes pnl and reduces position size on a partial close", () => {
    BALANCES.set("trader", {
      available: 1_000,
      locked: 100,
    });
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 5,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 10,
      margin: 50,
      realizedPnl: null,
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
      {
        orderId: "reduce-order",
        makerId: "other",
        takerId: "trader",
        makerOrderId: "other-order",
        takerOrderId: "reduce-order",
        filledQty: 2,
        price: 110,
        marked: false,
      },
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

  test("flips a long into a short when the closing sell is larger than the current position", () => {
    BALANCES.set("trader", {
      available: 1_000,
      locked: 50,
    });
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 2,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 10,
      margin: 20,
      realizedPnl: null,
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
      {
        orderId: "flip-order",
        makerId: "other",
        takerId: "trader",
        makerOrderId: "other-order",
        takerOrderId: "flip-order",
        filledQty: 5,
        price: 90,
        marked: false,
      },
    ]);

    positionAccounting("flip-order");

    expect(BALANCES.get("trader")).toEqual({
      available: 980,
      locked: 30,
    });
    expect(POSITION.get(`trader${SYMBOL}`)).toMatchObject({
      size: -3,
      averageEntryPrice: 90,
      margin: 27,
      leverage: 10,
    });
  });

  test("releases locked margin and realized pnl when a position is fully closed", () => {
    BALANCES.set("trader", {
      available: 950,
      locked: 50,
    });
    POSITION.set(`trader${SYMBOL}`, {
      userId: "trader",
      symbol: SYMBOL,
      size: 5,
      averageEntryPrice: 100,
      liquidationPrice: 80,
      leverage: 10,
      margin: 50,
      realizedPnl: null,
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
    const fills: Fill[] = [
      {
        orderId: "close-order",
        makerId: "other",
        takerId: "trader",
        makerOrderId: "other-order",
        takerOrderId: "close-order",
        filledQty: 5,
        price: 110,
        marked: false,
      },
    ];
    FILLS.set("close-order", fills);

    positionAccounting("close-order");

    expect(BALANCES.get("trader")).toEqual({
      available: 1_050,
      locked: 0,
    });

    expect(POSITION.get(`trader${SYMBOL}`)?.realizedPnl).toBe(50);
  });
});
