/**
 * Compatibilidad: el modelo vive en modules/appointment.
 * Otros módulos legacy siguen importando desde aquí hasta la Fase 2.
 */
export { default } from "../modules/appointment/appointment.model"
export { AppointmentModel } from "../modules/appointment/appointment.model"
