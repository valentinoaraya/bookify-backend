import { Types, UpdateQuery } from "mongoose"
import { BaseRepository } from "../../shared/base/base.repository"
import ServiceModel from "./service.model"
import { ServiceDocument } from "./service.types"

export class ServiceRepository extends BaseRepository<ServiceDocument> {
    constructor() {
        super(ServiceModel)
    }

    async findByCompany(companyId: string | Types.ObjectId): Promise<ServiceDocument[]> {
        return this.find({ companyId })
    }

    async findLeanById(id: string | Types.ObjectId): Promise<ServiceDocument | null> {
        return this.model.findById(id).lean().exec() as Promise<ServiceDocument | null>
    }

    async setFields(
        id: string | Types.ObjectId,
        fields: UpdateQuery<ServiceDocument>
    ): Promise<ServiceDocument | null> {
        return this.model
            .findByIdAndUpdate(id, fields, { new: true })
            .lean()
            .exec() as Promise<ServiceDocument | null>
    }

    async deactivateMany(ids: Types.ObjectId[]): Promise<void> {
        await this.model.updateMany({ _id: { $in: ids } }, { active: false })
    }

    async activateMany(ids: Types.ObjectId[]): Promise<void> {
        await this.model.updateMany({ _id: { $in: ids } }, { $set: { active: true } })
    }

    async findByCompanySorted(companyId: string | Types.ObjectId): Promise<ServiceDocument[]> {
        return this.model.find({ companyId }).sort({ createdAt: 1 }).exec()
    }
}
