/**
 * Format seconds to mm:ss.s format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`
}

/**
 * Format seconds to mm:ss format (no decimal)
 */
export function formatTimeShort(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * Parse mm:ss.s format to seconds
 */
export function parseTime(timeStr: string): number | null {
  const match = timeStr.match(/^(\d+):(\d+(?:\.\d+)?)$/)
  if (!match) return null

  const mins = parseInt(match[1], 10)
  const secs = parseFloat(match[2])

  if (isNaN(mins) || isNaN(secs) || secs >= 60) return null

  return mins * 60 + secs
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Snap value to nearest grid point
 */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}
