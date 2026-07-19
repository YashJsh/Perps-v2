import { WebSocket } from "ws";
import redis from "redis";
import { EngineRequestOptions, type EngineRequest } from "types";

export const startPriceClient = async () => {
  const client = redis.createClient({
    url: "redis://localhost:6379"
  });

  await client.connect();

  const sendToEngine = async (symbol: string, price: number) => {
    const data: EngineRequest = {
      correlationId: crypto.randomUUID(),
      type: EngineRequestOptions.CurrentPrice,
      payload: {
        symbol,
        price
      }
    };
    await client.xAdd("engine:requests", "*", {
      data: JSON.stringify(data)
    });
  };

  const createConnection = () => {
    const wss = new WebSocket(
      'wss://dstream.binance.com/ws/btcusd@indexPrice',
    );
    
    wss.on("open", () => {
      console.log("[PriceClient] Connected to Binance Spot Index WebSocket");
    });

    wss.on("message", (event) => {
      try {
        const parsedEvent = JSON.parse(event.toString());
        const price = parseFloat(parsedEvent.p);
        if (!isNaN(price)) {
          sendToEngine("BTC", price);
        }
      } catch (err) {
        console.error("[PriceClient] Failed to parse price event:", err);
      }
    });

    wss.on("error", (err) => {
      console.error("[PriceClient] WebSocket error:", err);
    });

    wss.on("close", () => {
      console.log("[PriceClient] Connection closed, reconnecting in 5s...");
      setTimeout(createConnection, 5000);
    });
  };

  createConnection();
};
