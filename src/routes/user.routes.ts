import { Router } from "express";
import { createUser, getUsers, loginUser } from "../controllers/userController";
import authenticateToken from "../middlewares/verifyTokens";

const userRouter = Router()

userRouter.post("/register", createUser)
userRouter.post("/login", loginUser)
userRouter.get("/", authenticateToken, getUsers)

export default userRouter