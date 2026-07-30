/**
 * Neutraliza los metacaracteres de una búsqueda del usuario antes de usarla en
 * un `$regex` de Mongo. Sin esto, un texto como `(a+)+$` se ejecuta como patrón
 * y puede bloquear la base.
 */
export const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
