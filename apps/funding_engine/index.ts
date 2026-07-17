import redis from "redis";
import { type EngineRequest, EngineRequestOptions } from "types";

const client = redis.createClient({
  url: "redis://localhost:6379"
});

await client.connect();

const sendEvent = async () => {
  const message: EngineRequest = {
    correlationId: crypto.randomUUID(),
    type: EngineRequestOptions.ProceedFunding,
    payload: {
      symbol: "BTC"
    },
  };
  await client.xAdd("engine:requests", "*", {
    data: JSON.stringify(message)
  })
}

const fundingEngine = () => {
  setInterval(async () => {
    try {
      await sendEvent();
    } catch (err) {
      console.error("Failed to send funding event:", err);
    }
  }, 30000);
};


fundingEngine();
