import { Types } from "mongoose"
import { CompanyLocation, CompanyLocationSnapshot } from "./company.types"

export function formatLocationAddress(
    location: Pick<CompanyLocation, "street" | "number" | "city">
): string {
    const street = String(location.street ?? "").trim()
    const number = String(location.number ?? "").trim()
    const city = String(location.city ?? "").trim()
    return [street, number].filter(Boolean).join(" ") + (city ? `, ${city}` : "")
}

export function toLocationSnapshot(
    location: CompanyLocation
): CompanyLocationSnapshot {
    return {
        locationId: location._id,
        name: location.name,
        province: location.province,
        city: location.city,
        street: location.street,
        number: location.number,
    }
}

/** Si la empresa no tiene sedes pero sí dirección legacy, crea la sede principal. */
export function buildLocationsFromLegacy(company: {
    province?: string
    city?: string
    street?: string
    number?: string
    locations?: CompanyLocation[]
}): CompanyLocation[] | null {
    if (company.locations && company.locations.length > 0) {
        return null
    }

    const city = String(company.city ?? "").trim()
    const street = String(company.street ?? "").trim()
    const number = String(company.number ?? "").trim()
    if (!city && !street && !number) {
        return null
    }

    return [
        {
            _id: new Types.ObjectId(),
            name: "Sede principal",
            province: company.province?.trim() || undefined,
            city: city || "Sin ciudad",
            street: street || "Sin calle",
            number: number || "S/N",
            isDefault: true,
        },
    ]
}

export function syncLegacyAddressFromDefault(locations: CompanyLocation[]): {
    province?: string
    city: string
    street: string
    number: string
} | null {
    const defaultLocation =
        locations.find((l) => l.isDefault) ?? locations[0] ?? null
    if (!defaultLocation) return null
    return {
        province: defaultLocation.province,
        city: defaultLocation.city,
        street: defaultLocation.street,
        number: defaultLocation.number,
    }
}

export function findLocationById(
    locations: CompanyLocation[] | undefined,
    locationId: string | Types.ObjectId | undefined | null
): CompanyLocation | null {
    if (!locations?.length || !locationId) return null
    const id = String(locationId)
    return locations.find((l) => String(l._id) === id) ?? null
}

export function getDefaultLocation(
    locations: CompanyLocation[] | undefined
): CompanyLocation | null {
    if (!locations?.length) return null
    return locations.find((l) => l.isDefault) ?? locations[0]
}

/**
 * Resuelve la sede de un turno presencial.
 * - Si hay locationId, debe pertenecer al servicio (o a la empresa si el servicio no tiene lista).
 * - Si el servicio no tiene locationIds (legacy), se usa la sede por defecto.
 * - Si el servicio tiene exactamente una, se usa esa.
 * - Si tiene varias y no hay locationId, retorna null (el caller debe exigir selección).
 */
export function resolveBookingLocation(params: {
    locations: CompanyLocation[]
    serviceLocationIds?: Types.ObjectId[] | string[]
    locationId?: string | null
    mode: string
}): CompanyLocation | null {
    const { locations, serviceLocationIds, locationId, mode } = params
    if (mode !== "in-person") return null
    if (!locations.length) return null

    const hasServiceLocations =
        Array.isArray(serviceLocationIds) && serviceLocationIds.length > 0

    const allowedIds = hasServiceLocations
        ? serviceLocationIds!.map(String)
        : (() => {
              const def = getDefaultLocation(locations)
              return def ? [String(def._id)] : [String(locations[0]._id)]
          })()

    if (locationId) {
        const id = String(locationId)
        if (!allowedIds.includes(id)) {
            return null
        }
        return findLocationById(locations, id)
    }

    if (allowedIds.length === 1) {
        return findLocationById(locations, allowedIds[0])
    }

    return null
}
