export class PlantError extends Error {
  status: number
  details?: Record<string, unknown>
  constructor(message: string, status = 400, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.details = details
  }
}
