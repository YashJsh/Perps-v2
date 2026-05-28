import { Router } from "express";
import { cancelOrderController, createOrderController } from "../controllers/exchange.controller";

const router = Router();

router.post("/create", createOrderController);
router.post("/cancel", cancelOrderController);

export default router;