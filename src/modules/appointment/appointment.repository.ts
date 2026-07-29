import { ClientSession, FilterQuery, Types } from "mongoose"
import { BaseRepository } from "../../shared/base/base.repository"
import AppointmentModel from "./appointment.model"
import { AppointmentDocument } from "./appointment.types"

type SessionOpts = { session?: ClientSession | null }

export class AppointmentRepository extends BaseRepository<AppointmentDocument> {
    constructor() {
        super(AppointmentModel)
    }

    async createWithSession(
        data: Partial<AppointmentDocument>,
        opts: SessionOpts = {}
    ): Promise<AppointmentDocument> {
        const docs = await this.model.create([data], {
            session: opts.session ?? undefined,
        })
        return docs[0]
    }

    async updateByIdWithSession(
        id: string | Types.ObjectId,
        update: Record<string, unknown>,
        opts: SessionOpts = {}
    ): Promise<AppointmentDocument | null> {
        return this.model
            .findByIdAndUpdate(id, update, {
                new: true,
                session: opts.session ?? undefined,
            })
            .exec()
    }

    /**
     * Cancela solo si sigue `scheduled`. El filtro sobre el estado hace la
     * operación atómica: dos cancelaciones simultáneas no pueden liberar el slot
     * ni disparar el reembolso dos veces.
     */
    async cancelIfScheduled(
        id: string | Types.ObjectId,
        cancelledBy: "client" | "company",
        opts: SessionOpts = {}
    ): Promise<AppointmentDocument | null> {
        return this.model
            .findOneAndUpdate(
                { _id: id, status: "scheduled" },
                {
                    $set: {
                        status: "cancelled",
                        cancelledBy,
                        reminderJobs: [],
                        updatedAt: new Date(),
                    },
                },
                { new: true, session: opts.session ?? undefined }
            )
            .exec()
    }

    async findLeanById(id: string | Types.ObjectId): Promise<AppointmentDocument | null> {
        return this.model.findById(id).lean().exec() as Promise<AppointmentDocument | null>
    }

    async findLeanByIdPopulated(
        id: string | Types.ObjectId
    ): Promise<AppointmentDocument | null> {
        return this.model
            .findById(id)
            .populate("serviceId")
            .lean()
            .exec() as Promise<AppointmentDocument | null>
    }

    async findScheduledByService(
        serviceId: string | Types.ObjectId
    ): Promise<AppointmentDocument[]> {
        return this.model
            .find({ serviceId, status: "scheduled" })
            .exec()
    }

    async findScheduledByCompany(
        companyId: string | Types.ObjectId
    ): Promise<any[]> {
        return this.model
            .find({ companyId, status: "scheduled" })
            .populate("serviceId")
            .sort({ date: 1 })
            .lean()
            .exec()
    }

    async setServiceInfoSnapshot(
        serviceId: string | Types.ObjectId,
        title: string
    ): Promise<void> {
        await this.model.updateMany(
            { serviceId },
            { $set: { serviceInfo: { title } } }
        )
    }

    async findHistoryPage(
        filters: FilterQuery<AppointmentDocument>,
        skip: number,
        limit: number
    ): Promise<any[]> {
        return this.model
            .find(filters)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .populate("serviceId")
            .populate("companyId")
            .lean()
            .exec()
    }

    async findPendingActionByCompany(
        companyId: string | Types.ObjectId
    ): Promise<any[]> {
        return this.model
            .find({ companyId, status: "pending_action" })
            .sort({ date: -1 })
            .populate("serviceId")
            .populate("companyId")
            .lean()
            .exec()
    }

    async findInDateRange(
        companyId: string | Types.ObjectId,
        start: Date,
        end: Date,
        extra: FilterQuery<AppointmentDocument> = {}
    ): Promise<any[]> {
        return this.model
            .find({
                companyId,
                date: { $gte: start, $lte: end },
                ...extra,
            })
            .populate("serviceId")
            .lean()
            .exec()
    }

    async countInDateRange(
        companyId: string | Types.ObjectId,
        start: Date,
        end: Date
    ): Promise<number> {
        return this.count({
            companyId,
            date: { $gte: start, $lte: end },
        } as FilterQuery<AppointmentDocument>)
    }

    async findMostPopularService(
        companyId: string | Types.ObjectId
    ): Promise<{ serviceId: Types.ObjectId; title: string; count: number } | null> {
        const result = await this.model.aggregate([
            { $match: { companyId: new Types.ObjectId(String(companyId)) } },
            { $group: { _id: "$serviceId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            {
                $lookup: {
                    from: "services",
                    localField: "_id",
                    foreignField: "_id",
                    as: "service",
                },
            },
            { $match: { "service.0": { $exists: true } } },
            { $limit: 1 },
            { $unwind: "$service" },
            { $project: { _id: 0, serviceId: "$_id", title: "$service.title", count: 1 } },
        ])

        return result[0] ?? null
    }
}
