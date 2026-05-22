
export enum EngineRequestOptions{
    CreateOrder,
    AddBalance,
    CloseOrder
}

interface EngineRequest {
    correlationId : string,
    type : EngineRequestOptions,
    payload : unknown
}

interface EngineResponse {
  correlationId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

enum Side{
    Buy,
    Sell
}

enum Type{
    Market,
    Limit
}

enum OrderStatus{
    PartiallyFilled,
    Filled,
    Open,
    Cancelled
}

interface Order{
    orderId : string,
    userId : string,
    status : OrderStatus,
    side : Side,
    type : Type,
    quantity : number,
    filledQty : number,
    remainingQty : number,
    price : number,
    symbol : string,
    fills : Fill[],
    timestamp: number;
}

interface Position{
    id : string,
    userId : string,
    averageEntryPrice : number,
    liquidationPrice : number,
    unrealizedPnl: number,
    margin : number,
    leverage : number,
    symbol : string,
}

interface RestingOrder{
    orderId : string,
    userId : string,
    side: Side,
    filledQty : number,
    remainingQty : number,
    symbol : string,
    price : number,
    timestamp: number;
}

interface Fill{
    orderId : string,
    makerId : string,
    takerId : string,
    makerOrderId : string,
    takerOrderId : string,
    filledQty : number,
    price : number
}

interface Orderbook{
    asks : Map<number, RestingOrder[]>,
    bids : Map<number, RestingOrder[]>
}


export type { EngineRequest, EngineResponse, Orderbook, Fill, Order, Position,}