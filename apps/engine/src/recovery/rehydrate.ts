import BTree from "sorted-btree";
import type { RestingOrder } from "types";
import { BALANCES, ENGINE_META_DATA, LASTTRADEDPRICE, MARKPRICE, ORDER, ORDERBOOK, POSITION } from "../store/store";

export const rehydrateState = (snapshot: any) => {
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

  LASTTRADEDPRICE.clear();
  for (const [symbol, price] of Object.entries(snapshot.IndexPrice)) {
    LASTTRADEDPRICE.set(symbol, price as any);
  }

  ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = snapshot.last_processed_command_id;
}
