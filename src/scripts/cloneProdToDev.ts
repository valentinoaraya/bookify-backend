/**
 * Clona bookifydb → bookifydb-dev en el mismo cluster Atlas (vía $out).
 * Uso: npm run clone:dev-db
 *
 * NO modifica producción. Reemplaza el contenido de bookifydb-dev.
 */
import dotenv from "dotenv"
import { MongoClient } from "mongodb"

dotenv.config()

const SOURCE_DB = "bookifydb"
const TARGET_DB = "bookifydb-dev"

function buildUri(hint: string, dbName: string): string {
    const cleaned = hint.replace(/^"|"$/g, "")
    const [pathPart, ...queryParts] = cleaned.split("?")
    const query = queryParts.length ? `?${queryParts.join("?")}` : ""
    const base = pathPart.replace(/\/[^/?]*$/, `/${dbName}`)
    return `${base}${query}`
}

async function main() {
    const connectionHint =
        process.env.MONGODB_CLONE_URI || process.env.MONGODB_URL_CONNECTION

    if (!connectionHint) {
        throw new Error("Definí MONGODB_URL_CONNECTION o MONGODB_CLONE_URI")
    }

    // Conectar al cluster usando la DB de origen
    const uri = buildUri(
        connectionHint.replace(/bookifydb-dev/, SOURCE_DB),
        SOURCE_DB
    )

    console.log(`📦 Clonando ${SOURCE_DB} → ${TARGET_DB}...`)

    const client = new MongoClient(uri)

    try {
        await client.connect()
        const sourceDb = client.db(SOURCE_DB)

        const collections = await sourceDb.listCollections().toArray()
        if (collections.length === 0) {
            console.log("⚠️  La DB de origen no tiene colecciones.")
            return
        }

        for (const { name } of collections) {
            if (name.startsWith("system.")) continue

            const count = await sourceDb.collection(name).countDocuments()

            // $out escribe la colección completa en la DB destino (reemplaza si existe)
            await sourceDb
                .collection(name)
                .aggregate([
                    { $match: {} },
                    { $out: { db: TARGET_DB, coll: name } },
                ])
                .toArray()

            console.log(`  ✓ ${name}: ${count} docs`)
        }

        console.log("✅ Clonado completo. Desarrollo usa bookifydb-dev.")
    } finally {
        await client.close()
    }
}

main().catch((err) => {
    console.error("❌ Error clonando DB:", err)
    process.exit(1)
})
