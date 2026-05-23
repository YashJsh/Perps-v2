import { WebSocket } from "ws";

import redis from "redis";
import { EngineRequestOptions, type EngineRequest } from "types";

const client = redis.createClient({
    url : "redis://localhost:6379"
});

await client.connect();

const sendToEngine = async (symbol : string, price : number)=>{
    const data : EngineRequest = {
        correlationId : crypto.randomUUID(),
        type : EngineRequestOptions.CurrentPrice,
        payload : {
            symbol,
            price
        }
    };
    await client.xAdd("engine_data", "*", {
        data : JSON.stringify(data)
    })
    return;
}

const createConnection = () => {
    const wss = new WebSocket(
        'wss://dstream.binance.com/ws/btcusd@indexPrice',
    );
    wss.on("message", (event) => {
        const parsedEvent = JSON.parse(event.toString());
        const price = parsedEvent.p;
        console.log("Sending data : ", price);
        sendToEngine("BTC", price);
    });
};

createConnection();