import express from "express"
import mongoose from "mongoose"
import dotenv from "dotenv"
import cookieParser from "cookie-parser"
import appointmentsRouter from "./routes/appointments.routes"
import companiesRouter from "./routes/companies.routes"
import userRouter from "./routes/user.routes"

dotenv.config()

const app = express()
app.use(express.json())
app.use(cookieParser())

const PORT = 3000

const mongoURL = process.env.MONGODB_URL_CONNECTION as string

mongoose.connect(mongoURL)
.then(()=>{
    console.log("Connected to MongoDB")
})
.catch((error)=>{
    console.log("Failed to connect to MongoDB Atlas ", error)
})

app.get("/", (_req, res) => {
    console.log("Alguien entro al origen")
    res.send("hola")
})

app.use("/appointments", appointmentsRouter)
app.use("/companies", companiesRouter)
app.use("/users", userRouter)

app.listen(PORT, ()=>{
    console.log(`Server runing on port ${PORT}`)
})