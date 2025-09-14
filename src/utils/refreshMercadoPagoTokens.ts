import cron from "node-cron"
import CompanyModel from "../models/Company"
import { CLIENT_ID_MP, CLIENT_SECRET_MP } from "../config"

const refreshMercadoPagoTokens = async (): Promise<void> => {
    try {
        console.log("🔄 Iniciando actualización de tokens de Mercado Pago...")

        // Buscar empresas que están próximas a vencer (dentro de los próximos 7 días)
        const sevenDaysFromNow = new Date()
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

        const companiesToUpdate = await CompanyModel.find({
            connectedWithMP: true,
            mp_refresh_token: { $exists: true, $ne: "" },
            updatedAt: { $lt: sevenDaysFromNow }
        })

        console.log(`📊 Encontradas ${companiesToUpdate.length} empresas con tokens próximos a vencer`)

        let successCount = 0
        let errorCount = 0

        for (const company of companiesToUpdate) {
            try {
                console.log(`🔄 Actualizando token para empresa: ${company.name} (${company._id})`)

                const response = await fetch('https://api.mercadopago.com/oauth/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_secret: CLIENT_SECRET_MP,
                        client_id: CLIENT_ID_MP,
                        grant_type: 'refresh_token',
                        refresh_token: company.mp_refresh_token
                    })
                });

                const data = await response.json()

                if (data.access_token) {
                    const { access_token, refresh_token } = data;

                    await CompanyModel.findByIdAndUpdate(company._id, {
                        mp_access_token: access_token,
                        mp_refresh_token: refresh_token || company.mp_refresh_token,
                        updatedAt: new Date()
                    })

                    console.log(`✅ Token actualizado exitosamente para ${company.name}`)
                    successCount++
                } else {
                    console.error(`❌ Error al actualizar token para ${company.name}:`, data)
                    errorCount++
                }

                // Pequeña pausa entre requests para evitar rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000))

            } catch (error: any) {
                console.error(`❌ Error procesando empresa ${company.name}:`, error.message)
                errorCount++
            }
        }

        console.log(`🎯 Actualización completada: ${successCount} exitosos, ${errorCount} errores`)

    } catch (error: any) {
        console.error("❌ Error en refreshMercadoPagoTokens:", error)
    }
}

export const startRefreshMercadoPagoTokens = (): void => {
    // Ejecutar todos los días a las 2:00 AM
    cron.schedule("43 21 * * *", async () => {
        console.log("⏰ Ejecutando actualización automática de tokens de Mercado Pago...")
        await refreshMercadoPagoTokens()
    })

    console.log("�� Tarea programada de actualización de tokens configurada para las 2:00 AM diarias")
}