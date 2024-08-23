import { Router } from "express";

const reservasRouter = Router()

reservasRouter.get("/", (_req,res)=>{
    res.send({data: "Obteniendo reservas"})
})

export default reservasRouter