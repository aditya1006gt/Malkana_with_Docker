import express from "express";
import userRouter from "./user.js";
import caseRouter from "./case.js";
import messageRouter from "./messages.js";
import uploadRouter from "./upload.js";
const router = express.Router();
router.use("/user", userRouter);
router.use("/case", caseRouter);
router.use("/message", messageRouter);
router.use("/upload", uploadRouter);
export default router;
//# sourceMappingURL=index.js.map