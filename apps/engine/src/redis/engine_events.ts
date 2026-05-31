import redis from "redis";
import type { EngineEvent } from "types";

const client = redis.createClient({
  url: "redis://localhost:6379"
});

await client.connect();

const sendToEngineStream = async (data: EngineEvent) => {
  await client.xAdd(
    "engine_events",
    "*",
    {
      event: JSON.stringify(data)
    }
  )
}

export { client as EngineEventClient, sendToEngineStream };
