import { Side, Type } from "types";
import type { EngineState } from "../state/engine-state";
import { handleCreateOrder } from "./order-matching";

const checkLiquidation = (markPrice: number, streamId: string, state: EngineState) => {
  let pos = state.positions.values();
  //Update unrealized PNL
  pos.forEach((p) => {
    if (Math.abs(p.size) <= 0) {
      return;
    }
    if (p.size > 0) {
      p.realizedPnl = updateUnrealizedPnlLong(p.averageEntryPrice, p.size, markPrice);
    } else {
      p.realizedPnl = updateUnrealizedPnlShort(p.averageEntryPrice, p.size, markPrice);
    }
    const isLiquidatable = p.side === Side.Buy
      ? markPrice <= p.liquidationPrice
      : markPrice >= p.liquidationPrice;

    if (isLiquidatable) {
      //Send request to engine for the orderCreation. 
      const closeSide = p.side === Side.Buy ? Side.Sell : Side.Buy;
      try {
        handleCreateOrder({
          userId: p.userId,
          symbol: p.symbol,
          price: markPrice,
          quantity: Math.abs(p.size),
          side: closeSide,
          type: Type.Market,
          leverage: p.leverage
        }, streamId, state);
      } catch (err) {
        if (err instanceof Error && err.message === "No fills found for order") {
          // Ignore - expected when there is no matching liquidity to fill the liquidation order immediately
        } else {
          throw err;
        }
      }
    }
  });
};

const updateUnrealizedPnlLong = (entryPrice: number, size: number, markPrice: number) => {
  return (markPrice - entryPrice) * size;
};

const updateUnrealizedPnlShort = (entryPrice: number, size: number, markPrice: number) => {
  return (entryPrice - markPrice) * Math.abs(size);
};

export {
  checkLiquidation
}
