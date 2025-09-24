import { reminderQueue } from "./reminderQueue";

(async () => {
    try {
        console.log("🗑 Limpiando cola de recordatorios...");

        await reminderQueue.drain();

        await reminderQueue.clean(0, 0, "completed");
        await reminderQueue.clean(0, 0, "failed");

        await reminderQueue.obliterate({ force: true });

        console.log("✅ Cola de recordatorios reiniciada");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error limpiando la cola:", err);
        process.exit(1);
    }
})();