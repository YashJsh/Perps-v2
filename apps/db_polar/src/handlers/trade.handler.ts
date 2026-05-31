import { prisma } from "db";
import type { TradeExecutedEvent } from "types";

export const handleTradeExecuted = async (data: TradeExecutedEvent) => {
  try {
    const trade = await prisma.fills.create({
      data: {
        market: data.market,
        maker_id: data.makerOrderId,
        taker_id: data.takerUserId,
        maker_order_id: data.makerOrderId,
        taker_order_id: data.takerOrderId,
        qty: data.quantity,
      }
    })

    console.log("Trade event saved");
  }
  catch (error) {
    console.log("Error in saving trade in db")
  }
}
