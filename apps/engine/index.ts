
import redis from "redis";
import type{ EngineResponse } from "types";

const client = redis.createClient({
        url: "redis://localhost:6379"
});



const main = async () => {
    await client.connect();
    let engineResponse : EngineResponse = {
        correlationId : "2",
        ok : true,
        data : {
            filled : 12,
            status : "OrderMatchedSuccessfully"
        }
    }
    client.xAdd("engine_response", "*", {
        response : JSON.stringify(engineResponse)
    });

    // while (true) {
    //     const message = await client.xRead([
    //         {
    //             key: "engine_data",
    //             id: "$"
    //         },
            
    //     ], {
    //         BLOCK : 0
    //     });
    //     console.log(message);
    // }
};

main();
