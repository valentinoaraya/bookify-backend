import {
    Document,
    FilterQuery,
    Model,
    UpdateQuery,
    Types,
} from "mongoose"

export class BaseRepository<T extends Document> {
    constructor(protected readonly model: Model<T>) {}

    async findById(id: string | Types.ObjectId, lean = false): Promise<T | null> {
        const query = this.model.findById(id)
        if (lean) {
            return query.lean<T>().exec() as Promise<T | null>
        }
        return query.exec()
    }

    async findOne(filter: FilterQuery<T>, lean = false): Promise<T | null> {
        const query = this.model.findOne(filter)
        if (lean) {
            return query.lean<T>().exec() as Promise<T | null>
        }
        return query.exec()
    }

    async find(filter: FilterQuery<T> = {}, lean = false): Promise<T[]> {
        const query = this.model.find(filter)
        if (lean) {
            return query.lean<T[]>().exec() as Promise<T[]>
        }
        return query.exec()
    }

    async create(data: Partial<T>): Promise<T> {
        const doc = new this.model(data)
        return doc.save()
    }

    async updateById(
        id: string | Types.ObjectId,
        update: UpdateQuery<T>,
        lean = false
    ): Promise<T | null> {
        const query = this.model.findByIdAndUpdate(id, update, { new: true })
        if (lean) {
            return query.lean<T>().exec() as Promise<T | null>
        }
        return query.exec()
    }

    async deleteById(id: string | Types.ObjectId): Promise<T | null> {
        return this.model.findByIdAndDelete(id).exec()
    }

    async exists(filter: FilterQuery<T>): Promise<boolean> {
        const result = await this.model.exists(filter)
        return result !== null
    }

    async count(filter: FilterQuery<T> = {}): Promise<number> {
        return this.model.countDocuments(filter).exec()
    }
}
