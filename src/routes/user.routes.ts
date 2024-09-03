import { Router } from "express";
import { createUser, getUsers, loginUser } from "../controllers/userController";
import { authenticateTokenUser } from "../middlewares/verifyTokens";

const userRouter = Router()

userRouter.get("/", authenticateTokenUser, getUsers)
userRouter.post("/login", loginUser)
userRouter.post("/register", createUser)

export default userRouter