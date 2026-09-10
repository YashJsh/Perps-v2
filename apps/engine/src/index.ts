
import type { EngineRequest, EngineResponse } from "types";
import { PerpsEngine } from "./engine/perps-engine";
import { sendToEngineStream } from "./redis/event-stream";
import { senderClient } from "./redis/response-stream";
import { command_receiver_client } from "./redis/request-stream";
import { seedOrderBook } from "./engine/market-initialization";
import { loadLatestSnapShot } from "./recovery/loadSnapshot";
import { rehydrateState } from "./recovery/rehydrate"
import { EngineState } from "./state/engine-state";

const sendResponse = async (data: unknown) => {
    senderClient.xAdd("engine:responses", "*", {
        response: JSON.stringify(data)
    })
}

const main = async () => {
    const state = new EngineState();
    const engine = new PerpsEngine(state, sendToEngineStream);
    seedOrderBook(state);
    let snapShotId = "0-0";

    try {
        const snapshot = loadLatestSnapShot();
        if (snapshot) {
            rehydrateState(snapshot, state);
            snapShotId = snapshot.last_processed_command_id;
            console.log(`Rehydrated state from snapshot at ID: ${snapShotId}`);
        }
    } catch (error) {
        console.error("Failed to load snapshot, initializing empty state", error);
    }

    //2. Find the last event which happened.
    let commitId = snapShotId;
    try {
        const latestEvents = await command_receiver_client.xRevRange("engine_events", "+", "-", { COUNT: 1 });
        if (latestEvents && latestEvents.length > 0) {
            const parsedEventData = JSON.parse(latestEvents[0]?.message.event!);
            if (parsedEventData && parsedEventData.streamId) {
                commitId = parsedEventData.streamId;
                console.log(`Discovered last committed event request ID: ${commitId}`);
            }
        }
    } catch (error) {
        console.error("Failed to determine commit ID from stream, defaulting to snapshotId", error);
    }

    // The silent replay phase:
    if (snapShotId !== commitId) {
        console.log(`Replaying events from ${snapShotId} to ${commitId}`);
        try {
            const replayMessages = await command_receiver_client.xRange("engine_data", `(${snapShotId}`, commitId);
            for (const msg of replayMessages) {
                //@ts-ignore
                const parsedData = JSON.parse(msg.message.data) as EngineRequest;
                engine.execute(parsedData, msg.id, { isReplay: true });
                console.log(`Silently replayed message: ${msg.id}`);
            }
        } catch (error) {
            console.error("Failed to replay stream deltas", error);
        }
    }

    let lastProcessedId = commitId === "0-0" ? "$" : commitId;
    console.log(`Starting Live Processing`, lastProcessedId);


    while (true) {
        const message = await command_receiver_client.xRead([
            {
                key: "engine:requests",
                id: lastProcessedId
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
        console.log("Event Recieved", parsedData);
        //@ts-ignore
        const streamId = message[0].messages[0].id;
        try {
            const response = engine.execute(parsedData, streamId);
            if (!response) {
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
