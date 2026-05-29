
import type { Side, Type } from "..";

interface BaseEvent{
    eventId : string,
    sequenceId : string,
    timestamp : number,
}

enum EngineEvents{
    OrderAccepted,
    OrderRejected,
    OrderCancelled,
    TradeExecuted,
    PositionUpdated,
    PositionClosed,
    BalanceUpdated,
    RealizedPnlUpated,
    FundingPaymentEvent,
    LiquidationTriggered,
}

interface OrderAcceptedEvent extends BaseEvent{
    type : EngineEvents.OrderAccepted,
    orderId : string,
    userId : string,
    market : Type,
    side : Side,
    price : number,
    quantity : number,
    leverage : number
}

interface OrderRejectedEvent extends BaseEvent{
    type : EngineEvents.OrderRejected,
    userId : string,
    reason : string,
}

interface OrderCancelledEvent extends BaseEvent{
    type : EngineEvents.OrderCancelled,
    userId : string,
    orderId : string,
    remaining_qty : number,
}

interface TradeExecuted extends BaseEvent{
    type : EngineEvents.TradeExecuted,
    tradeId : string,
    market : string,
    makerOrderId : string,
    takerOrderId : string,
    makerUserId : string,
    takerUserId : string,
    quantity : number,
    price : number,
}

interface PositionUpdated extends BaseEvent{
    type : EngineEvents.PositionUpdated,
    userId : string,
    market : string,
    previousSize : number,
    newSize : string,
    averageEntryPrice : number
}

interface PositionClosed extends BaseEvent{
    type : EngineEvents.PositionClosed,
    userId : string,
    market : string,
    realizedpnl : number,
    averageEntryPrice : number,
    averageClosingPrice : number,
    size : number
}

interface BalanceUpdated extends BaseEvent{
    type : EngineEvents.BalanceUpdated,
    userId : string,
    previousBalance : number,
    newBalance : number,
    reason : 
    | "TRADE"
    | "REALIZED_PNL"
    | "LIQUIDATION"
    | "FUNDING"
}

interface RealizedPnlUpated extends BaseEvent{
    type : EngineEvents.RealizedPnlUpated,
    userId : string,
    pnl : number,
}

interface FundingPaymentEvent extends BaseEvent{
    type : EngineEvents.FundingPaymentEvent,
    userId : string,
    market : string,
    fundingRate : number,
    paymentAmount : number
}

interface LiquidationTrigerred extends BaseEvent{
    type : EngineEvents.LiquidationTriggered,
    userId : string,
    market : string,
    positionSize : number,
    markPrice : number,
    margin : number,
}

export type {
    BalanceUpdated,
    BaseEvent,
    FundingPaymentEvent,
    LiquidationTrigerred,
    OrderAcceptedEvent,
    OrderCancelledEvent,
    OrderRejectedEvent,
    PositionClosed,
    PositionUpdated, 
    RealizedPnlUpated,
    TradeExecuted,
}