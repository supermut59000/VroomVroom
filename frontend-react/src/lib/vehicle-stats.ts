export function shouldFetchIndividualStats(
  batch: Record<string, unknown> | undefined,
  vehicleId: number | null,
): boolean {
  return vehicleId !== null && (!batch || !(String(vehicleId) in batch))
}
