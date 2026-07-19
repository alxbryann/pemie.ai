// Errores de la capa de servicios, mapeables a HTTP por la interfaz REST.
// Los servicios lanzan ServiceError; el REST los traduce a status + json.

export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export const badRequest = (m: string, code?: string) => new ServiceError(400, m, code);
export const unauthorized = (m = "No autenticado") => new ServiceError(401, m, "unauthorized");
export const forbidden = (m = "Sin permiso") => new ServiceError(403, m, "forbidden");
export const notFound = (m = "No encontrado") => new ServiceError(404, m, "not_found");
export const conflict = (m: string, code?: string) => new ServiceError(409, m, code);
