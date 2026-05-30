import type { AddBalancePayload, EngineRequest, BalanceAddedEvent, HandleResult, AddBalanceResponse } from "types";
import { EngineEvents } from "types";
import { BALANCES } from "../store/store";
import { sendToEngineStream } from "../redis/engine_events";

const handleAddBalance = (payload: unknown, streamId: string): HandleResult<AddBalanceResponse> => {
    const data = payload as AddBalancePayload;
    const user = BALANCES.get(data.userId);

    if (!user) {
        console.log("User is not listed yet");
        let setBal = BALANCES.set(data.userId, {
            available: data.amount,
            locked: 0
        });
        let getBal = BALANCES.get(data.userId);
        if (!getBal) {
            throw new Error("User not found");
        }
        let addedBalanceStreamData: BalanceAddedEvent = {
            eventId: crypto.randomUUID(),
            streamId: streamId,
            type: EngineEvents.BalanceAdded,
            newBalance: getBal.available,
            previousBalance: 0,
            userId: data.userId,
            timestamp: Date.now()
        }
        return {
            response: {
                userId: data.userId,
                available: getBal.available,
                locked: getBal.locked
            },
            events: [addedBalanceStreamData]

        }
    }
    const previous_balance = user.available;
    user.available += data.amount;
    let addedBalanceStreamData: BalanceAddedEvent = {
        eventId: crypto.randomUUID(),
        streamId: streamId,
        type: EngineEvents.BalanceAdded,
        newBalance: user.available,
        previousBalance: previous_balance,
        userId: data.userId,
        timestamp: Date.now()
    }
    //Sending this event to the engine stream;
    return {
        response: {
            userId: data.userId,
            available: user.available,
            locked: user.locked
        },
        events: [addedBalanceStreamData]
    }
}

const handleBalanceChecks = () => {

}

export {
    handleAddBalance,
    handleBalanceChecks
}