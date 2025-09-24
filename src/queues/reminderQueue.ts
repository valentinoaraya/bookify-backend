import { Queue } from "bullmq";
import { REDIS_HOST, REDIS_PORT } from "../config";

export const reminderQueue = new Queue("reminders", {
    connection: { host: REDIS_HOST, port: REDIS_PORT ? parseInt(REDIS_PORT) : 6379 }
});