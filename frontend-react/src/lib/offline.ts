export const isPermanentQueueStatus = (status: number) =>
  [400, 404, 409, 422].includes(status)
