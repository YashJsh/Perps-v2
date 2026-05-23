import { Side } from "types";
import { FILLS, ORDER, POSITION } from "../store/store";

export const MakePosition = (orderId : string)=>{
    let order = ORDER.get(orderId);
    if (!order){
        return;
    }
    let fills = FILLS.get(orderId);
    if (!fills){
        return;
    }
    let notionalPrice = 0;
    let fillCount = 0;
    let size = 0;
    for (let i = 0;i < fills.length; i++){
        let fill = fills[i];
        if (!fill){
            continue;
        }
        notionalPrice += fill?.price * fill.filledQty;
        fillCount++;
        size += fill.filledQty;
    }
    const averageEntryPrice = notionalPrice / fillCount;
    const leverage = order.leverage;
    
    const margin = averageEntryPrice/leverage;

    const liquidationPrice = order.side == Side.Buy ? buyLiquidationPrice(averageEntryPrice, leverage) : sellLiquidationPrice(averageEntryPrice, leverage) ;

    const position = POSITION.getOrInsert(order.userId + order.symbol, {
        id : crypto.randomUUID(),
        averageEntryPrice,
        leverage, 
        liquidationPrice,
        margin,
        size, 
        symbol : order.symbol,
        unrealizedPnl : 0,
        userId : order.userId
    });

    position.averageEntryPrice = averageEntryPrice;
    position.liquidationPrice = liquidationPrice;
    position.leverage = leverage;
    position.margin = margin;
    position.size = size;
}

const buyLiquidationPrice = (entryPrice : number, leverage : number)=>{
    const formula = 1 - 1 / leverage;
    return entryPrice * formula;
}

const sellLiquidationPrice = (entryPrice : number, leverage : number)=>{
    const formula = 1 + 1 / leverage;
    return entryPrice * formula;
}