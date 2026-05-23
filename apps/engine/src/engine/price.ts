import type { EngineRequest } from "types";
import { MARKPRICE } from "../store/store";
import { isConstructorTypeNode } from "typescript";

const handleCurrentPrice = (request : EngineRequest)=>{
    const payload = request.payload as { 
        symbol : string,
        price : number
    };
    let markPrice = MARKPRICE.getOrInsert(payload.symbol, payload.price);
    markPrice = payload.price;
    console.log("Current Price is : ", markPrice);
}

export { handleCurrentPrice }