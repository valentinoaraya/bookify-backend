import { Request, Response } from "express";
import { userToAdd, verifyToLoginUser } from "../utils/verifyData";
import UserModel from "../models/User";
import { createToken } from "../utils/verifyData";
import { type Email, PopulatedAppointment } from "../types";
import { parseDateToString } from "../utils/parseDateToString";

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
            }).lean()

        if (!newUser) return res.send({ error: "No se encontró usuario" }).status(400)

        const newUserAppointments = newUser.appointments as unknown as PopulatedAppointment[]

        const userAppointmentsWithDateInString = newUserAppointments.map(appointment => {
            const { stringDate, time } = parseDateToString(appointment.date)
            return { ...appointment, date: `${stringDate} ${time}` }
        })

        res.send({
            data: {
                type: "user",
                _id: newUser._id,
                name: newUser.name,
                lastName: newUser.lastName,
                email: newUser.email,
                phone: newUser.phone,
                appointments: userAppointmentsWithDateInString
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

        res.send({
            data: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                rol: newUser.role,
                access_token: token
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
        res.send({ data: { ...user, access_token: token } }).status(200)
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