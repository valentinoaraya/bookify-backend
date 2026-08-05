import { Types, UpdateQuery } from "mongoose"
import { BaseRepository } from "../../shared/base/base.repository"
import { ValidationError } from "../../shared/errors"
import { FREE_UPGRADE_MARKER } from "../../utils/planRules"
import SubscriptionModel from "./subscription.model"
import {
    SubscriptionApiShape,
    SubscriptionDocument,
    SubscriptionInput,
    SubscriptionPlan,
    SubscriptionStatus,
} from "./subscription.types"

type TransitionExtra = Partial<{
    status: SubscriptionStatus
    startDate: Date
    nextPaymentDate: string
    mpPreapprovalId: string
    plan: SubscriptionPlan
    pendingPlan: SubscriptionPlan
    previousPreapprovalId: string
    transitionStartedAt: Date
}>

export class SubscriptionRepository extends BaseRepository<SubscriptionDocument> {
    constructor() {
        super(SubscriptionModel)
    }

    async findByCompanyId(
        companyId: string | Types.ObjectId
    ): Promise<SubscriptionDocument | null> {
        return this.findOne({ companyId }, true)
    }

    async findByMpPreapprovalId(
        mpPreapprovalId: string
    ): Promise<SubscriptionDocument | null> {
        return this.findOne({ mpPreapprovalId }, true)
    }

    async createForCompany(data: SubscriptionInput): Promise<SubscriptionDocument> {
        return this.create({
            companyId: new Types.ObjectId(String(data.companyId)),
            mpPreapprovalId: data.mpPreapprovalId,
            plan: data.plan,
            pendingPlan: data.pendingPlan ?? undefined,
            status: data.status,
            startDate: data.startDate,
            nextPaymentDate: data.nextPaymentDate,
            previousPreapprovalId: data.previousPreapprovalId ?? undefined,
            transitionStartedAt: data.transitionStartedAt ?? undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as Partial<SubscriptionDocument>)
    }

    async upsertForCompany(data: SubscriptionInput): Promise<SubscriptionDocument> {
        const existing = await this.findByCompanyId(data.companyId)
        if (existing) {
            const $set: Record<string, unknown> = {
                plan: data.plan,
                status: data.status,
                updatedAt: new Date(),
            }
            const $unset: Record<string, 1> = {}

            if (data.mpPreapprovalId !== undefined) {
                $set.mpPreapprovalId = data.mpPreapprovalId
            }
            if (data.startDate !== undefined) {
                $set.startDate = data.startDate
            }
            if (data.nextPaymentDate !== undefined) {
                $set.nextPaymentDate = data.nextPaymentDate
            }

            if (data.previousPreapprovalId === null) {
                $unset.previousPreapprovalId = 1
            } else if (data.previousPreapprovalId !== undefined) {
                $set.previousPreapprovalId = data.previousPreapprovalId
            }

            if (data.pendingPlan === null) {
                $unset.pendingPlan = 1
            } else if (data.pendingPlan !== undefined) {
                $set.pendingPlan = data.pendingPlan
            }

            if (data.transitionStartedAt === null) {
                $unset.transitionStartedAt = 1
            } else if (data.transitionStartedAt !== undefined) {
                $set.transitionStartedAt = data.transitionStartedAt
            }

            const update: UpdateQuery<SubscriptionDocument> = { $set }
            if (Object.keys($unset).length > 0) {
                update.$unset = $unset
            }

            const updated = await this.updateById(existing._id, update)
            return updated as SubscriptionDocument
        }
        return this.createForCompany(data)
    }

    async updateStatus(
        companyId: string | Types.ObjectId,
        status: SubscriptionStatus,
        extra: TransitionExtra = {}
    ): Promise<SubscriptionDocument | null> {
        const sub = await this.findByCompanyId(companyId)
        if (!sub) return null
        return this.updateById(sub._id, {
            $set: {
                status,
                ...extra,
                updatedAt: new Date(),
            },
        })
    }

    /**
     * Transición atómica: solo actualiza si el status actual es `fromStatus`.
     */
    async beginTransition(
        companyId: string | Types.ObjectId,
        fromStatus: SubscriptionStatus,
        toStatus: SubscriptionStatus,
        extra: TransitionExtra = {}
    ): Promise<SubscriptionDocument> {
        const updated = await this.model
            .findOneAndUpdate(
                { companyId, status: fromStatus },
                {
                    $set: {
                        status: toStatus,
                        ...extra,
                        updatedAt: new Date(),
                    },
                },
                { new: true }
            )
            .exec()

        if (!updated) {
            throw new ValidationError(
                `Transición de suscripción inválida o concurrente: se esperaba ${fromStatus} → ${toStatus}`
            )
        }
        return updated
    }

    async clearTransitionFields(
        companyId: string | Types.ObjectId,
        extra: TransitionExtra = {}
    ): Promise<SubscriptionDocument | null> {
        const sub = await this.findByCompanyId(companyId)
        if (!sub) return null
        return this.updateById(sub._id, {
            $set: {
                ...extra,
                updatedAt: new Date(),
            },
            $unset: {
                pendingPlan: 1,
                previousPreapprovalId: 1,
                transitionStartedAt: 1,
            },
        })
    }

    /**
     * Abort atómico de upgrade: solo gana si sigue `upgrading` con ese preapproval nuevo.
     */
    async claimAbortUpgrade(
        companyId: string | Types.ObjectId,
        newPreapprovalId: string,
        previousPreapprovalId: string
    ): Promise<SubscriptionDocument | null> {
        return this.model
            .findOneAndUpdate(
                {
                    companyId,
                    status: "upgrading",
                    mpPreapprovalId: newPreapprovalId,
                    previousPreapprovalId,
                },
                {
                    $set: {
                        status: "active",
                        mpPreapprovalId: previousPreapprovalId,
                        updatedAt: new Date(),
                    },
                    $unset: {
                        pendingPlan: 1,
                        previousPreapprovalId: 1,
                        transitionStartedAt: 1,
                    },
                },
                { new: true }
            )
            .exec()
    }

    /**
     * Abort de upgrade iniciado desde plan free: limpia el PreApproval nuevo.
     */
    async claimAbortFreeUpgrade(
        companyId: string | Types.ObjectId,
        newPreapprovalId: string
    ): Promise<SubscriptionDocument | null> {
        return this.model
            .findOneAndUpdate(
                {
                    companyId,
                    status: "upgrading",
                    mpPreapprovalId: newPreapprovalId,
                    previousPreapprovalId: FREE_UPGRADE_MARKER,
                },
                {
                    $set: {
                        status: "active",
                        updatedAt: new Date(),
                    },
                    $unset: {
                        mpPreapprovalId: 1,
                        pendingPlan: 1,
                        previousPreapprovalId: 1,
                        transitionStartedAt: 1,
                        nextPaymentDate: 1,
                    },
                },
                { new: true }
            )
            .exec()
    }

    async unsetMpPreapproval(
        companyId: string | Types.ObjectId
    ): Promise<SubscriptionDocument | null> {
        const sub = await this.findByCompanyId(companyId)
        if (!sub) return null
        return this.updateById(sub._id, {
            $unset: {
                mpPreapprovalId: 1,
                nextPaymentDate: 1,
            },
            $set: { updatedAt: new Date() },
        })
    }

    /**
     * Confirma upgrade authorized de forma atómica (evita carrera con abort).
     */
    async claimAuthorizedUpgrade(
        companyId: string | Types.ObjectId,
        newPreapprovalId: string,
        plan: SubscriptionPlan,
        nextPaymentDate?: string
    ): Promise<SubscriptionDocument | null> {
        return this.model
            .findOneAndUpdate(
                {
                    companyId,
                    status: "upgrading",
                    mpPreapprovalId: newPreapprovalId,
                },
                {
                    $set: {
                        status: "active",
                        plan,
                        mpPreapprovalId: newPreapprovalId,
                        startDate: new Date(),
                        ...(nextPaymentDate !== undefined
                            ? { nextPaymentDate }
                            : {}),
                        updatedAt: new Date(),
                    },
                    $unset: {
                        pendingPlan: 1,
                        previousPreapprovalId: 1,
                        transitionStartedAt: 1,
                    },
                },
                { new: true }
            )
            .exec()
    }

    /**
     * Confirma pending → active solo si el preapproval coincide.
     */
    async claimAuthorizedPending(
        companyId: string | Types.ObjectId,
        preapprovalId: string,
        nextPaymentDate?: string
    ): Promise<SubscriptionDocument | null> {
        return this.model
            .findOneAndUpdate(
                {
                    companyId,
                    status: "pending",
                    mpPreapprovalId: preapprovalId,
                },
                {
                    $set: {
                        status: "active",
                        startDate: new Date(),
                        ...(nextPaymentDate !== undefined
                            ? { nextPaymentDate }
                            : {}),
                        updatedAt: new Date(),
                    },
                },
                { new: true }
            )
            .exec()
    }

    /**
     * Swap atómico del preapproval nuevo durante resumeUpgrade.
     */
    async claimResumeUpgradeSwap(
        companyId: string | Types.ObjectId,
        expectedCurrentPreapprovalId: string,
        nextPreapprovalId: string,
        previousPreapprovalId: string,
        pendingPlan: SubscriptionPlan
    ): Promise<SubscriptionDocument | null> {
        return this.model
            .findOneAndUpdate(
                {
                    companyId,
                    status: "upgrading",
                    mpPreapprovalId: expectedCurrentPreapprovalId,
                    previousPreapprovalId,
                    pendingPlan,
                },
                {
                    $set: {
                        mpPreapprovalId: nextPreapprovalId,
                        transitionStartedAt: new Date(),
                        updatedAt: new Date(),
                    },
                },
                { new: true }
            )
            .exec()
    }

    async findPendingOlderThan(cutoff: Date): Promise<SubscriptionDocument[]> {
        return this.model
            .find({
                status: "pending",
                $or: [
                    { startDate: { $lte: cutoff } },
                    { startDate: { $exists: false }, createdAt: { $lte: cutoff } },
                ],
            })
            .exec()
    }

    async findUpgradingOlderThan(cutoff: Date): Promise<SubscriptionDocument[]> {
        return this.model
            .find({
                status: "upgrading",
                $or: [
                    { transitionStartedAt: { $lte: cutoff } },
                    {
                        transitionStartedAt: { $exists: false },
                        updatedAt: { $lte: cutoff },
                    },
                ],
            })
            .exec()
    }

    async findStaleByStatus(
        status: Extract<SubscriptionStatus, "downgrading" | "cancelling">,
        cutoff: Date
    ): Promise<SubscriptionDocument[]> {
        return this.model
            .find({
                status,
                $or: [
                    { transitionStartedAt: { $lte: cutoff } },
                    {
                        transitionStartedAt: { $exists: false },
                        updatedAt: { $lte: cutoff },
                    },
                ],
            })
            .exec()
    }

    static toApiShape(
        sub: SubscriptionDocument | Record<string, any> | null | undefined
    ): SubscriptionApiShape | null {
        if (!sub) return null
        return {
            id: String(sub._id ?? sub.id),
            plan: sub.plan,
            pendingPlan: sub.pendingPlan,
            status: sub.status,
            mpPreapprovalId: sub.mpPreapprovalId,
            startDate: sub.startDate,
            nextPaymentDate: sub.nextPaymentDate,
        }
    }
}
