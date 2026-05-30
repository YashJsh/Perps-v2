import redis from "redis";

const senderClient = redis.createClient({
    url: "redis://localhost:6379"
});

await senderClient.connect();




export { senderClient };

