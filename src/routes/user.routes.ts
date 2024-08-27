import { Router } from "express";
import { createUser, getUsers, loginUser } from "../controllers/userController";

const userRouter = Router()

userRouter.post("/register", createUser)
userRouter.post("/login", loginUser)
userRouter.get("/", getUsers)

export default userRouter