import BTree from "sorted-btree";
import type { RestingOrder } from "types";
import type { EngineState } from "../state/engine-state";

export const rehydrateState = (snapshot: any, state: EngineState) => {
  state.orders.clear();
  for (const [id, order] of Object.entries(snapshot.orders)) {
    state.orders.set(id, order as any);
  }

  state.balances.clear();
  for (const [userId, bal] of Object.entries(snapshot.balances)) {
    state.balances.set(userId, bal as any);
  }

  state.positions.clear();
  for (const [posKey, position] of Object.entries(snapshot.positions)) {
    state.positions.set(posKey, position as any);
  }

  state.markPrices.clear();
  for (const [symbol, price] of Object.entries(snapshot.MarkPrices)) {
    state.markPrices.set(symbol, price as any);
  }

  state.orderbooks.clear();
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
    state.orderbooks.set(symbol, book);
  }

  state.lastTradedPrices.clear();
  for (const [symbol, price] of Object.entries(snapshot.IndexPrice)) {
    state.lastTradedPrices.set(symbol, price as any);
  }

  state.lastCommandProcessedId = snapshot.last_processed_command_id;
}
