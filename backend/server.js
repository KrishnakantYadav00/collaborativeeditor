import express from 'express'
import {createServer} from "http"
import {Server} from "socket.io"
import cors from 'cors' 
import {YSocketIO} from "y-socket.io/dist/server"

const app = express()
const httpserver = createServer(app)
const io=  new Server(httpserver,{
    cors:"*",
    methods:["GET","POST"]
})
const ysocketio= new YSocketIO(io)
ysocketio.initialize()


app.get("/",(req,res)=>{
    res.status(200).json(
        {
            message:"Request:OKAY",
            success:true
        }
    )


})
app.get("/health",(req,res)=>{
    res.status(200).json({
        message:"Server's running good"
        ,
        success:true
    })})




httpserver.listen(3000,()=>{"Server's up bois!!!!!"})