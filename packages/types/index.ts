import BTree from 'sorted-btree'

export enum EngineRequestOptions{
    CreateOrder,
    AddBalance,
    CloseOrder,
    CurrentPrice,
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

export enum Side{
    Buy,
    Sell
}

export enum Type{
    Market,
    Limit
}

export enum OrderStatus{
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
    timestamp: number;
    leverage : number;
}

interface Position{
    id : string,
    userId : string,
    averageEntryPrice : number,
    liquidationPrice : number,
    unrealizedPnl: number,
    size : number,
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
    asks : BTree<number, RestingOrder[]>,
    bids : BTree<number, RestingOrder[]>
}

interface Balance {
  available: number;
  locked: number;
}

export interface AddBalancePayload{
    userId : string,
    symbol : string,
    amount : number
}

export interface CreateOrderPayload{
    userId : string,
    symbol : string,
    price : number,
    quantity : number,
    side : Side,
    type : Type,
    leverage : number
}

export type { EngineRequest, EngineResponse, Orderbook, Fill, Order, Position, Balance, RestingOrder}