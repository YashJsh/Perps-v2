import redis from "redis";

const client = redis.createClient({
    url : "redis://localhost:6379"
});

await client.connect();

export { client as EngineEventClient};