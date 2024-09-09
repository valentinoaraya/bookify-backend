import { Router } from "express";
import { createUser, getUser, getUsers, loginUser } from "../controllers/userController";
import { authenticateTokenUser } from "../middlewares/verifyTokens";

const userRouter = Router()

userRouter.get("/", authenticateTokenUser, getUsers)
userRouter.get("/get-user", authenticateTokenUser, getUser)
userRouter.post("/login", loginUser)
userRouter.post("/register", createUser)

export default userRouter