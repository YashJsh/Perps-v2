import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  EngineRequestOptions,
  OrderStatus,
  Side,
  Type,
  type EngineRequest,
  type EngineResponse,
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
} from "../../engine/src/store/store";

const SYMBOL = "BTC-USD";

const createOrderbook = (): Orderbook => ({
  asks: new Map<number, RestingOrder[]>() as unknown as Orderbook["asks"],
  bids: new Map<number, RestingOrder[]>() as unknown as Orderbook["bids"],
});

const resetEngineStore = () => {
  BALANCES.clear();
  FILLS.clear();
  MARKPRICE.clear();
  ORDER.clear();
  ORDERBOOK.clear();
  POSITION.clear();
};

const bridgeToEngine = async (
  type: EngineRequestOptions,
  payload: Record<string, unknown>,
): Promise<EngineResponse> => {
  const correlationId = crypto.randomUUID();
  const request: EngineRequest = {
    correlationId,
    type,
    payload,
  };

  try {
    const response = engineHandlePlease(request);
    if (!response) {
      throw new Error("Engine produced no response");
    }
    return response as EngineResponse;
  } catch (error) {
    return {
      correlationId,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown engine error",
    };
  }
};

mock.module("../src/utils/engine_request", () => ({
  sendToEngine: bridgeToEngine,
}));

const { createOrderController, cancelOrderController } = await import(
  "../src/controllers/exchange.controller"
);

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

const makeResponse = (): MockResponse => {
  const response: MockResponse = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return response;
};

beforeEach(() => {
  resetEngineStore();
});

describe("backend -> engine integration flow", () => {
  test("rejects a realistic create-order payload at backend validation", async () => {
    const req = {
      body: {
        userId: "user-1",
        symbol: SYMBOL,
        price: 100,
        quantity: 1,
        side: "Buy",
        type: "Limit",
        leverage: 5,
      },
    };
    const res = makeResponse();

    await createOrderController(req as never, res as never);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: "Invalid body error/ Error in body",
    });
  });

  test("a schema-valid create-order request still fails the full backend-engine flow", async () => {
    ORDERBOOK.set("Buy", createOrderbook());
    BALANCES.set("user-1", {
      available: 10_000,
      locked: 0,
    });

    const req = {
      body: {
        userId: "user-1",
        symbol: "Buy",
        price: 100,
        quantity: 1,
        side: "Buy",
        type: "Limit",
        leverage: 5,
      },
    };
    const res = makeResponse();

    await createOrderController(req as never, res as never);

    expect(res.statusCode).toBe(500);
    expect(res.body).toBe("Engine produced no response");
  });

  test("cancel-order flow fails because the backend does not send symbol to the engine", async () => {
    ORDERBOOK.set(SYMBOL, createOrderbook());
    ORDER.set("seed-order", {
      orderId: "seed-order",
      userId: "buyer-1",
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
    ORDERBOOK.get(SYMBOL)?.bids.set(100, [
      {
        orderId: "seed-order",
        userId: "buyer-1",
        side: Side.Buy,
        filledQty: 0,
        remainingQty: 1,
        symbol: SYMBOL,
        price: 100,
        timestamp: Date.now(),
      },
    ]);

    const req = {
      body: {
        orderId: "seed-order",
      },
      id: "buyer-1",
    };
    const res = makeResponse();

    await cancelOrderController(req as never, res as never);

    expect(res.statusCode).toBe(500);
    expect(res.body).toBe("Orderbook not found");
  });
});
