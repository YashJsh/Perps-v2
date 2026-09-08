import BTree from "sorted-btree";
import type { EngineState } from "../state/engine-state";
import type { RestingOrder } from "types";

const SUPPORTED_SYMBOLS= [
   "BTC_USD",
   "SOL_USD" 
]

export const seedOrderBook = (state: EngineState)=>{
    for (const symbol of SUPPORTED_SYMBOLS){
        state.orderbooks.set(symbol, {
            asks : new BTree<number, RestingOrder[]>(),
            bids : new BTree<number, RestingOrder[]>()
        })
    }
};
