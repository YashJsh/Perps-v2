import type { EngineResponse, Order } from "types";

enum DataType{
    CreateOrderResponse,
    DeleteOrderResponse,
}

interface Payload{
    type : DataType,
    payload : unknown
}


const handleData = (data : EngineResponse)=>{
    const recieved = data.data as Payload;
    
    if (recieved.type == DataType.CreateOrderResponse){
        const responseData = recieved.payload as Order;
    }
    else if (recieved.type == DataType.DeleteOrderResponse){
        const DeleteOrder = recieved.payload as Order;
    }
    else{
        
    }
}

export { handleData }