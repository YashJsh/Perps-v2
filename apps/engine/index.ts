
import type { EngineRequest, EngineResponse } from "types";
import { engineHandlePlease } from "./src/engine/engine";
import { senderClient } from "./src/redis/engine_response";
import { command_receiver_client } from "./src/redis/command_reciever";

const sendResponse = async (data: unknown) => {
    senderClient.xAdd("engine_response", "*", {
        response: JSON.stringify(data)
    })
}

const main = async () => {
    while (true) {
        const message = await command_receiver_client.xRead([
            {
                key: "engine_data",
                id: "$"
            },

        ], {
            BLOCK: 0
        });
        if (!message) {
            continue;
        }
       
        //@ts-ignore
        let data = message[0].messages[0].message.data;
        let parsedData = JSON.parse(data) as EngineRequest;
    
        try {
            const response = engineHandlePlease(parsedData);
            if (!response){
                continue;
            }
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
