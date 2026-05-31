
import type { Side, Type } from "..";

export interface HandleResult<T> {
  response: T,
  events: EngineEvent[]
}

interface BaseEvent {
  eventId: string,
  streamId: string,
  timestamp: number,
}

export enum EngineEvents {
  OrderAccepted = "ORDER_ACCEPTED",
  OrderRejected = "ORDER_REJECTED",
  OrderCancelled = "ORDER_CANCELLED",
  TradeExecuted = "TRADE_EXECUTED",
  PositionUpdated = "POSITION_UPDATED",
  PositionClosed = "POSITION_CLOSED",
  BalanceUpdated = "BALANCE_UPDATED",
  BalanceAdded = "BALANCE_ADDED",
  RealizedPnlUpated = "REALIZED_PNL_UPDATED",
  FundingPaymentEvent = "FUNDING_PAYMENT",
  LiquidationTriggered = "LIQUIDATION_TRIGGERED",
  DeleteOrderEvent = "DELETE_ORDER",
  SnapshotCreatedEvent = "SNAPSHOT_CREATED_EVENT"
}


interface SnapshotCreatedEvent extends BaseEvent {
  type: EngineEvents.SnapshotCreatedEvent,
  snapshotId: string,
  filePath: string
}
interface BalanceAddedEvent extends BaseEvent {
  type: EngineEvents.BalanceAdded,
  userId: string,
  previousBalance: number,
  newBalance: number,
}

interface OrderAcceptedEvent extends BaseEvent {
  type: EngineEvents.OrderAccepted,
  orderId: string,
  userId: string,
  market: string,
  side: Side,
  price: number,
  quantity: number,
  leverage: number
}

interface OrderRejectedEvent extends BaseEvent {
  type: EngineEvents.OrderRejected,
  userId: string,
  reason: string,
}

interface OrderCancelledEvent extends BaseEvent {
  type: EngineEvents.OrderCancelled,
  userId: string,
  orderId: string,
  remaining_qty: number,
}

interface TradeExecutedEvent extends BaseEvent {
  type: EngineEvents.TradeExecuted,
  //tradeId : string,
  market: string,
  makerOrderId: string,
  takerOrderId: string,
  makerUserId: string,
  takerUserId: string,
  quantity: number,
  price: number,
}

interface PositionUpdatedEvent extends BaseEvent {
  type: EngineEvents.PositionUpdated,
  userId: string,
  market: string,
  previousSize: number,
  newSize: string,
  averageEntryPrice: number
}

interface PositionClosedEvent extends BaseEvent {
  type: EngineEvents.PositionClosed,
  userId: string,
  market: string,
  realizedpnl: number,
  averageEntryPrice: number,
  averageClosingPrice: number,
  size: number
}

interface BalanceUpdatedEvent extends BaseEvent {
  type: EngineEvents.BalanceUpdated,
  userId: string,
  previousBalance: number,
  newBalance: number,
  reason:
  | "TRADE"
  | "REALIZED_PNL"
  | "LIQUIDATION"
  | "FUNDING"
}

interface RealizedPnlUpatedEvent extends BaseEvent {
  type: EngineEvents.RealizedPnlUpated,
  userId: string,
  pnl: number,
}

interface FundingPaymentEvent extends BaseEvent {
  type: EngineEvents.FundingPaymentEvent,
  userId: string,
  market: string,
  fundingRate: number,
  paymentAmount: number
}

interface LiquidationTrigerredEvent extends BaseEvent {
  type: EngineEvents.LiquidationTriggered,
  userId: string,
  market: string,
  positionSize: number,
  markPrice: number,
  margin: number,
}

interface DeleteOrderEvent extends BaseEvent {
  type: EngineEvents.DeleteOrderEvent,
  orderId: string,
  userId: string,
}

export type EngineEvent =
  | BalanceAddedEvent
  | BalanceUpdatedEvent
  | OrderAcceptedEvent
  | OrderRejectedEvent
  | OrderCancelledEvent
  | TradeExecutedEvent
  | PositionUpdatedEvent
  | PositionClosedEvent
  | RealizedPnlUpatedEvent
  | FundingPaymentEvent
  | DeleteOrderEvent
  | LiquidationTrigerredEvent
  | SnapshotCreatedEvent;

export type {
  SnapshotCreatedEvent,
  BalanceUpdatedEvent,
  FundingPaymentEvent,
  LiquidationTrigerredEvent,
  OrderAcceptedEvent,
  OrderCancelledEvent,
  OrderRejectedEvent,
  PositionClosedEvent,
  PositionUpdatedEvent,
  RealizedPnlUpatedEvent,
  TradeExecutedEvent,
  BalanceAddedEvent,
  DeleteOrderEvent
}
