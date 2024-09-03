import { Router } from "express";
import { createUser, getUsers, loginUser } from "../controllers/userController";
import { authenticateTokenUser } from "../middlewares/verifyTokens";

const userRouter = Router()

userRouter.post("/register", createUser)
userRouter.post("/login", loginUser)
userRouter.get("/", authenticateTokenUser, getUsers)

export default userRouter