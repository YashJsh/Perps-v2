import express from "express";
import authRouter from "./src/routes/auth.route"
import { REDISEARCH_LANGUAGE } from "redis";
import redis from "redis";

const app = express();

const producerClient = redis.createClient();
await producerClient.connect();

producerClient.xAdd("engine_data", "*", {
    correlation_id : "1",
    data  : "from Backend"
});

app.use(express.json());
app.use("/auth", authRouter);


app.listen(3000, ()=> {
    console.log("Server is listening on port 3000")
});

export { producerClient };