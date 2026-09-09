import type { Balance, Fill, Order, Position } from "types";
import { OrderBook } from "../engine/order-book";

export class EngineState {
  readonly orderbooks = new Map<string, OrderBook>();
  readonly orders = new Map<string, Order>();
  readonly fills = new Map<string, Fill[]>();
  readonly positions = new Map<string, Position>();
  readonly balances = new Map<string, Balance>();
  readonly markPrices = new Map<string, number>();
  readonly lastTradedPrices = new Map<string, number>();
  lastCommandProcessedId = "0-0";
}
