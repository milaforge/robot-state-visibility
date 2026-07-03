export type TelemetryState = 'live' | 'delayed' | 'stale'

export function classifyTelemetry(ageMs: number): TelemetryState {
  if (ageMs >= 1000) return 'stale'
  if (ageMs > 500) return 'delayed'
  return 'live'
}
