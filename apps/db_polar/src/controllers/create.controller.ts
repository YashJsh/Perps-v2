import { prisma } from "db";
import type { Order } from "types";

export const saveCreateOrderData = async (order: Order) => {
    try {
        const find_order = await prisma.order.findUnique({
            where: {
                id: order.orderId
            }
        });
        if (find_order) {
            throw new Error("Order already exists");
        }
    } catch (error) {

    }
}