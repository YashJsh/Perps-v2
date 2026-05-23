
import redis from "redis";
import type { EngineRequest, EngineResponse } from "types";
import { engineHandlePlease } from "./src/engine/engine";

const client = redis.createClient({
    url: "redis://localhost:6379"
});

const senderClient = redis.createClient({
    url: "redis://localhost:6379"
})

const sendResponse = async (data: unknown) => {
    senderClient.xAdd("engine_response", "*", {
        response: JSON.stringify(data)
    })
}

const main = async () => {
    await client.connect();
    while (true) {
        const message = await client.xRead([
            {
                key: "engine_data",
                id: "$"
            },

        ], {
            BLOCK: 0
        });
        console.log(message);
        if (!message) {
            continue;
        }
        //@ts-ignore
        let data = message[0].messages[0].message.response;
        let parsedData = JSON.parse(data) as EngineRequest;

        try {
            const response = engineHandlePlease(parsedData);
            await sendResponse(response);
        } catch (err) {
            const errorResponse: EngineResponse = {
                correlationId: parsedData.correlationId,
                ok: false,
                error: err instanceof Error
                    ? err.message
                    : "Unknown engine error"
            };
            await sendResponse(errorResponse);
        }
    }
};
main();


// let engineResponse : EngineResponse = {
//         correlationId : "2",
//         ok : true,
//         data : {
//             filled : 12,
//             status : "OrderMatchedSuccessfully"
//         }
//     }
//     client.xAdd("engine_response", "*", {
//         response : JSON.stringify(engineResponse)
//     });