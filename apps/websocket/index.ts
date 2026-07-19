import { startPriceClient } from "./src/priceClient";

const startAll = async () => {
  console.log("[App] Starting price client feeder...");
  
  startPriceClient().catch((err) => {
    console.error("[App] Failed to start price client:", err);
  });
};

startAll();