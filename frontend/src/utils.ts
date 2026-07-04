export function formatToken(value: string): string {
  return value.replaceAll('_', ' ')
}

export function isCommandProblem(status: string): boolean {
  return status === 'failed' || status === 'aborted' || status === 'rejected'
}
