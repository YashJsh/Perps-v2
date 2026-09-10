import type { EngineState } from "../state/engine-state";
import { OrderBook } from "./order-book";

const SUPPORTED_SYMBOLS= [
   "BTC_USD",
   "SOL_USD"
]

export const seedOrderBook = (state: EngineState)=>{
    for (const symbol of SUPPORTED_SYMBOLS){
        state.orderbooks.set(symbol, new OrderBook());
    }
};
