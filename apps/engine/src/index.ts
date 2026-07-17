
import type { EngineRequest, EngineResponse } from "types";
import { engineHandlePlease } from "./engine/engine";
import { senderClient } from "./redis/engine_response";
import { command_receiver_client } from "./redis/command_reciever";
import { seedOrderBook } from "./engine/seed";
import { loadLatestSnapShot } from "./recovery/loadSnapshot";
import { rehydrateState } from "./recovery/rehydrate"

const sendResponse = async (data: unknown) => {
    senderClient.xAdd("engine:responses", "*", {
        response: JSON.stringify(data)
    })
}

const main = async () => {
    seedOrderBook();
    let snapShotId = "0-0";

    try {
        const snapshot = loadLatestSnapShot();
        if (snapshot) {
            rehydrateState(snapshot);
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
                engineHandlePlease(parsedData, msg.id, { isReplay: true });
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
            const response = engineHandlePlease(parsedData, streamId);
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

