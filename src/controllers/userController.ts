import { Request, Response } from "express";
import { userToAdd, verifyToLoginUser } from "../utils/verifyData";
import UserModel from "../models/User";
import { createToken } from "../utils/verifyData";
import { type Email, PopulatedAppointment } from "../types";
import moment from "moment-timezone"

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

        if (!newUser) return res.status(400).send({ error: "No se encontró usuario" })

        const newUserAppointments = newUser.appointments as unknown as PopulatedAppointment[]

        const userAppointmentsWithDateInString = newUserAppointments.map(appointment => {
            const dateInString = moment(appointment.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
            return { ...appointment, date: dateInString }
        })

        res.status(200).send({
            data: {
                type: "user",
                _id: newUser._id,
                name: newUser.name,
                lastName: newUser.lastName,
                email: newUser.email,
                phone: newUser.phone,
                appointments: userAppointmentsWithDateInString
            }
        })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

// Registrar

export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await userToAdd(req.body)
        const newUser = new UserModel(user)
        const userFound = await UserModel.findOne({ email: user.email })

        if (userFound) throw new Error("Ya existe una cuenta con este email.")

        await newUser.save()
        const token = createToken({
            id: newUser.id,
            name: `${newUser.name} ${newUser.lastName}`,
            email: newUser.email as Email,
        })

        res.status(200).send({
            data: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                rol: newUser.role,
                access_token: token
            }
        })

    } catch (error: any) {
        res.status(400).send({ error: error.message })
    }
}

// Loguear

export const loginUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await verifyToLoginUser(req.body)
        const token = createToken(user)
        res.status(200).send({ data: { ...user, access_token: token } })
    } catch (error: any) {
        res.status(400).send({ error: error.message })
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

        if (!updatedUser) return res.status(400).send({ error: "No se encontró usuario" })

        const fullData = {
            type: "user",
            name: updatedUser.name,
            lastName: updatedUser.lastName,
            email: updatedUser.email,
            phone: updatedUser.phone,
        }

        res.status(200).send({ data: fullData })
    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}