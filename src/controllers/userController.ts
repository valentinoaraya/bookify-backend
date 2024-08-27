import { Request, Response } from "express";
import { userToAdd, verifyToLogin } from "../utils";
import UserModel from "../models/User";

export const createUser = async (req: Request, res: Response): Promise<void> => {
    try{
        const user = await userToAdd(req.body)
        const newUser = new UserModel(user)
        const userFound = await UserModel.findOne({username: user.username})

        if (userFound) throw new Error("Usuario ya existente")

        await newUser.save()
        res.send({data: newUser}).status(200)

    } catch (error: any) {
        res.send({error: error.message}).status(400)
    }
}

export const getUsers = async (_req: Request, res: Response): Promise<void> => {
    try{
        const users = await UserModel.find()
        res.send({data: users}).status(200)
    } catch (error: any) {
        res.send({error: error.message}).status(500)
    }
}

// Loguear

export const loginUser = async (req: Request, res: Response): Promise<void> => {
    try{
        const user = await verifyToLogin(req.body)
        res.send({data: {
            username: user.username,
            email: user.email
        }})
        .status(200)
    } catch (error: any){
        res.send({error: error.message}).status(400)
    }
}