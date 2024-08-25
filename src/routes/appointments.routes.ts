import { Router } from "express";

const appointmentsRouter = Router()

appointmentsRouter.get("/", (_req,res)=>{
    res.send({data: "Obteniendo reservas"})
})

export default appointmentsRouter