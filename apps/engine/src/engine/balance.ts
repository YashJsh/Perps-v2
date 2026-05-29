import type { AddBalancePayload, EngineRequest } from "types";
import { BALANCES } from "../store/store";
import { getAllJSDocTags } from "typescript";

const handleAddBalance = (payload: unknown) => {
    const data = payload as AddBalancePayload;
    const user = BALANCES.get(data.userId);
    if (!user) {
        console.log("User is not listed yet");
        let setBal = BALANCES.set(data.userId, {
            available: data.amount,
            locked: 0
        });
        let getBal = BALANCES.get(data.userId);
        if (!getBal){
            throw new Error("User not found");
        }
        return {
            userId: data.userId,
            available : getBal.available,
            locked : getBal.locked
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