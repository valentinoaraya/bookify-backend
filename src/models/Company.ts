import mongoose, { Schema } from "mongoose";

const CompanySchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    location: { type: String },
    role: {type: String, enum: ["admin", "user"], default: "user"},
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const CompanyModel = mongoose.model("Company", CompanySchema)

export default CompanyModel