import express from "express";
import authRouter from "./src/routes/auth.route"
import exchangeRouter from "./src/routes/exchange.route"
import { listenForResponses } from "./src/utils/engine_request";

const app = express();

listenForResponses();

app.use(express.json());

app.use("/auth", authRouter);
app.use("/api/orders", exchangeRouter);

app.listen(3000, ()=> {
    console.log("Server is listening on port 3000")
});

