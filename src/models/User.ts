import mongoose, {Schema} from "mongoose";

const UserSchema = new Schema({
    username: {type: String, required: true},
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    phone: {type: String},
    appointments: [{type: Schema.Types.ObjectId, ref: "Appointment"}],
    createdAt: {type: Date, default: Date.now},
    updatedAt: {type: Date, default: Date.now},
})

const UserModel = mongoose.model("User", UserSchema)

export default UserModel