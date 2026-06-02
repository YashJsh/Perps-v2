import { prisma } from "db";
import type { PositionClosedEvent } from "types";

export const handlePositionClosed = async (data: PositionClosedEvent) => {
  const userId = data.userId;

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId
      }
    });
    if (!user) {
      throw new Error("User not found")
    };
    const position = await prisma.position.findFirst({
      where: {
        userId: userId,
        market: data.market
      }
    })
    if (position) {
      throw new Error("Position already present");
    }

    const new_position = await prisma.position.create({
      data: {
        userId,
        market: data.market,
        averageEntryPrice: data.averageEntryPrice,
        averageExitPrice: data.averageClosingPrice,
        pnl: data.realizedpnl,
        size: data.size
      }
    })
    console.log("Position Created for userId :", userId, "in market", data.market);
  }
  catch (err) {
    console.log("Error is : ", err);
  }
}
