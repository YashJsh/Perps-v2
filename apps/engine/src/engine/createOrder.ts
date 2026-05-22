import { OrderStatus, Side, Type } from "types";
import type { CreateOrderPayload, Fill, Orderbook, RestingOrder } from "types";
import { FILLS, ORDER, ORDERBOOK } from "../store/store";
import { riskEngine } from "./risk";
import { handleBalanceChecks } from "./balance";
import { decodedTextSpanIntersectsWith } from "typescript";

export const handleCreateOrder = (payload: unknown) => {
    const data = payload as CreateOrderPayload;

    const risk = riskEngine(data);
    if (risk) {
        handleBalanceChecks();
    };

    if (data.side == Side.Buy) {
        handleBuyOrder(data);
    }
    else {
        handleSellOrder(data);
    }
}

export const handleBuyOrder = (data: CreateOrderPayload) => {
    let orderId = crypto.randomUUID();
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
        userId: data.userId
    });

    //Get orderbook
    const orderbook = ORDERBOOK.get(data.symbol);
    if (!orderbook) {
        return;
    }

    let remaining_qty = data.quantity;
    if (remaining_qty == 0){
        return;
    }

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
                let fill_order : Fill = {
                    orderId,
                    makerId : data.userId,
                    takerId: sellingOrder.userId,
                    makerOrderId: orderId,
                    takerOrderId: sellingOrder.orderId,
                    filledQty: matchingQty,
                    price: sellingOrder.price
                };
                buyerFills.push(fill_order);

                const sellerFills = FILLS.getOrInsert(orderId, []);
                let seller_fill_order : Fill = {
                    orderId,
                    makerId : data.userId,
                    takerId: sellingOrder.userId,
                    makerOrderId: orderId,
                    takerOrderId: sellingOrder.orderId,
                    filledQty: matchingQty,
                    price: sellingOrder.price
                };
                sellerFills.push(seller_fill_order);

                //Remove the remaining qty;
                remaining_qty -= matchingQty;
                
                let buyingOrder = ORDER.get(orderId);
                if (!buyingOrder){
                    return;
                }
                buyingOrder.remainingQty -= matchingQty;
                buyingOrder.filledQty += matchingQty;
            
                let sellOrder = ORDER.get(sellingOrder.orderId);
                if (!sellOrder){
                    return;
                }
                sellOrder.remainingQty -= matchingQty;
                sellOrder.filledQty += matchingQty;

                if (sellOrder.remainingQty == 0){
                    //Remove the orderfrom the book;
                    order.splice(i, 1);
                    i--;
                }
            }
        }
        
    }
    addBids(data, orderId, remaining_qty, orderbook);
}

const handleSellOrder = (data: CreateOrderPayload) => {
    let orderId = crypto.randomUUID();
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
        userId: data.userId
    });

    //Get orderbook
    const orderbook = ORDERBOOK.get(data.symbol);
    if (!orderbook) {
        return;
    }

    let remaining_qty = data.quantity;
    if (remaining_qty == 0){
        return;
    }

    for (const [price, order] of orderbook.bids.entries()) {
        if (price >= data.price) {
            for (let i = 0; i < order.length; i++) {
                let buyingOrder = order[i];
                if (!buyingOrder) {
                    continue;
                }
                const matchingQty = Math.min(buyingOrder?.remainingQty, remaining_qty);

                //Maker fill
                const buyerFills = FILLS.getOrInsert(orderId, []);
                let fill_order : Fill = {
                    orderId,
                    makerId : data.userId,
                    takerId: buyingOrder.userId,
                    makerOrderId: orderId,
                    takerOrderId: buyingOrder.orderId,
                    filledQty: matchingQty,
                    price: buyingOrder.price
                };
                buyerFills.push(fill_order);

                const sellerFills = FILLS.getOrInsert(orderId, []);
                let seller_fill_order : Fill = {
                    orderId,
                    makerId : buyingOrder?.userId,
                    takerId: data.userId,
                    makerOrderId: buyingOrder?.orderId,
                    takerOrderId: orderId,
                    filledQty: matchingQty,
                    price: buyingOrder.price
                };

                sellerFills.push(seller_fill_order);
                //Remove the remaining qty;
                remaining_qty -= matchingQty;
                
                let buyOrder = ORDER.get(buyingOrder.orderId);
                if (!buyOrder){
                    return;
                }
                buyOrder.remainingQty -= matchingQty;
                buyOrder.filledQty += matchingQty;
            
                let sellOrder = ORDER.get(orderId);
                if (!sellOrder){
                    return;
                }
                sellOrder.remainingQty -= matchingQty;
                sellOrder.filledQty += matchingQty;

                if (buyOrder.remainingQty == 0){
                    //Remove the orderfrom the book;
                    order.splice(i, 1);
                    i--;
                }
            }
        }
        addAsks(data, orderId, remaining_qty, orderbook);
    }
}

const addBids = async (order: CreateOrderPayload, orderId : string, remaining_qty : number, orderbook : Orderbook): Promise<void> => {
    let restingOrder: RestingOrder = {
      orderId : orderId,
      userId: order.userId,
      side: order.side,
      symbol: order.symbol,
      price: order.price,
      remainingQty : remaining_qty,
      filledQty: 0,
      timestamp : Date.now()
    }
  
    if (!orderbook.bids.has(restingOrder.price)){
        orderbook.bids.set(restingOrder.price, [restingOrder]);
        return;
    };
    orderbook.bids.get(restingOrder.price)?.push(restingOrder);
  }


const addAsks = async (order: CreateOrderPayload, orderId : string, remaining_qty : number, orderbook : Orderbook): Promise<void> => {
    let restingOrder: RestingOrder = {
      orderId : orderId,
      userId: order.userId,
      side: order.side,
      symbol: order.symbol,
      price: order.price,
      remainingQty : remaining_qty,
      filledQty: 0,
      timestamp : Date.now()
    }
  
    if (!orderbook.asks.has(restingOrder.price)){
        orderbook.asks.set(restingOrder.price, [restingOrder]);
        return;
    };
    orderbook.asks.get(restingOrder.price)?.push(restingOrder);
  }
