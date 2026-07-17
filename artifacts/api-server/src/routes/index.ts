import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import generalRouter from "./general.js";
import friendsRouter from "./friends.js";

const router = Router();

router.use("/healthz", healthRouter);
router.use("/auth", authRouter);
router.use("/general", generalRouter);
router.use("/friends", friendsRouter);

export default router;
