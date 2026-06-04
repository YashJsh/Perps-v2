import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createClient } from "redis";
import {
  EngineRequestOptions,
  Side,
  Type,
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
import { sendToEngine, pendingResponse } from "../src/utils/engine_request";

const REDIS_URL = "redis://localhost:6379";
const SYMBOL = "BTC-USD";

const testRedis = createClient({ url: REDIS_URL });

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

beforeAll(async () => {
  await testRedis.connect();
});

afterAll(async () => {
  await testRedis.quit();
});

beforeEach(async () => {
  resetEngineStore();
  await testRedis.sendCommand(["DEL", "engine_data", "engine_response", "engine_events"]);
});

test("CREATE_ORDER flows through real Redis via engineHandlePlease", async () => {
  ORDERBOOK.set(SYMBOL, createOrderbook());
  BALANCES.set("user-1", { available: 10000, locked: 0 });

  const responsePromise = sendToEngine(EngineRequestOptions.CreateOrder, {
    userId: "user-1",
    symbol: SYMBOL,
    price: 100,
    quantity: 1,
    side: Side.Buy,
    type: Type.Limit,
    leverage: 5,
  });

  const entries = await testRedis.xRevRange("engine_data", "+", "-", {
    COUNT: 1,
  });
  expect(entries.length).toBeGreaterThan(0);
  const last = entries[0];
  const msg = JSON.parse(last.message.data);

  expect(msg.type).toBe(EngineRequestOptions.CreateOrder);
  expect(msg.payload).toMatchObject({
    userId: "user-1",
    symbol: SYMBOL,
    price: 100,
    quantity: 1,
    side: Side.Buy,
    type: Type.Limit,
    leverage: 5,
  });

  let engineResponse: EngineResponse;
  try {
    const response = engineHandlePlease(msg, last.id);
    engineResponse = response as EngineResponse;
  } catch (err) {
    engineResponse = {
      correlationId: msg.correlationId,
      ok: false,
      error: err instanceof Error ? err.message : "Unknown engine error",
    };
  }

  await testRedis.xAdd("engine_response", "*", {
    response: JSON.stringify(engineResponse),
  });

  const pending = pendingResponse.get(engineResponse.correlationId);
  expect(pending).toBeDefined();
  pending!.resolve(engineResponse);

  const result = await responsePromise;
  expect(result.ok).toBe(true);
  expect(result.correlationId).toBe(engineResponse.correlationId);
  expect(result.data).toBeDefined();
  expect(result.data).toHaveProperty("orderId");
  expect(result.data).toHaveProperty("filledQty", 0);
  expect(result.data).toHaveProperty("remainingQty", 1);

  const respEntries = await testRedis.xRevRange("engine_response", "+", "-", {
    COUNT: 1,
  });
  expect(respEntries.length).toBeGreaterThan(0);
  const lastResp = respEntries[0];
  const respData = JSON.parse(lastResp.message.response);
  expect(respData.ok).toBe(true);
  expect(respData.correlationId).toBe(msg.correlationId);
});
