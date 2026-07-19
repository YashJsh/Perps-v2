import { beforeEach, describe, expect, test } from "bun:test";
import { Side } from "types";
import { OrderBookTracker } from "../src/orderbook";

const SYMBOL = "BTC-USD";

describe("WebSocket Orderbook Local State Tracker", () => {
  let tracker: OrderBookTracker;

  beforeEach(() => {
    tracker = new OrderBookTracker();
  });

  test("addOrder adds bids and asks and separates them in B-Trees", () => {
    tracker.addOrder("order-buy-1", 50000, 1.5, Side.Buy, SYMBOL);
    tracker.addOrder("order-buy-2", 49900, 2.0, Side.Buy, SYMBOL);
    tracker.addOrder("order-sell-1", 51000, 0.5, Side.Sell, SYMBOL);

    const depth = tracker.getDepthSnapshot(SYMBOL, 10);
    expect(depth.bids).toEqual([
      [50000, 1.5],
      [49900, 2.0]
    ]);
    expect(depth.asks).toEqual([
      [51000, 0.5]
    ]);
  });

  test("getDepthSnapshot sorts bids descending and asks ascending", () => {
    // Seed bids
    tracker.addOrder("b1", 49000, 1.0, Side.Buy, SYMBOL);
    tracker.addOrder("b2", 50000, 2.0, Side.Buy, SYMBOL);
    tracker.addOrder("b3", 49500, 1.5, Side.Buy, SYMBOL);

    // Seed asks
    tracker.addOrder("a1", 52000, 3.0, Side.Sell, SYMBOL);
    tracker.addOrder("a2", 51000, 1.0, Side.Sell, SYMBOL);
    tracker.addOrder("a3", 51500, 2.5, Side.Sell, SYMBOL);

    const depth = tracker.getDepthSnapshot(SYMBOL, 10);

    // Bids: highest price first (descending)
    expect(depth.bids).toEqual([
      [50000, 2.0],
      [49500, 1.5],
      [49000, 1.0]
    ]);

    // Asks: lowest price first (ascending)
    expect(depth.asks).toEqual([
      [51000, 1.0],
      [51500, 2.5],
      [52000, 3.0]
    ]);
  });

  test("updateOrderFill reduces maker quantity and removes order when fully filled", () => {
    tracker.addOrder("resting-buy", 50000, 2.0, Side.Buy, SYMBOL);

    // Partial Fill
    tracker.updateOrderFill("resting-buy", 0.5, 50000, SYMBOL);
    expect(tracker.getDepthSnapshot(SYMBOL).bids).toEqual([[50000, 1.5]]);

    // Complete Fill
    tracker.updateOrderFill("resting-buy", 1.5, 50000, SYMBOL);
    expect(tracker.getDepthSnapshot(SYMBOL).bids).toEqual([]);
  });

  test("cancelOrder removes order from B-Tree", () => {
    tracker.addOrder("order-to-cancel", 50000, 1.0, Side.Buy, SYMBOL);
    expect(tracker.getDepthSnapshot(SYMBOL).bids).toEqual([[50000, 1.0]]);

    tracker.cancelOrder("order-to-cancel", SYMBOL);
    expect(tracker.getDepthSnapshot(SYMBOL).bids).toEqual([]);
  });
});
