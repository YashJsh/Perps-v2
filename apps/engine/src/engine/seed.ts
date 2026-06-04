import BTree from "sorted-btree";
import { ORDERBOOK } from "../store/store";
import type { RestingOrder } from "types";

const SUPPORTED_SYMBOLS= [
   "BTC_USD",
   "SOL_USD" 
]

export const seedOrderBook = ()=>{
    for (const symbol of SUPPORTED_SYMBOLS){
        ORDERBOOK.set(symbol, {
            asks : new BTree<number, RestingOrder[]>(),
            bids : new BTree<number, RestingOrder[]>()
        })
    }
};