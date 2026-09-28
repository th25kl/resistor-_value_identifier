import { describe, expect, it } from 'vitest'
import { normalizeDetectorResult } from './detector'

describe('normalizeDetectorResult', () => {
  it('keeps the highest-confidence resistor box and exposes the crop bounds', () => {
    const result = normalizeDetectorResult({
      detections: [
        { classId: 12, confidence: 0.44, box: { x1: 60, y1: 130, x2: 260, y2: 280 } },
        { classId: 27, confidence: 0.91, box: { x1: 150, y1: 111, x2: 520, y2: 250 } },
      ],
      sourceWidth: 800,
      sourceHeight: 400,
    })

    expect(result.available).toBe(true)
    expect(result.crop.x).toBe(150)
    expect(result.crop.y).toBe(111)
    expect(result.crop.width).toBe(370)
    expect(result.crop.height).toBe(139)
    expect(result.confidence).toBeGreaterThan(0.9)
  })

  it('returns unavailable when no valid detection is present', () => {
    const result = normalizeDetectorResult({
      detections: [{ classId: 0, confidence: 0.1, box: { x1: 10, y1: 10, x2: 20, y2: 20 } }],
      sourceWidth: 800,
      sourceHeight: 400,
    })

    expect(result.available).toBe(false)
  })
})
