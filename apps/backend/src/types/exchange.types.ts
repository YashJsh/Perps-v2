import * as z from "zod";

const onRampSchema = z.object({
    symbol : z.enum(["INR", "USD"]),
    amount : z.number()
});

const createOrderSchema = z.object({
    userId : z.string(),
    symbol : z.enum(["Buy", "Sell"]),
    price : z.number(),
    quantity : z.number(),
    side : z.enum(["Buy", "Sell"]),
    type : z.enum(["Market", "Limit"]),
    leverage : z.number()
})

const cancelOrderSchema = z.object({
    orderId : z.string(),
})

export {
    onRampSchema,
    createOrderSchema,
    cancelOrderSchema
}