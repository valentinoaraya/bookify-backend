import { Request, Response } from "express";
import { userToAdd, verifyToLoginUser } from "../utils";
import UserModel from "../models/User";
import { createToken } from "../utils";

export const getUsers = async (req: Request, res: Response): Promise<void | Response> => {

    if (req.user?.rol != "admin") return res.send({ error: "Usuario no autorizado" }).status(401)

    try {
        const users = await UserModel.find()
        res.send({ data: users }).status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

export const getUser = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const user = req.user

        const newUser = await UserModel.findById(user?.id)
            .populate({
                path: "appointments",
                populate: [
                    { path: "serviceId", model: "Service" },
                    { path: "companyId", model: "Company" },
                ]
            })

        if (!newUser) return res.send({ error: "No se encontró usuario" }).status(400)

        res.send({
            data: {
                name: newUser.name,
                lastName: newUser.lastName,
                email: newUser.email,
                phone: newUser.phone,
                appointments: newUser.appointments
            }
        }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

// Registrar

export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await userToAdd(req.body)
        const newUser = new UserModel(user)
        const userFound = await UserModel.findOne({ username: user.email })

        if (userFound) throw new Error("Ya existe una cuenta con este email.")

        await newUser.save()
        res.send({ data: "Usuario registrado con éxito." }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(400)
    }
}

// Loguear

export const loginUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await verifyToLoginUser(req.body)
        const token = createToken(user)
        res
            .cookie("acces_token", token, {
                httpOnly: true, // Solo leer en el servidor
                maxAge: 1000 * 60 * 60, // 1 hora de vida
                sameSite: "lax"
            })
            .send({ data: { userName: user.name, email: user.email } })
            .status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(400)
    }
}