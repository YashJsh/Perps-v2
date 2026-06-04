import { Router } from "express";
import { cancelOrderController, createOrderController } from "../controllers/exchange.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post("/create", authMiddleware, createOrderController);
router.post("/cancel", authMiddleware, cancelOrderController);

export default router;