import { Request, Response } from "express";
import { appointmentToAdd } from "../utils";
import AppointmentModel from "../models/Appointment";
import UserModel from "../models/User";

export const createAppointment = async (req: Request, res: Response): Promise<void | Response> => {

    try {
        const idUser = req.user?.id
        const appointment = appointmentToAdd(req.body)

        const newAppointment = new AppointmentModel({ clientId: idUser, ...appointment })

        const savedAppointment = await newAppointment.save()
        await UserModel.findByIdAndUpdate(idUser, {
            $push: { appointments: savedAppointment._id }
        })

        res.send({ data: savedAppointment }).status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }

}