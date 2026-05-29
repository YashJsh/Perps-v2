import BTree from 'sorted-btree'
import type { EngineResponseData } from './src/engine_command';

export * from "./src/event_stream";
export * from "./src/engine_command";

export enum EngineRequestOptions{
    CreateOrder,
    AddBalance,
    ClosePosition,
    CurrentPrice,
    CancelOrder
}

interface EngineRequest {
    correlationId : string,
    type : EngineRequestOptions,
    payload : unknown
}

interface EngineResponse {
  correlationId: string;
  ok: boolean;
  data?: EngineResponseData;
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
    userId : string,
    averageEntryPrice : number,
    liquidationPrice : number,
    realizedPnl: number | null,
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
    price : number,
    marked : boolean
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

export interface DeleteOrderPayload{
    userId : string, 
    orderId : string,
    symbol : string
}

export type { EngineRequest, EngineResponse, Orderbook, Fill, Order, Position, Balance, RestingOrder}