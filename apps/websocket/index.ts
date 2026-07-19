import { startPriceClient } from "./src/priceClient";
import { startWSServer } from "./src/wsServer";
import { startRedisSubscriber } from "./src/redisSubscriber";
import { OrderBookTracker } from "./src/orderbook";

const startAll = async () => {
  console.log("[App] Starting WebSocket application services...");
  
  // 1. Create the single orderbook tracker instance
  const tracker = new OrderBookTracker();

  // 2. Start Spot Price Client (feeder to matching engine)
  startPriceClient().catch((err) => {
    console.error("[App] Failed to start Spot Price Client:", err);
  });

  // 3. Start Frontend WebSocket Server (observer)
  startWSServer(tracker);

  // 4. Start Event Stream Listener (observer)
  startRedisSubscriber(tracker).catch((err) => {
    console.error("[App] Failed to start Redis Subscriber:", err);
  });
};

startAll();