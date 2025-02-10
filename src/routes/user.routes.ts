import { Router } from "express";
import { createUser, getUser, getUsers, loginUser, logoutUser, updateUser } from "../controllers/userController";
import { authenticateTokenUser } from "../middlewares/verifyTokens";

const userRouter = Router()

userRouter.get("/", authenticateTokenUser, getUsers)
userRouter.get("/get-user", authenticateTokenUser, getUser)
userRouter.put("/update-user", authenticateTokenUser, updateUser)
userRouter.post("/login", loginUser)
userRouter.post("/register", createUser)
userRouter.post("/logout", logoutUser)

export default userRouter