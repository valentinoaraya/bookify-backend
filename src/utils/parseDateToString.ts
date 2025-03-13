export const parseDateToString = (date: Date | string) => {
    const newDate = new Date(date)
    const stringDate = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}-${String(newDate.getDate()).padStart(2, "0")}`
    const time = `${String(newDate.getHours()).padStart(2, "0")}:${String(newDate.getMinutes()).padStart(2, "0")}`
    return { stringDate, time }
}