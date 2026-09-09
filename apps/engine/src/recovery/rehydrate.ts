import type { EngineState } from "../state/engine-state";
import { OrderBook, type OrderBookSnapshot } from "../engine/order-book";

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
    state.orderbooks.set(symbol, OrderBook.fromSnapshot(bookData as OrderBookSnapshot));
  }

  state.lastTradedPrices.clear();
  for (const [symbol, price] of Object.entries(snapshot.IndexPrice)) {
    state.lastTradedPrices.set(symbol, price as any);
  }

  state.lastCommandProcessedId = snapshot.last_processed_command_id;
}
