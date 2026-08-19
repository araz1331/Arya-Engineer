import { Router, type IRouter } from "express";
import healthRouter from "./health";
import knowledgeRouter from "./knowledge";

const router: IRouter = Router();

router.use(healthRouter);
router.use(knowledgeRouter);

export default router;
