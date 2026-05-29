export interface CreateOrderResponse{
    orderId : string,
    status : "OPEN" | "PARTIALLY_FILLED" | "FILLED",
    filledQty : number,
    remainingQty : number
}

export interface CancelOrderResponse{
    orderId : string,
    success : boolean
}

export interface AddBalanceResponse{
    userId : string,
    available : number,
    locked : number
}

export type EngineResponseData =
    | CreateOrderResponse
    | CancelOrderResponse
    | AddBalanceResponse;

