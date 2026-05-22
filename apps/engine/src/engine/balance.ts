import type { AddBalancePayload, EngineRequest } from "types";
import { BALANCES } from "../store/store";

const handleAddBalance = (payload: unknown) => {
    const data = payload as AddBalancePayload;
    const user = BALANCES.get(data.userId);
    if (!user) {
        console.log("User is not listed yet");
        let setBal = BALANCES.set(data.userId, {
            available: data.amount,
            locked: 0
        });
        return {
            userId: data.userId,
            available : setBal.get(data.userId)?.available,
            locked : setBal.get(data.userId)?.locked
        }
    }
    user.available += data.amount;
    return {
        userId: data.userId,
        available: user.available,
        locked: user.locked
    }
}

const handleBalanceChecks = ()=>{
  
}

export {
    handleAddBalance,
    handleBalanceChecks
}