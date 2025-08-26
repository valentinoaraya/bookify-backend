# Implementación de Turnos Pendientes - COMPLETADA ✅

## Descripción
Esta funcionalidad permite marcar temporalmente los turnos como "pendientes de pago" cuando un usuario inicia el proceso de checkout con Mercado Pago. Los turnos permanecen bloqueados por 15 minutos, tiempo suficiente para que se procese el pago o expire la reserva.

## Funcionalidades Implementadas

### ✅ **1. Sistema de Turnos Pendientes**
- Campo `pendingAppointments` en el modelo Service
- Bloqueo automático de turnos por 15 minutos
- Limpieza automática cada 5 minutos

### ✅ **2. Verificación de Disponibilidad en Webhook**
- Verificación de que el turno no esté ocupado antes de confirmar
- Prevención de doble reserva del mismo turno
- Validación en tiempo real del estado del turno

### ✅ **3. Reembolso Automático**
- Reembolso completo si el turno ya no está disponible
- Email informativo al usuario sobre el reembolso
- Logs detallados del proceso de reembolso

### ✅ **4. Gestión de Estado**
- Remoción automática de `pendingAppointments` cuando se confirma
- Manejo robusto de errores y casos edge
- Logs informativos para debugging

## Cambios Implementados

### 1. Modelo de Service
- Agregado campo `pendingAppointments` que contiene:
  - `datetime`: Fecha y hora del turno
  - `expiresAt`: Fecha de expiración (15 minutos desde la creación)
  - `userId`: Identificador del usuario que inició el pago

### 2. Tipos TypeScript
- Nueva interfaz `PendingAppointment`
- Actualizada `ServiceWithAppointments` para incluir `pendingAppointments`

### 3. Funciones Utilitarias (`managePendingAppointments.ts`)
- `markAppointmentAsPending()`: Marca un turno como pendiente
- `cleanupExpiredPendingAppointments()`: Limpia turnos expirados
- `isAppointmentAvailable()`: Verifica disponibilidad considerando turnos pendientes
- `removePendingAppointment()`: Remueve turno confirmado de pendientes
- `startCleanupPendingAppointments()`: Job programado que se ejecuta cada 5 minutos

### 4. Controlador de Mercado Pago
- Modificada función `createPreference` para marcar turno como pendiente antes de crear la preferencia
- Validación de que el turno se pueda marcar como pendiente

### 5. Webhook de Confirmación
- Verificación de disponibilidad antes de confirmar turno
- Reembolso automático si el turno ya no está disponible
- Remoción automática de `pendingAppointments` al confirmar
- Email específico para casos de reembolso

### 6. Emails
- Nuevo email `emailRefundAppointmentUser` para informar reembolsos
- Comunicación clara sobre el estado del turno y reembolso

### 7. Job Programado
- Limpieza automática de turnos pendientes expirados cada 5 minutos
- Integrado en el servidor principal

## Flujo Completo de Funcionamiento

### **Fase 1: Inicio del Pago**
1. Usuario hace clic en "Ir al Checkout"
2. Se ejecuta `createPreference`
3. Turno se marca como "pendiente" por 15 minutos
4. Se crea la preferencia de Mercado Pago
5. Usuario es redirigido al checkout

### **Fase 2: Procesamiento del Pago**
1. Durante los 15 minutos:
   - Turno está bloqueado para otros usuarios
   - Si el usuario paga → webhook se envía
   - Si no paga → expira automáticamente

### **Fase 3: Confirmación del Webhook**
1. Webhook llega con pago aprobado
2. **Verificación de disponibilidad:**
   - Si el turno está disponible → se confirma
   - Si el turno ya está ocupado → reembolso automático
3. **Si se confirma:**
   - Turno se crea en la base de datos
   - Se remueve de `pendingAppointments`
   - Se envía email de confirmación
4. **Si se hace reembolso:**
   - Se procesa reembolso completo
   - Se envía email informando del reembolso
   - Turno permanece disponible para otros usuarios

### **Fase 4: Limpieza Automática**
1. Job programado limpia turnos expirados cada 5 minutos
2. Turnos no pagados vuelven a estar disponibles

## Instrucciones de Implementación

### Paso 1: Ejecutar Migración
```bash
npm run migrate:pending
```

### Paso 2: Reiniciar el Servidor
```bash
npm run dev
```

## Casos de Uso Manejados

### **Caso 1: Pago Exitoso - Turno Disponible**
- ✅ Turno se confirma correctamente
- ✅ Se remueve de `pendingAppointments`
- ✅ Usuario recibe email de confirmación

### **Caso 2: Pago Exitoso - Turno No Disponible**
- ✅ Se detecta conflicto automáticamente
- ✅ Se procesa reembolso completo
- ✅ Usuario recibe email informando del reembolso
- ✅ Turno permanece disponible para otros usuarios

### **Caso 3: Usuario No Paga**
- ✅ Turno expira automáticamente en 15 minutos
- ✅ Se libera automáticamente para otros usuarios
- ✅ Limpieza automática cada 5 minutos

### **Caso 4: Usuario Paga Después de Expirar**
- ✅ Webhook detecta que el turno ya no está disponible
- ✅ Se procesa reembolso automático
- ✅ Se evita doble reserva del mismo turno

## Ventajas de la Implementación

1. **Prevención de Conflictos**: Evita que dos usuarios reserven el mismo turno
2. **Experiencia del Usuario**: Comunicación clara sobre el estado del turno
3. **Gestión Automática**: No requiere intervención manual para casos edge
4. **Reembolso Automático**: Procesa reembolsos sin intervención humana
5. **Logs Detallados**: Facilita debugging y monitoreo
6. **Escalabilidad**: Sistema robusto que maneja múltiples usuarios simultáneos

## Monitoreo y Debugging

### **Logs Importantes**
- `⚠️  Turno no disponible para [email]. Procesando reembolso...`
- `✅ Reembolso procesado para [email]`
- `✅ Turno confirmado para [email] y removido de pendingAppointments`
- `⏳ Ejecutando limpieza de turnos pendientes expirados...`

### **Verificación de Estado**
- Revisar campo `pendingAppointments` en la base de datos
- Monitorear logs del servidor para casos de reembolso
- Verificar que los turnos expirados se limpien automáticamente

## Consideraciones de Seguridad

- **Validación de Datos**: Todos los inputs del webhook son validados
- **Manejo de Errores**: Errores son capturados y loggeados apropiadamente
- **Reembolso Seguro**: Solo se procesan reembolsos para pagos confirmados
- **Prevención de Duplicados**: Sistema robusto contra doble confirmación

## Testing Recomendado

1. **Flujo Normal**: Usuario paga y turno se confirma
2. **Flujo de Reembolso**: Usuario paga pero turno ya no está disponible
3. **Flujo de Expiración**: Usuario no paga y turno expira
4. **Múltiples Usuarios**: Varios usuarios intentando reservar el mismo turno
5. **Webhook Retrasado**: Webhook llega después de que el turno expira

## Próximas Mejoras (Opcionales)

1. **Notificaciones Push**: Alertas en tiempo real para cambios de estado
2. **Dashboard de Monitoreo**: Interfaz para ver turnos pendientes y expirados
3. **Métricas**: Estadísticas de confirmaciones vs reembolsos
4. **Configuración de Tiempos**: Permitir ajustar tiempo de expiración por empresa
5. **Retry de Webhooks**: Reintentos automáticos para webhooks fallidos 