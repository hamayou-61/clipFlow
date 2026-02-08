import { describe, it, expect } from 'vitest'
import { formatTime, formatTimeShort, parseTime, clamp, snapToGrid } from './format'

describe('formatTime', () => {
  it('formats 0 seconds', () => {
    expect(formatTime(0)).toBe('00:00.0')
  })

  it('formats seconds with decimal', () => {
    expect(formatTime(5.5)).toBe('00:05.5')
  })

  it('formats minutes and seconds', () => {
    expect(formatTime(65.3)).toBe('01:05.3')
  })

  it('formats large values', () => {
    expect(formatTime(600)).toBe('10:00.0')
  })
})

describe('formatTimeShort', () => {
  it('formats 0 seconds', () => {
    expect(formatTimeShort(0)).toBe('00:00')
  })

  it('truncates decimal', () => {
    expect(formatTimeShort(5.9)).toBe('00:05')
  })

  it('formats minutes and seconds', () => {
    expect(formatTimeShort(125)).toBe('02:05')
  })
})

describe('parseTime', () => {
  it('parses mm:ss format', () => {
    expect(parseTime('01:30')).toBe(90)
  })

  it('parses mm:ss.s format', () => {
    expect(parseTime('00:05.5')).toBe(5.5)
  })

  it('returns null for invalid format', () => {
    expect(parseTime('invalid')).toBeNull()
  })

  it('returns null for seconds >= 60', () => {
    expect(parseTime('01:60')).toBeNull()
  })

  it('parses 00:00', () => {
    expect(parseTime('00:00')).toBe(0)
  })
})

describe('clamp', () => {
  it('returns value when in range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it('handles equal min and max', () => {
    expect(clamp(5, 3, 3)).toBe(3)
  })
})

describe('snapToGrid', () => {
  it('snaps to nearest grid point', () => {
    expect(snapToGrid(2.3, 0.5)).toBe(2.5)
  })

  it('snaps down when closer to lower grid point', () => {
    expect(snapToGrid(2.1, 0.5)).toBe(2.0)
  })

  it('snaps to exact grid point', () => {
    expect(snapToGrid(3.0, 0.5)).toBe(3.0)
  })

  it('works with grid size 1', () => {
    expect(snapToGrid(2.7, 1)).toBe(3)
  })
})
