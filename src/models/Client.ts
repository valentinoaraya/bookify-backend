import mongoose, {Schema} from "mongoose";

const ClientSchema = new Schema({
    name: {type: String, required: true},
    email: {type: String, required: true},
    phone: {type: String, required: true},
    appointments: [{type: Schema.Types.ObjectId, ref: "Appointment"}],
    createdAt: {type: Date, default: Date.now},
    updatedAt: {type: Date, default: Date.now},
})

const ClientModel = mongoose.model("Client", ClientSchema)

export default ClientModel