import type { EngineRequest, EngineRequestOptions, EngineResponse } from "types";
import redis from "redis";
import { JsonWebTokenError } from "jsonwebtoken";

interface PendingResponse {
  resolve: (response: EngineResponse) => void;
  reject: (error: Error) => void;
  //timeout: ReturnType<typeof setTimeout>;
}

export const pendingResponse = new Map<string, PendingResponse>();

const publisherClient = redis.createClient({
    url : "redis://localhost:6379"
});

const subscriberClient = redis.createClient({
        url: "redis://localhost:6379"
});

await publisherClient.connect();
await subscriberClient.connect();

export const sendToEngine = async (type: EngineRequestOptions, payload: Record<string, unknown>) : Promise<EngineResponse>=> {
    const correlation_id = crypto.randomUUID();
    const message: EngineRequest = {
        correlationId: correlation_id,
        type,
        payload,
    };

    let response_promise = await waitForResponse(correlation_id);

    await publisherClient.xAdd("engine_data", "*", {
        data : JSON.stringify(message)
    })
    return response_promise;
}

export const waitForResponse = async (correlationId : string)=>{
    //Otherwise send a timeout for the data.
    return new Promise<EngineResponse>((resolve, reject)=>{
        pendingResponse.set(correlationId, {
            resolve,
            reject
        })
    });
}

export const listenForResponses = async ()=>{
    for (;;){

        const message = await subscriberClient.xRead([
            {
                key: "engine_response",
                id: "$"
            },
        ], {
            BLOCK : 0
        });
        if (!message){
            continue;
        }

        //@ts-ignore
        let data =  message[0].messages[0].message.response;
        let parsedData = JSON.parse(data) as EngineResponse;
        if (!parsedData){
            return;
        }

        let pendingRes = pendingResponse.get(parsedData.correlationId);
        if (!pendingRes){
            return;
        }
        pendingRes.resolve(parsedData);
        pendingResponse.delete(parsedData.correlationId);
    }
}
