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
  await client.xAdd("engine_data", "*", {
    data: JSON.stringify(message)
  })
}

const fundingEngine = () => {
  while (true) {
    setTimeout(() => {
      sendEvent();
    }, 30000)
  }
}

fundingEngine();
