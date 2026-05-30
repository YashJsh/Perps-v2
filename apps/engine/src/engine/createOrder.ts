import type { CreateOrderPayload, Fill, Orderbook, RestingOrder, HandleResult, CreateOrderResponse, OrderAcceptedEvent, TradeExecutedEvent, EngineEvent } from "types";
import { FILLS, ORDER, ORDERBOOK } from "../store/store";
import { OrderStatus, Side, Type, EngineEvents } from "types";
import { riskEngine } from "./risk";
import { handleBalanceChecks } from "./balance";
import { positionAccounting } from "./position";

export const handleCreateOrder = (payload: unknown, streamId : string) => {
    const data = payload as CreateOrderPayload;

    const risk = riskEngine(data);
    if (risk) {
        handleBalanceChecks();
    };

    if (data.side == Side.Buy) {
        const response = handleBuyOrder(data, streamId);
        return response;
    }
    else {
        const response = handleSellOrder(data, streamId);
        return response;
    }
}

export const handleBuyOrder = (data: CreateOrderPayload, streamId : string): HandleResult<CreateOrderResponse> => {
    const event: EngineEvent[] = [];
    const orderId = crypto.randomUUID();
    ORDER.set(orderId, {
        filledQty: 0,
        price: data.price,
        orderId,
        quantity: data.quantity,
        remainingQty: data.quantity,
        side: data.side,
        status: OrderStatus.Open,
        symbol: data.symbol,
        timestamp: Date.now(),
        type: data.type,
        userId: data.userId,
        leverage: data.leverage
    });
    const OrderEvent: OrderAcceptedEvent = {
        eventId: crypto.randomUUID(),
        streamId,
        price: data.price,
        orderId,
        market: data.symbol,
        quantity: data.quantity,
        side: data.side,
        timestamp: Date.now(),
        type: EngineEvents.OrderAccepted,
        userId: data.userId,
        leverage: data.leverage
    }
    event.push(OrderEvent);

    //Get orderbook
    const orderbook = ORDERBOOK.get(data.symbol);
    if (!orderbook) {
        throw new Error("Orderbook not found : CreateOrder")
    }

    if (data.type == Type.Limit) {
        let remaining_qty = data.quantity;

        for (const [price, order] of orderbook.asks.entries()) {
            if (price <= data.price) {
                for (let i = 0; i < order.length; i++) {
                    let sellingOrder = order[i];
                    if (!sellingOrder) {
                        continue;
                    }
                    const matchingQty = Math.min(sellingOrder?.remainingQty, remaining_qty);

                    //Maker fill
                    const buyerFills = FILLS.getOrInsert(orderId, []);
                    let fill_order: Fill = {
                        orderId,
                        makerId: sellingOrder?.userId,
                        takerId: data.userId,
                        makerOrderId: orderId,
                        takerOrderId: sellingOrder.orderId,
                        filledQty: matchingQty,
                        price: sellingOrder.price,
                        marked: false,
                    };
                    buyerFills.push(fill_order);

                    //AddFillEventHere;
                    const FillEvent: TradeExecutedEvent = {
                        eventId: crypto.randomUUID(),
                        streamId,
                        makerOrderId: orderId,
                        takerOrderId: sellingOrder.orderId,
                        makerUserId: sellingOrder.userId,
                        takerUserId: data.userId,
                        market: data.symbol,
                        type: EngineEvents.TradeExecuted,
                        price: sellingOrder.price,
                        quantity: matchingQty,
                        timestamp: Date.now()
                    }
                    event.push(FillEvent);

                    const sellerFills = FILLS.getOrInsert(sellingOrder.orderId, []);
                    let seller_fill_order: Fill = {
                        orderId,
                        makerId: data.userId,
                        takerId: sellingOrder.userId,
                        makerOrderId: orderId,
                        takerOrderId: sellingOrder.orderId,
                        filledQty: matchingQty,
                        price: sellingOrder.price,
                        marked: false
                    };
                    sellerFills.push(seller_fill_order);

                    //Remove the remaining qty;
                    remaining_qty -= matchingQty;

                    let buyingOrder = ORDER.get(orderId);
                    if (!buyingOrder) {
                        throw new Error("Order not found");
                    }
                    buyingOrder.remainingQty -= matchingQty;
                    buyingOrder.filledQty += matchingQty;

                    let sellOrder = ORDER.get(sellingOrder.orderId);
                    if (!sellOrder) {
                        throw new Error("Order not found");
                    }
                    sellOrder.remainingQty -= matchingQty;
                    sellOrder.filledQty += matchingQty;

                    if (sellOrder.remainingQty == 0) {
                        //Remove the orderfrom the book;
                        sellOrder.status = OrderStatus.Filled;
                        order.splice(i, 1);
                        i--;
                    }

                    if (remaining_qty === 0) {
                        buyingOrder.status = OrderStatus.Filled;
                    } else if (remaining_qty < data.quantity) {
                        buyingOrder.status = OrderStatus.PartiallyFilled;
                    } else {
                        buyingOrder.status = OrderStatus.Open;
                    }
                }
            }
        }

        let restingOrder;
        if (remaining_qty > 0) {
            restingOrder = addBids(data, orderId, remaining_qty, orderbook);
        }

        const filledQty = data.quantity - remaining_qty;

        if (remaining_qty != data?.quantity) {
            positionAccounting(orderId);
        }
        console.log("Filled qty : ", filledQty);
        console.log("Remaining qty : ", remaining_qty);


        return {
            response: {
                filledQty: filledQty,
                orderId: orderId,
                remainingQty: remaining_qty,
            },
            events: event

        }
    } else {
        let remaining_qty = data.quantity;

        for (const [price, order] of orderbook.asks.entries()) {
            if (price <= data.price) {
                for (let i = 0; i < order.length; i++) {
                    let sellingOrder = order[i];
                    if (!sellingOrder) {
                        continue;
                    }
                    const matchingQty = Math.min(sellingOrder?.remainingQty, remaining_qty);

                    //Maker fill
                    const buyerFills = FILLS.getOrInsert(orderId, []);
                    let fill_order: Fill = {
                        orderId,
                        makerId: data.userId,
                        takerId: sellingOrder.userId,
                        makerOrderId: orderId,
                        takerOrderId: sellingOrder.orderId,
                        filledQty: matchingQty,
                        price: sellingOrder.price,
                        marked: false,
                    };
                    buyerFills.push(fill_order);

                    const FillEvent: TradeExecutedEvent = {
                        eventId: crypto.randomUUID(),
                        streamId,
                        makerOrderId: orderId,
                        takerOrderId: sellingOrder.orderId,
                        makerUserId: sellingOrder.userId,
                        takerUserId: data.userId,
                        market: data.symbol,
                        type: EngineEvents.TradeExecuted,
                        price: sellingOrder.price,
                        quantity: matchingQty,
                        timestamp: Date.now()
                    }
                    event.push(FillEvent);

                    const sellerFills = FILLS.getOrInsert(sellingOrder.orderId, []);
                    let seller_fill_order: Fill = {
                        orderId,
                        makerId: data.userId,
                        takerId: sellingOrder.userId,
                        makerOrderId: orderId,
                        takerOrderId: sellingOrder.orderId,
                        filledQty: matchingQty,
                        price: sellingOrder.price,
                        marked: false
                    };
                    sellerFills.push(seller_fill_order);

                    //Remove the remaining qty;
                    remaining_qty -= matchingQty;

                    let buyingOrder = ORDER.get(orderId);
                    if (!buyingOrder) {
                        throw new Error("Order not found : createOrderResponse");
                    }
                    buyingOrder.remainingQty -= matchingQty;
                    buyingOrder.filledQty += matchingQty;

                    let sellOrder = ORDER.get(sellingOrder.orderId);
                    if (!sellOrder) {
                        throw new Error("Sell Order not found : createOrderResponse");
                    }
                    sellOrder.remainingQty -= matchingQty;
                    sellOrder.filledQty += matchingQty;

                    if (sellOrder.remainingQty == 0) {
                        //Remove the orderfrom the book;
                        sellOrder.status = OrderStatus.Filled;
                        order.splice(i, 1);
                        i--;
                    }
                    if (remaining_qty == 0) {
                        buyingOrder.status = OrderStatus.Filled;
                    }
                }
            }
        }

        positionAccounting(orderId);

        return {
            response: {
                filledQty: data.quantity - remaining_qty,
                orderId: orderId,
                remainingQty: remaining_qty,
            },
            events: event
        }
        // return {
        //     success: true,
        //     orderId,
        //     filledQty: data.quantity - remaining_qty,
        //     remaining_qty,
        //     status: remaining_qty == 0 ? OrderStatus.Filled : OrderStatus.PartiallyFilled
        // }
    }
}

const handleSellOrder = (data: CreateOrderPayload, streamId : string): HandleResult<CreateOrderResponse> => {
    const event: EngineEvent[] = [];
    const orderId = crypto.randomUUID();
    ORDER.set(orderId, {
        filledQty: 0,
        price: data.price,
        orderId,
        quantity: data.quantity,
        remainingQty: data.quantity,
        side: data.side,
        status: OrderStatus.Open,
        symbol: data.symbol,
        timestamp: Date.now(),
        type: data.type,
        userId: data.userId,
        leverage: data.leverage
    });
    const OrderEvent: OrderAcceptedEvent = {
        eventId: crypto.randomUUID(),
        streamId,
        price: data.price,
        orderId,
        market: data.symbol,
        quantity: data.quantity,
        side: data.side,
        timestamp: Date.now(),
        type: EngineEvents.OrderAccepted,
        userId: data.userId,
        leverage: data.leverage
    }
    event.push(OrderEvent);
    //Get orderbook
    const orderbook = ORDERBOOK.get(data.symbol);
    if (!orderbook) {
        throw new Error("Orderbook not found");
    }

    if (data.type == Type.Limit) {
        let remaining_qty = data.quantity;
        for (const [price, order] of orderbook.bids.entriesReversed()) {
            if (price >= data.price) {
                for (let i = 0; i < order.length; i++) {
                    let buyingOrder = order[i];
                    if (!buyingOrder) {
                        continue;
                    }
                    const matchingQty = Math.min(buyingOrder?.remainingQty, remaining_qty);

                    //Maker fill
                    const buyerFills = FILLS.getOrInsert(buyingOrder.orderId, []);
                    let fill_order: Fill = {
                        orderId,
                        makerId: data.userId,
                        takerId: buyingOrder.userId,
                        makerOrderId: orderId,
                        takerOrderId: buyingOrder.orderId,
                        filledQty: matchingQty,
                        price: buyingOrder.price,
                        marked: false,
                    };
                    buyerFills.push(fill_order);

                    const FillEvent: TradeExecutedEvent = {
                        eventId: crypto.randomUUID(),
                        streamId,
                        makerOrderId: buyingOrder.orderId,
                        takerOrderId: orderId,
                        makerUserId: buyingOrder.userId,
                        takerUserId: data.userId,
                        market: data.symbol,
                        type: EngineEvents.TradeExecuted,
                        price: buyingOrder.price,
                        quantity: matchingQty,
                        timestamp: Date.now()
                    }
                    event.push(FillEvent);

                    const sellerFills = FILLS.getOrInsert(orderId, []);
                    let seller_fill_order: Fill = {
                        orderId,
                        makerId: buyingOrder?.userId,
                        takerId: data.userId,
                        makerOrderId: buyingOrder?.orderId,
                        takerOrderId: orderId,
                        filledQty: matchingQty,
                        price: buyingOrder.price,
                        marked: false,
                    };

                    sellerFills.push(seller_fill_order);
                    //Remove the remaining qty;
                    remaining_qty -= matchingQty;

                    let buyOrder = ORDER.get(buyingOrder.orderId);
                    if (!buyOrder) {
                        throw new Error("Buy order not present");
                    }
                    buyOrder.remainingQty -= matchingQty;
                    buyOrder.filledQty += matchingQty;

                    let sellOrder = ORDER.get(orderId);
                    if (!sellOrder) {
                        throw new Error("Sell order not present");
                    }
                    sellOrder.remainingQty -= matchingQty;
                    sellOrder.filledQty += matchingQty;

                    if (buyOrder.remainingQty == 0) {
                        //Remove the orderfrom the book;
                        buyOrder.status = OrderStatus.Filled;
                        order.splice(i, 1);
                        i--;
                    }

                    if (remaining_qty === 0) {
                        sellOrder.status = OrderStatus.Filled;
                    } else if (remaining_qty < data.quantity) {
                        sellOrder.status = OrderStatus.PartiallyFilled;
                    } else {
                        sellOrder.status = OrderStatus.Open;
                    }
                }
            }
        }
        let restingOrder;
        if (remaining_qty > 0) {
            restingOrder = addAsks(data, orderId, remaining_qty, orderbook);
        }

        const filledQty = data.quantity - remaining_qty;

        if (remaining_qty != data?.quantity) {
            positionAccounting(orderId);
        }

        let status: OrderStatus;

        if (remaining_qty === 0) {
            status = OrderStatus.Filled;
        } else if (filledQty > 0) {
            status = OrderStatus.PartiallyFilled;
        } else {
            status = OrderStatus.Open;
        }
        return {
            response: {
                filledQty: data.quantity - remaining_qty,
                orderId: orderId,
                remainingQty: remaining_qty,
            },
            events: event
        }
    }
    else {
        let remaining_qty = data.quantity;

        for (const [price, order] of orderbook.bids.entriesReversed()) {
            if (price >= data.price) {
                for (let i = 0; i < order.length; i++) {
                    let buyingOrder = order[i];
                    if (!buyingOrder) {
                        continue;
                    }
                    const matchingQty = Math.min(buyingOrder?.remainingQty, remaining_qty);

                    //Maker fill
                    const buyerFills = FILLS.getOrInsert(buyingOrder.orderId, []);
                    let fill_order: Fill = {
                        orderId,
                        makerId: data.userId,
                        takerId: buyingOrder.userId,
                        makerOrderId: orderId,
                        takerOrderId: buyingOrder.orderId,
                        filledQty: matchingQty,
                        price: buyingOrder.price,
                        marked: false
                    };
                    buyerFills.push(fill_order);

                    const FillEvent: TradeExecutedEvent = {
                        eventId: crypto.randomUUID(),
                        streamId: streamId,
                        makerOrderId: buyingOrder.orderId,
                        takerOrderId: orderId,
                        makerUserId: buyingOrder.userId,
                        takerUserId: data.userId,
                        market: data.symbol,
                        type: EngineEvents.TradeExecuted,
                        price: buyingOrder.price,
                        quantity: matchingQty,
                        timestamp: Date.now()
                    }
                    event.push(FillEvent);

                    const sellerFills = FILLS.getOrInsert(orderId, []);
                    let seller_fill_order: Fill = {
                        orderId,
                        makerId: buyingOrder?.userId,
                        takerId: data.userId,
                        makerOrderId: buyingOrder?.orderId,
                        takerOrderId: orderId,
                        filledQty: matchingQty,
                        price: buyingOrder.price,
                        marked: false,
                    };

                    sellerFills.push(seller_fill_order);
                    //Remove the remaining qty;
                    remaining_qty -= matchingQty;

                    let buyOrder = ORDER.get(buyingOrder.orderId);
                    if (!buyOrder) {
                        throw new Error("Buy order not present");
                    }
                    buyOrder.remainingQty -= matchingQty;
                    buyOrder.filledQty += matchingQty;

                    let sellOrder = ORDER.get(orderId);
                    if (!sellOrder) {
                        throw new Error("Sell order not present");
                    }
                    sellOrder.remainingQty -= matchingQty;
                    sellOrder.filledQty += matchingQty;

                    if (buyOrder.remainingQty == 0) {
                        //Remove the orderfrom the book;
                        buyOrder.status = OrderStatus.Filled;
                        order.splice(i, 1);
                        i--;
                    }

                    if (remaining_qty == 0) {
                        sellOrder.status = OrderStatus.Filled;
                    }

                }
            }
        }
        const get_order = ORDER.get(orderId);
        if (remaining_qty > 0 && remaining_qty < data.quantity) {
            get_order!.status = OrderStatus.PartiallyFilled;
        }
        positionAccounting(orderId);

        return {
            response: {
                filledQty: data.quantity - remaining_qty,
                orderId: orderId,
                remainingQty: remaining_qty,
            },
            events: event
        }
    }
}

const addBids = (order: CreateOrderPayload, orderId: string, remaining_qty: number, orderbook: Orderbook) => {
    let restingOrder: RestingOrder = {
        orderId: orderId,
        userId: order.userId,
        side: order.side,
        symbol: order.symbol,
        price: order.price,
        remainingQty: remaining_qty,
        filledQty: 0,
        timestamp: Date.now()
    }

    if (!orderbook.bids.has(restingOrder.price)) {
        orderbook.bids.set(restingOrder.price, [restingOrder]);
        return;
    };
    orderbook.bids.get(restingOrder.price)?.push(restingOrder);
    return restingOrder;
}

const addAsks = (order: CreateOrderPayload, orderId: string, remaining_qty: number, orderbook: Orderbook) => {
    let restingOrder: RestingOrder = {
        orderId: orderId,
        userId: order.userId,
        side: order.side,
        symbol: order.symbol,
        price: order.price,
        remainingQty: remaining_qty,
        filledQty: 0,
        timestamp: Date.now()
    }

    if (!orderbook.asks.has(restingOrder.price)) {
        orderbook.asks.set(restingOrder.price, [restingOrder]);
        return;
    };
    orderbook.asks.get(restingOrder.price)?.push(restingOrder);
}
