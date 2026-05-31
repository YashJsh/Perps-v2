import redis from "redis";
import { EngineRequestOptions, type EngineRequest } from "types";

const client = redis.createClient({
  url: "redis://localhost:6379"
});

await client.connect();

const event: EngineRequest = {
  correlationId: crypto.randomUUID(),
  type: EngineRequestOptions.Snapshot,
  payload: {}
}


const takeSnapShotService = () => {
  while (true) {
    setTimeout(async () => {
      await client.xAdd("engine-data", "*", {
        data: JSON.stringify(event)
      })
    }, 60000)
  }
}

takeSnapShotService();
