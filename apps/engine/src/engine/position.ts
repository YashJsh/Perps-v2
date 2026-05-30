import { Side, type Position } from "types";
import { BALANCES, FILLS, ORDER, POSITION } from "../store/store";

const buyLiquidationPrice = (entryPrice: number, leverage: number) => {
    return entryPrice - entryPrice / leverage;
}

const sellLiquidationPrice = (entryPrice: number, leverage: number) => {
    return entryPrice + entryPrice / leverage;
}

const updateRealizedPnlLong = (entryPrice: number, size: number, exitPrice: number) => {
    return (exitPrice - entryPrice) * size;
};

const updateRealizedPnlShort = (entryPrice: number, size: number, exitPrice: number) => {
    return (entryPrice - exitPrice) * size;
};

export const positionAccounting = (orderId: string) => {
    const order = ORDER.get(orderId);
    if (!order) {
        throw Error("Order not found");
    }
    const fills = FILLS.get(orderId);
    if (!fills) {
        throw new Error("No fills found for order");
    }
    const balances = BALANCES.get(order.userId);
    if (!balances) {
        throw new Error("Balance not found");
    }


    let new_notional_value = 0;
    let incoming_signed_exposure = 0; // Total qty

    for (let i = 0; i < fills.length; i++) {
        const currentFill = fills[i];
        if (!currentFill) {
            continue;
        }
        if (currentFill?.marked == false) {
            const signedQty =
                order.side === Side.Buy
                    ? currentFill.filledQty
                    : -currentFill.filledQty;
            new_notional_value += currentFill.price * currentFill?.filledQty;
            incoming_signed_exposure += signedQty;
            currentFill.marked = true;
        }
    };


    const position = POSITION.get(order.userId + order.symbol);
    if (!position) {
        //Create a fresh one:
        const entryPrice = new_notional_value / incoming_signed_exposure;
        const margin = new_notional_value / order.leverage;
        const liquidationPrice = order.side == Side.Buy ? buyLiquidationPrice(entryPrice, order.leverage) : sellLiquidationPrice(entryPrice, order.leverage);

        const pos: Position = {
            userId: order.userId,
            symbol: order.symbol,
            size: incoming_signed_exposure,
            averageEntryPrice: entryPrice,
            leverage: order.leverage,
            margin: margin,
            liquidationPrice: liquidationPrice,
            realizedPnl: null,
            market : order.symbol,
            side : order.side
        };
        const position = POSITION.set(order.userId + order.symbol, pos);
        console.log("Position placed successfully");
        return;
    }

    if (Math.sign(position.size) === Math.sign(incoming_signed_exposure)) {
        //Same side short same side long case
        //In this case exposure will increase only.
        const new_qty = position.size + incoming_signed_exposure;
        const average_new_entry_price_numerator = Math.abs(position.size) * position.averageEntryPrice + new_notional_value;
        const average_new_entry_price_denominator = Math.abs(position.size) + Math.abs(incoming_signed_exposure);
        const average_new_entry_price = average_new_entry_price_numerator / average_new_entry_price_denominator;

        const newMargin = average_new_entry_price_numerator / order.leverage;
        const newliquidationPrice = order.side == Side.Buy ? buyLiquidationPrice(average_new_entry_price, order.leverage) : sellLiquidationPrice(average_new_entry_price, order.leverage);

        position.averageEntryPrice = average_new_entry_price;
        position.leverage = order.leverage;
        position.margin = newMargin;
        position.size = new_qty;
        position.liquidationPrice = newliquidationPrice;

        return;
    } else {
        //Now here also it has 3 cases.
        //1. Completely reduce the qty
        //2. Reduce a little qty
        //3. Flip the position.
        const new_qty = position.size + incoming_signed_exposure;
        if (new_qty == 0) {
            //Case 1;
            const exitPrice = new_notional_value / Math.abs(incoming_signed_exposure)
            const calculatePnl = position.size > 0 ? updateRealizedPnlLong(position.averageEntryPrice, position.size, exitPrice) : updateRealizedPnlShort(position.averageEntryPrice, position.size, exitPrice);

            position.realizedPnl = calculatePnl;
            balances.available += calculatePnl + balances.locked;
            balances.locked -= position.margin;
            
            return;
        }
        if (Math.abs(new_qty) < Math.abs(position.size)) {
            //Case 2 : 
            //Reduce some qty case : 
            // Here reduce qty only. Entry price will remain same. Only margin will change.
            const closedQty =
                Math.min(
                    Math.abs(position.size),
                    Math.abs(incoming_signed_exposure)
                )
            const exitPrice = new_notional_value / Math.abs(incoming_signed_exposure)
            const calculatePnl = position.size > 0 ? updateRealizedPnlLong(position.averageEntryPrice, closedQty, exitPrice) : updateRealizedPnlShort(position.averageEntryPrice, closedQty, exitPrice);

            balances.available += calculatePnl;
            position.size = new_qty;
            const new_notional = position.averageEntryPrice * Math.abs(position.size);
            position.margin = new_notional / order.leverage;
            return;
        }
        if (Math.abs(new_qty) > Math.abs(position.size)) {
            const closedQty =
                Math.min(
                    Math.abs(position.size),
                    Math.abs(incoming_signed_exposure)
                )
           
            const exitPrice = new_notional_value / Math.abs(incoming_signed_exposure)
            const pnl = position.size > 0 ? updateRealizedPnlLong(position.averageEntryPrice, closedQty, exitPrice) : updateRealizedPnlShort(position.averageEntryPrice, closedQty, exitPrice);
            balances.available += pnl;
            balances.locked -= position.margin;

            position.size = new_qty;
            position.averageEntryPrice = exitPrice;
            position.margin = Math.abs(new_qty) * exitPrice / order.leverage;
            position.liquidationPrice = order.side == Side.Buy ? buyLiquidationPrice(exitPrice, order.leverage) : sellLiquidationPrice(exitPrice, order.leverage);
            position.leverage = order.leverage;
            return;
        }
    }
}


