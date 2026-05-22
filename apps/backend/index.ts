import express from "express";
import authRouter from "./src/routes/auth.route"
import { REDISEARCH_LANGUAGE } from "redis";
import redis from "redis";
import { listenForResponses } from "./src/utils/engine_request";

const app = express();

listenForResponses();

app.use(express.json());

app.use("/auth", authRouter);
app.use("/api/orders", );


app.listen(3000, ()=> {
    console.log("Server is listening on port 3000")
});

