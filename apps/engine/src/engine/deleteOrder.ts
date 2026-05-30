import { EngineEvents, OrderStatus, Side, type CancelOrderResponse, type DeleteOrderPayload, type EngineEvent, type EngineRequest, type HandleResult, type OrderCancelledEvent, type DeleteOrderEvent} from "types";
import { ORDER, ORDERBOOK } from "../store/store";

const handleDeleteOrder = (request: EngineRequest, streamId : string) : HandleResult<CancelOrderResponse> => {
    const payload = request.payload as DeleteOrderPayload;
    const orderId = payload.orderId;
    const userId = payload.userId;
    const symbol = payload.symbol;

    const orderbook = ORDERBOOK.get(symbol);
    if (!orderbook) {
        console.log("Orderbook not found");
        throw new Error("Orderbook not found");
    }

    const order = ORDER.get(orderId);
    if (!order) {
        console.log("Order not found");
        throw new Error("Order not found");
    }
    const order_side = order.side;
    if (order.status == OrderStatus.Filled || order.status == OrderStatus.Cancelled) {
        throw new Error("Order is already filled or cancelled");
    }
    else {
        if (order.side == Side.Buy) {
            let price_orders = orderbook.bids.get(order.price);
            if (!price_orders) {
                throw new Error("Orders not found for this price")
            }
            for (let i = 0; i < price_orders.length; i++) {
                let order = price_orders[i];
                if (order?.orderId == orderId && order.userId == userId) {
                    price_orders.splice(i, 1);
                    i--;
                    break;
                }
            }
        }
        else {
            if (order.side == Side.Sell) {
                let price_orders = orderbook.asks.get(order.price);
                if (!price_orders) {
                    throw new Error("Price not found in the book");
                }
                for (let i = 0; i < price_orders.length; i++) {
                    let order = price_orders[i];
                    if (order?.orderId == orderId && order.userId == userId) {
                        price_orders.splice(i, 1);
                        i--;
                        break;
                    }
                }
            }
        }
        order.status = OrderStatus.Cancelled;
        const event : DeleteOrderEvent = {
            eventId : crypto.randomUUID(),
            orderId : orderId,
            streamId : streamId,
            timestamp : Date.now(),
            type : EngineEvents.DeleteOrderEvent,
            userId : order.userId
        } 
        return {
            response : {
                orderId : orderId,
                success : true,
            },
            events : [event]
        }
    }
}

export { handleDeleteOrder }