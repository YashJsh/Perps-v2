import { Side, Type } from "types";
import { POSITION } from "../store/store";
import { handleCreateOrder } from "./createOrder";

const checkLiquidation = (markPrice: number, streamId: string) => {
  let pos = POSITION.values();
  //Update unrealized PNL
  pos.forEach((p) => {
    if (p.size > 0) {
      p.realizedPnl = updateUnrealizedPnlLong(p.averageEntryPrice, p.size, markPrice);
    } else {
      p.realizedPnl = updateUnrealizedPnlShort(p.averageEntryPrice, p.size, markPrice);
    }
    const buffer = p.liquidationPrice * 0.1;
    const bufferedPrice = p.side === Side.Buy
      ? p.liquidationPrice + buffer   // long: buffer above liq price
      : p.liquidationPrice - buffer;  // short: buffer below liq price
    if (bufferedPrice <= markPrice) {
      //Send request to engine for the orderCreation. 
      const closeSide = p.side === Side.Buy ? Side.Sell : Side.Buy;
      if (closeSide == Side.Buy) {
        handleCreateOrder({
          userId: p.userId,
          symbol: p.symbol,
          price: markPrice, //We need to give the current price here
          quantity: p.size,
          side: Side.Sell,
          type: Type.Market,
          leverage: 0,
        }, streamId)
      } else {
        handleCreateOrder({
          userId: p.userId,
          symbol: p.symbol,
          price: markPrice,
          quantity: p.size,
          side: Side.Buy,
          type: Type.Market,
          leverage: 0
        }, streamId)
      }
    }
  });
};

const updateUnrealizedPnlLong = (entryPrice: number, size: number, markPrice: number) => {
  return (markPrice - entryPrice) * size;
};

const updateUnrealizedPnlShort = (entryPrice: number, size: number, markPrice: number) => {
  return (entryPrice - markPrice) * size;
};

export {
  checkLiquidation
}
