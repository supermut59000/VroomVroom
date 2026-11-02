// ApiError — shared by the remote transport (api.ts) and the local transport
// (local-api.ts). Moved out of api.ts to avoid a circular import.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
