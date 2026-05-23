import type { EngineRequest } from "types";
import { MARKPRICE } from "../store/store";

const handleCurrentPrice = (request : EngineRequest)=>{
    const payload = request.payload as { 
        symbol : string,
        price : number
    };
    MARKPRICE.getOrInsert(payload.symbol, payload.price);
}

export { handleCurrentPrice }