import BTree from "sorted-btree";
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

const rehydrateState = (snapshot: any) => {
  ORDER.clear();
  for (const [id, order] of Object.entries(snapshot.orders)) {
    ORDER.set(id, order as any);
  }

  BALANCES.clear();
  for (const [userId, bal] of Object.entries(snapshot.balances)) {
    BALANCES.set(userId, bal as any);
  }

  POSITION.clear();
  for (const [posKey, position] of Object.entries(snapshot.positions)) {
    POSITION.set(posKey, position as any);
  }

  MARKPRICE.clear();
  for (const [symbol, price] of Object.entries(snapshot.MarkPrices)) {
    MARKPRICE.set(symbol, price as any);
  }

  ORDERBOOK.clear();
  for (const [symbol, bookData] of Object.entries(snapshot.orderbooks)) {
    const book = {
      asks: new BTree<number, RestingOrder[]>(),
      bids: new BTree<number, RestingOrder[]>()
    };
    for (const [price, orders] of Object.entries((bookData as any).asks)) {
      book.asks.set(parseInt(price), orders as any);
    }
    for (const [price, orders] of Object.entries((bookData as any).bids)) {
      book.bids.set(parseInt(price), orders as any);
    }
    ORDERBOOK.set(symbol, book);
  }

  ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = snapshot.last_processed_command_id;
}
