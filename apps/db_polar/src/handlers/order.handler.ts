import { prisma } from "db";
import { OrderSide, OrderStatus, OrderType } from "db/generated/prisma/enums";
import { Side, Type, type DeleteOrderEvent, type EngineEvent, type OrderAcceptedEvent } from "types";

export const handleAcceptedOrder = async (data: OrderAcceptedEvent) => {
  const userId = data.userId;
  //Find user first;
  //
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId
      }
    });

    if (!user) {
      throw new Error("User not found");
    }
    let status;
    if (data.orderStatus == "filled") {
      status = OrderStatus.Filled
    } else if (data.orderStatus == "open") {
      status = OrderStatus.Open
    } else if (data.orderStatus == "closed") {
      status = OrderStatus.Closed
    } else if (data.orderStatus == "partially_filled") {
      status = OrderStatus.Partially_Filled
    } else {
      status = OrderStatus.Cancelled
    }

    //Create order;
    const order = await prisma.order.create({
      data: {
        userId,
        market_id: data.market,
        leverage: data.leverage,
        quantity: data.quantity,
        orderType: data.orderType == Type.Limit ? OrderType.Limit : OrderType.Market,
        price: data.price,
        orderSide: data.side == Side.Buy ? OrderSide.Buy : OrderSide.Sell,
        status
      }
    });

    console.log("Order saved successfully");
    return;
  } catch (error) {
    console.log("Error in db engine");
  }
}


export const handleDeleteOrder = (event: DeleteOrderEvent) => {

}
