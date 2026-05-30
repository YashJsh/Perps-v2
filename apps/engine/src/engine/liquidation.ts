import { Side, Type } from "types";
import { POSITION } from "../store/store";
import { handleCreateOrder } from "./createOrder";

const checkLiquidation = (markPrice : number, streamId : string)=>{
    let pos = POSITION.values();
    //Update unrealized PNL
    pos.forEach((p)=>{
        if (p.size > 1){
            p.realizedPnl = updateUnrealizedPnlLong(p.averageEntryPrice, p.size, markPrice);
        }else{
            p.realizedPnl = updateUnrealizedPnlShort(p.averageEntryPrice, p.size, markPrice);
        }
        const bufferedPrice = p.liquidationPrice + (p.liquidationPrice * 0.1);
        if (bufferedPrice <= markPrice){
            //Send request to engine for the orderCreation. 
            const side = p.size > 1 ? Side.Buy : Side.Sell;
            if (side == Side.Buy){
                handleCreateOrder({
                    userId : p.userId,
                    symbol : p.symbol,
                    price : markPrice, // I have to give current price here
                    quantity : p.size,
                    side : Side.Sell,
                    type : Type.Market,
                    leverage : 0,
                }, streamId)
            }else{
                handleCreateOrder({
                    userId : p.userId,
                    symbol : p.symbol,
                    price : markPrice, // I have to give current price here
                    quantity : p.size,
                    side : Side.Buy,
                    type : Type.Market,
                    leverage : 0
                }, streamId)
            }
        }
    });
};

const updateUnrealizedPnlLong = (entryPrice : number, size : number, markPrice : number)=>{
    return (markPrice - entryPrice) * size;
};

const updateUnrealizedPnlShort = (entryPrice : number, size : number, markPrice : number)=>{
    return (entryPrice - markPrice) * size;
};

export { 
    checkLiquidation
}