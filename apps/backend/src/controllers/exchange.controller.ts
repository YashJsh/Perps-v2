import { success, z, ZodError } from "zod";
import { createOrderSchema } from "../types/exchange.types";
import type { Request, Response } from "express";
import { sendToEngine } from "../utils/engine_request";
import { EngineRequestOptions } from "types";

export const createOrderController = async (req: Request, res: Response) => {
    try {
        const body = createOrderSchema.parse(req.body);
        const sendToEng = await sendToEngine(EngineRequestOptions.CreateOrder, body);
        res.status(sendToEng.ok ? 200 : 500).json(sendToEng.ok? sendToEng.data : sendToEng.error);
    } catch (error) {
        if (error instanceof ZodError){
            return res.status(403).json({
                success : false,
                error : "Invalid body error/ Error in body"
            });
        }
        return res.status(500).json({
            success : false,
            error : "Invalid Engine Response"
        })
    }
}