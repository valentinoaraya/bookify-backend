/**
 * Compatibilidad: middlewares de auth ahora viven en composition (AuthService).
 * Las rutas legacy siguen importando desde aquí.
 */
export {
    authenticateTokenCompany,
    authenticateRefreshTokenCompany,
} from "../composition"
