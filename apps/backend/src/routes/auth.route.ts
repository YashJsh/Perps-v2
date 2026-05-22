import { Router } from "express";
import { signInController, signUpController } from "../controllers/auth.controller";

const router = Router();

router.post("/signup", signUpController);
router.post("/signin", signInController);

export default router;
