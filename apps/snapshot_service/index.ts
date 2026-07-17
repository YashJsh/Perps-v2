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
  setInterval(async () => {
    await client.xAdd("engine:requests", "*", {
      data: JSON.stringify(event),
    });
    console.log("Snapshot command sent");
  }, 60000);
};



takeSnapShotService();
