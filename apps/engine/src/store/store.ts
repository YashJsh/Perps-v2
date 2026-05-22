import type { Fill, Order, Orderbook } from "types";

export const ORDERBOOK = new Map<string, Orderbook>();
export const ORDER = new Map<string, Order>();
export const FILLS = new Map<string, Fill[]>();
export const Position = new Map<string, Position>();

