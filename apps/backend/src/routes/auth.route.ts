import { Router } from "express";
import { onRamp, signInController, signUpController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post("/signup", signUpController);
router.post("/signin", signInController);
router.post("/on_ramp", authMiddleware, onRamp);

export default router;
