import mongoose, {Schema} from "mongoose";

const ServiceSchema = new Schema({
    companyId: {type: Schema.Types.ObjectId, ref: "Company", required: true},
    name: { type: String, required: true },
    description: { type: String },
    duration: { type: Number, required: true },
    price: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})

const ServiceModel = mongoose.model("Service", ServiceSchema)

export default ServiceModel