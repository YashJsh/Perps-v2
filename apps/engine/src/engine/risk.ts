import { Side, type CreateOrderPayload } from "types";
import { POSITION } from "../store/store";

export const riskEngine = (payload: CreateOrderPayload): Boolean => {
    const position_key = payload.userId + payload.symbol;
    const position = POSITION.get(position_key);
    if (!position) {
        return true;
    };

    const current = payload.side == Side.Buy ? position.size : - position.size;
    const next = current + payload.quantity;

    if (Math.abs(current) < Math.abs(next)){
        return true;
    }
    else{
        return false;
    }
}