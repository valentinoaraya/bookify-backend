import { Types, UpdateQuery } from "mongoose"
import { BaseRepository } from "../../shared/base/base.repository"
import CompanyModel from "./company.model"
import { CompanyDocument } from "./company.types"

export class CompanyRepository extends BaseRepository<CompanyDocument> {
    constructor() {
        super(CompanyModel)
    }

    async findByEmail(email: string): Promise<CompanyDocument | null> {
        return this.findOne({ email })
    }

    async findByCompanyId(companyId: string): Promise<CompanyDocument | null> {
        return this.model.findOne({ company_id: companyId }).populate("services").lean().exec() as Promise<CompanyDocument | null>
    }

    async findByCompanyIdSlug(companyId: string): Promise<CompanyDocument | null> {
        return this.findOne({ company_id: companyId })
    }

    async updateRefreshToken(
        id: string | Types.ObjectId,
        refreshToken: string
    ): Promise<CompanyDocument | null> {
        return this.updateById(id, { refresh_token: refreshToken })
    }

    async findCompanyIdInUse(
        companyId: string,
        excludeId: string | Types.ObjectId
    ): Promise<boolean> {
        return this.exists({ company_id: companyId, _id: { $ne: excludeId } })
    }

    /**
     * Carga el panel de la empresa (servicios + reminders + subscription).
     * Los turnos agendados se obtienen vía AppointmentRepository.findScheduledByCompany.
     */
    async findPanelById(id: string | Types.ObjectId): Promise<CompanyDocument | null> {
        return this.model
            .findById(id)
            .populate("services")
            .populate("reminders.services", "title")
            .populate("subscriptionId")
            .lean()
            .exec() as Promise<CompanyDocument | null>
    }

    async updateCompanyFields(
        id: string | Types.ObjectId,
        fields: UpdateQuery<CompanyDocument>
    ): Promise<CompanyDocument | null> {
        return this.model
            .findByIdAndUpdate(id, fields, { new: true })
            .populate("reminders.services", "title")
            .lean()
            .exec() as Promise<CompanyDocument | null>
    }
}
