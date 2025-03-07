import { Request, Response } from "express";
import { userToAdd, verifyToLoginUser } from "../utils/verifyData";
import UserModel from "../models/User";
import { createToken } from "../utils/verifyData";
import { Email } from "../types";
import { NODE_ENV } from "../config";

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
                    { path: "serviceId", model: "Service", select: "title duration price" },
                    { path: "companyId", model: "Company", select: "name city street number" },
                ]
            })

        if (!newUser) return res.send({ error: "No se encontró usuario" }).status(400)

        res.send({
            data: {
                type: "user",
                _id: newUser._id,
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
        const token = createToken({
            id: newUser.id,
            name: newUser.name,
            email: newUser.email as Email,
        })

        res
            .cookie("acces_token", token, {
                httpOnly: true, // Solo leer en el servidor
                maxAge: 1000 * 60 * 60, // 1 hora de vida
                secure: NODE_ENV === "production",
                sameSite: "none"
            })
            .send({
                data: {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    rol: newUser.role
                }
            })
            .status(200)

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
                secure: NODE_ENV === "production",
                sameSite: "none"
            })
            .send({ data: user })
            .status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(400)
    }
}

// Actualizar

export const updateUser = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const user = req.user
        const data = req.body
        const updatedUser = await UserModel.findByIdAndUpdate(
            user?.id,
            { $set: data },
            { new: true }
        )

        if (!updatedUser) return res.send({ error: "No se encontró usuario" }).status(400)

        const fullData = {
            type: "user",
            name: updatedUser.name,
            lastName: updatedUser.lastName,
            email: updatedUser.email,
            phone: updatedUser.phone,
        }

        res.send({ data: fullData }).status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

// Logout

export const logoutUser = async (_req: Request, res: Response): Promise<void> => {
    res.clearCookie("acces_token").send({ data: "Sesión cerrada" }).status(200)
}