import moment from "moment";

export const generateAppointments = (body: {
    hourStart: string,
    hourFinish: string,
    turnEach: string,
    days: string[]
}): string[] => {
    const { hourStart, hourFinish, turnEach, days } = body;
    const turnEachMinutes = parseInt(turnEach, 10);
    const availableAppointments: string[] = [];
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
            availableAppointments.push(currentTime.format("YYYY-MM-DD HH:mm"));
            currentTime.add(turnEachMinutes, "minutes");
        }
    });

    return availableAppointments;
};