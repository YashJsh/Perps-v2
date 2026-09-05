import { EngineEvents, type EngineEvent, type EngineResponse, type Order } from "types";
import { handlePositionClosed } from "./handlers/position.handler";
import { handleAcceptedOrder, handleDeleteOrder } from "./handlers/order.handler";
import { handleTradeExecuted } from "./handlers/trade.handler";

interface Data {
  event: EngineEvent
}

const handleData = (data: Data) => {
  const event = data.event;

  if (event.type == EngineEvents.OrderAccepted) {
    handleAcceptedOrder(event);
  }
  if (event.type == EngineEvents.PositionClosed) {
    handlePositionClosed(event);
  }
  if (event.type == EngineEvents.DeleteOrderEvent) {
    handleDeleteOrder(event);
  }
  if (event.type == EngineEvents.TradeExecuted) {
    handleTradeExecuted(event);
  }
}

export { handleData }
