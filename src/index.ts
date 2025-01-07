import express from "express"
import mongoose from "mongoose"
import cookieParser from "cookie-parser"
import appointmentsRouter from "./routes/appointments.routes"
import companiesRouter from "./routes/companies.routes"
import userRouter from "./routes/user.routes"
import cors from "cors"
import servicesRouter from "./routes/services.routes"
import { PORT, MONGOOSE_URL } from "./config"

const app = express()

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}))
app.use(express.json())
app.use(cookieParser())

mongoose.connect(MONGOOSE_URL as string)
    .then(() => {
        console.log("Connected to MongoDB")
    })
    .catch((error) => {
        console.log("Failed to connect to MongoDB Atlas ", error)
    })

app.get("/", (_req, res) => {
    console.log("Alguien entro al origen")
    res.send("hola")
})

app.use("/appointments", appointmentsRouter)
app.use("/companies", companiesRouter)
app.use("/users", userRouter)
app.use("/services", servicesRouter)

app.listen(PORT, () => {
    console.log(`Server runing on port ${PORT}`)
})