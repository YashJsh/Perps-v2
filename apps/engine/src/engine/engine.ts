import { EngineRequestOptions, type EngineRequest, type EngineResponse } from "types";
import { handleAddBalance } from "./balance";
import { handleCreateOrder } from "./createOrder";
import { handleCurrentPrice } from "./price";


const engineHandlePlease = (request : EngineRequest)=>{
    if (request.type == EngineRequestOptions.AddBalance){
        const res = handleAddBalance(request.payload);
        const response_object : EngineResponse = {
            correlationId : request.correlationId,
            ok : true,
            data : res
        } 
        return response_object
    };

    if (request.type == EngineRequestOptions.CreateOrder){
        const response = handleCreateOrder(request);
        return response;
    }

    if (request.type == EngineRequestOptions.CurrentPrice){
        handleCurrentPrice(request);   
    }
}

export { engineHandlePlease }