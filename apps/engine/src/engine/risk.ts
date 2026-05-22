import type { CreateOrderPayload } from "types";
import { POSITION } from "../store/store";

export const riskEngine = (paylaod: CreateOrderPayload): Boolean => {
    const position_key = paylaod.userId + paylaod.symbol;
    const position = POSITION.get(position_key);
    if (!position) {
        return true;
    };
    const current = position.size;
    const next = current + paylaod.quantity;

    if (Math.abs(current) < Math.abs(next)){
        return true;
    }
    else{
        return false;
    }
}