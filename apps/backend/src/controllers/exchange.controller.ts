import { ZodError } from "zod";
import { cancelOrderSchema, createOrderSchema } from "../types/exchange.types";
import type { Request, Response } from "express";
import { sendToEngine } from "../utils/engine_request";
import { EngineRequestOptions } from "types";

export const createOrderController = async (req: Request, res: Response) => {
  try {
    const body = createOrderSchema.safeParse(req.body);
    if (!body.success) {
      console.log(body.error);
      return;
    }
    const sendToEng = await sendToEngine(EngineRequestOptions.CreateOrder, body.data);
    res.status(sendToEng.ok ? 200 : 500).json(sendToEng.ok ? sendToEng.data : sendToEng.error);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(403).json({
        success: false,
        error: "Invalid body error/ Error in body"
      });
    }
    return res.status(500).json({
      success: false,
      error: "Invalid Engine Response"
    })
  }
}

export const cancelOrderController = async (req: Request, res: Response) => {
  try {
    const body = cancelOrderSchema.parse(req.body);
    const sendToEng = await sendToEngine(EngineRequestOptions.CancelOrder, {
      orderId: body.orderId,
      userId: req.id
    });
    res.status(sendToEng.ok ? 200 : 500).json(sendToEng.ok ? sendToEng.data : sendToEng.error);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(403).json({
        success: false,
        error: "Invalid body error/ Error in body"
      });
    }
    return res.status(500).json({
      success: false,
      error: "Invalid Engine Response"
    })
  }
}
