import redis from "redis";
import { EngineEvents, type OrderAcceptedEvent, type DeleteOrderEvent, type TradeExecutedEvent } from "types";
import type { OrderBookTracker } from "./orderbook";
import { broadcastDepth, broadcastTrade } from "./wsServer";

export const startRedisSubscriber = async (tracker: OrderBookTracker) => {
  const client = redis.createClient({
    url: "redis://localhost:6379"
  });

  await client.connect();
  console.log("[RedisSubscriber] Connected to Redis stream client for events");

  let lastProcessedId = "0-0";

  while (true) {
    try {
      const response = await client.xRead(
        [
          {
            key: "engine:events",
            id: lastProcessedId
          }
        ],
        {
          BLOCK: 0,
          COUNT: 100
        }
      );
      //@ts-ignore
      if (!response || response.length === 0) continue;

      //@ts-ignore
      const messages = response[0].messages;
      for (const msg of messages) {
        try {
          const parsed = JSON.parse(msg.message.event);
          const type = parsed.type;

          if (type === EngineEvents.OrderAccepted) {
            const event = parsed as OrderAcceptedEvent;
            console.log(`[RedisSubscriber] OrderAccepted: ${event.orderId} at ${event.price}`);
            tracker.addOrder(
              event.orderId,
              event.price,
              event.quantity,
              event.side,
              event.market
            );
            broadcastDepth(event.market);
          } 
          else if (type === EngineEvents.DeleteOrderEvent) {
            const event = parsed as DeleteOrderEvent;
            console.log(`[RedisSubscriber] DeleteOrderEvent: ${event.orderId}`);
            
            const market = tracker.getMarketOfOrder(event.orderId) || "BTC-USD";
            tracker.cancelOrder(event.orderId, market);
            broadcastDepth(market);
          } 
          else if (type === EngineEvents.TradeExecuted) {
            const event = parsed as TradeExecutedEvent;
            console.log(`[RedisSubscriber] TradeExecuted maker: ${event.makerOrderId} qty: ${event.quantity}`);
            tracker.updateOrderFill(
              event.makerOrderId,
              event.quantity,
              event.price,
              event.market
            );
            broadcastDepth(event.market);
            broadcastTrade(event.market, event);
          }
        } catch (err) {
          console.error("[RedisSubscriber] Error parsing individual stream event:", err);
        }
        
        lastProcessedId = msg.id;
      }
    } catch (err) {
      console.error("[RedisSubscriber] Event stream subscription read error:", err);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};
