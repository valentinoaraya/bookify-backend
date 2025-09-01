import express from "express"
import mongoose from "mongoose"
import appointmentsRouter from "./routes/appointments.routes"
import companiesRouter from "./routes/companies.routes"
import cors from "cors"
import servicesRouter from "./routes/services.routes"
import { PORT, MONGOOSE_URL, FRONTEND_URL } from "./config"
import { startSendReminders } from "./utils/sendAppointmentReminders"
import { startCleanupAppointments } from "./utils/cleanupAppointments"
import { startCleanupPendingAppointments } from "./utils/managePendingAppointments"
import mercadopagoRouter from "./routes/mercadopago.routes"
import http from "http"
import { Server } from "socket.io"

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
startCleanupPendingAppointments()

app.use("/appointments", appointmentsRouter)
app.use("/companies", companiesRouter)
app.use("/services", servicesRouter)
app.use("/mercadopago", mercadopagoRouter)
app.use(express.json())

const server = http.createServer(app)
export const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POTS"]
    }
})

io.on("connection", (socket) => {
    console.log("Cliente conectado:", socket.id)

    socket.on("joinCompany", (companyId: string) => {
        socket.join(companyId)
        console.log(`Cliente ${socket.id} unido a la empresa ${companyId}`)
    })

    socket.on("disconnect", () => {
        console.log("Cliente desconectado:", socket.id)
    })
})

server.listen(PORT, () => {
    console.log(`Server runing on port ${PORT}`)
})