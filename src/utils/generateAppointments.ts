import moment from "moment";
import { AvailableAppointment } from "../types";

export const generateAppointments = (body: {
    hourStart: string,
    hourFinish: string,
    turnEach: string,
    days: string[],
    capacityPerShift: number
}): AvailableAppointment[] => {
    const { hourStart, hourFinish, turnEach, days, capacityPerShift } = body;
    const turnEachMinutes = parseInt(turnEach, 10);
    const availableAppointments: AvailableAppointment[] = [];
    days.forEach((day) => {
        let currentTime = moment(day).set({
            hour: parseInt(hourStart.split(":")[0]),
            minute: parseInt(hourStart.split(":")[1]),
        });
        const endTime = moment(day).set({
            hour: parseInt(hourFinish.split(":")[0]),
            minute: parseInt(hourFinish.split(":")[1]),
        });

        while (currentTime.isBefore(endTime) || currentTime.isSame(endTime)) {
            availableAppointments.push({
                datetime: currentTime.format("YYYY-MM-DD HH:mm"),
                capacity: capacityPerShift,
                taken: 0
            });
            currentTime.add(turnEachMinutes, "minutes");
        }
    });

    return availableAppointments;
};