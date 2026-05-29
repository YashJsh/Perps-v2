import { OrderStatus, Side, type DeleteOrderPayload, type EngineRequest } from "types";
import { ORDER, ORDERBOOK } from "../store/store";

const handleDeleteOrder = (request: EngineRequest) => {
    const payload = request.payload as DeleteOrderPayload;
    const orderId = payload.orderId;
    const userId = payload.userId;
    const symbol = payload.symbol;

    const orderbook = ORDERBOOK.get(symbol);
    if (!orderbook) {
        console.log("Orderbook not found");
        throw new Error("Orderbook not found");
        return;
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
        return {
            orderId : orderId,
            success: true,
        }
    }
}

export { handleDeleteOrder }