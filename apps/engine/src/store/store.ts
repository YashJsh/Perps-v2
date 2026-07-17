import type { Balance, Fill, Order, Orderbook, Position, RestingOrder } from "types";

export const ORDERBOOK = new Map<string, Orderbook>();
export const ORDER = new Map<string, Order>();
export const FILLS = new Map<string, Fill[]>();
export const POSITION = new Map<string, Position>();
export const BALANCES = new Map<string, Balance>();
export const MARKPRICE = new Map<string, number>();
export const LASTTRADEDPRICE = new Map<string, number>();
export const ENGINE_META_DATA = {
  LAST_COMMAND_PROCESSED_ID: "0-0"
}
