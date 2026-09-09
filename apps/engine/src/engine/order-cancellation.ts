import { EngineEvents, OrderStatus, Side, type CancelOrderResponse, type DeleteOrderPayload, type EngineEvent, type EngineRequest, type HandleResult, type OrderCancelledEvent, type DeleteOrderEvent } from "types";
import type { EngineState } from "../state/engine-state";

const handleDeleteOrder = (request: EngineRequest, streamId: string, state: EngineState): HandleResult<CancelOrderResponse> => {
  const payload = request.payload as DeleteOrderPayload;
  const orderId = payload.orderId;
  const userId = payload.userId;
  const symbol = payload.symbol;

  const orderbook = state.orderbooks.get(symbol);
  if (!orderbook) {
    console.log("Orderbook not found");
    throw new Error("Orderbook not found");
  }

  const order = state.orders.get(orderId);
  if (!order) {
    console.log("Order not found");
    throw new Error("Order not found");
  }
  if (order.userId != payload.userId) {
    console.log("Can't delete someone else order");
    throw new Error("Ownership of order required for deleting the order");
  }
  if (order.status == OrderStatus.Filled || order.status == OrderStatus.Cancelled) {
    throw new Error("Order is already filled or cancelled");
  }
  else {
    if (!orderbook.remove(order)) {
      throw new Error(order.side === Side.Buy ? "Orders not found for this price" : "Price not found in the book");
    }
    order.status = OrderStatus.Cancelled;
    const event: DeleteOrderEvent = {
      eventId: crypto.randomUUID(),
      orderId: orderId,
      streamId: streamId,
      timestamp: Date.now(),
      type: EngineEvents.DeleteOrderEvent,
      userId: order.userId
    }
    return {
      response: {
        orderId: orderId,
        success: true,
      },
      events: [event]
    }
  }
}

export { handleDeleteOrder }
