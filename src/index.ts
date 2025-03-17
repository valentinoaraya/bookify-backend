import express from "express"
import mongoose from "mongoose"
import appointmentsRouter from "./routes/appointments.routes"
import companiesRouter from "./routes/companies.routes"
import userRouter from "./routes/user.routes"
import cors from "cors"
import servicesRouter from "./routes/services.routes"
import { PORT, MONGOOSE_URL, FRONTEND_URL } from "./config"
import { startSendReminders } from "./utils/sendAppointmentReminders"
import { startCleanupAppointments } from "./utils/cleanupAppointments"
import mercadopagoRouter from "./routes/mercadopago.routes"

const app = express()

app.use(cors({
    origin: FRONTEND_URL || "http://localhost:5173",
    credentials: true
}))
app.use(express.json())

mongoose.connect(MONGOOSE_URL as string)
    .then(() => {
        console.log("Connected to MongoDB")
    })
    .catch((error) => {
        console.log("Failed to connect to MongoDB Atlas ", error)
    })

startSendReminders()
startCleanupAppointments()

app.use("/appointments", appointmentsRouter)
app.use("/companies", companiesRouter)
app.use("/users", userRouter)
app.use("/services", servicesRouter)
app.use("/mercadopago", mercadopagoRouter)

app.listen(PORT, () => {
    console.log(`Server runing on port ${PORT}`)
})