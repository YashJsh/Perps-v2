import * as z from "zod";

const onRampSchema = z.object({
    symbol : z.enum(["INR", "USD"]),
    amount : z.number
});

export {
    onRampSchema
}