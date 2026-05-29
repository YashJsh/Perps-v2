import { EngineRequestOptions, type AddBalanceResponse, type CreateOrderResponse, type EngineRequest, type EngineResponse, type EngineResponseData } from "types";
import { handleAddBalance } from "./balance";
import { handleCreateOrder } from "./createOrder";
import { handleCurrentPrice } from "./price";
import { handleDeleteOrder } from "./deleteOrder";


const engineHandlePlease = (request : EngineRequest)=>{
    if (request.type == EngineRequestOptions.AddBalance){
        const res = handleAddBalance(request.payload);
        const response_object : EngineResponse = {
            correlationId : request.correlationId,
            ok : true,
            data : res
        };
        return response_object
    };

    if (request.type == EngineRequestOptions.CreateOrder){
        const response = handleCreateOrder(request);
        const response_object : EngineResponse = {
            correlationId : request.correlationId,
            ok : true,
            data : response
        }
        return response_object;
    }

    if (request.type == EngineRequestOptions.CurrentPrice){
        handleCurrentPrice(request);   
    }

    if (request.type == EngineRequestOptions.CancelOrder){
        const response = handleDeleteOrder(request);
        const response_object : EngineResponse = {
            correlationId : request.correlationId,
            ok : true,
            data : response
        }
        return response_object;
    }
}

export { engineHandlePlease }