import { Router } from "express";
import { createUser, getUser, loginUser, updateUser } from "../controllers/userController";
import { authenticateTokenUser } from "../middlewares/verifyTokens";

const userRouter = Router()

userRouter.get("/get-user", authenticateTokenUser, getUser)
userRouter.put("/update-user", authenticateTokenUser, updateUser)
userRouter.post("/login", loginUser)
userRouter.post("/register", createUser)

export default userRouter