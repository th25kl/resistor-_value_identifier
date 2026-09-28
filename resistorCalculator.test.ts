import { describe, expect, it } from 'vitest'
import { decodeDetectedBands, decodeResistor } from './resistorCalculator'

describe('decodeResistor', () => {
  it('decodes a 4-band resistor correctly', () => {
    expect(decodeResistor(['brown', 'black', 'red', 'gold'], '4-band')).toEqual({
      ohms: 1000,
      tolerance: 5,
      formatted: '1 kΩ ±5%',
    })
  })

  it('decodes the red-red-brown-gold photo as 220 ohms', () => {
    expect(decodeResistor(['red', 'red', 'brown', 'gold'], '4-band').ohms).toBe(220)
  })

  it('decodes the yellow-violet-red-gold photo as 4.7 kilo-ohms', () => {
    expect(decodeResistor(['yellow', 'violet', 'red', 'gold'], '4-band').ohms).toBe(4700)
  })

  it('decodes a 5-band resistor correctly', () => {
    expect(decodeResistor(['red', 'violet', 'green', 'brown', 'gold'], '5-band')).toEqual({
      ohms: 2750,
      tolerance: 5,
      formatted: '2.75 kΩ ±5%',
    })
  })

  it('rejects gold or silver in significant digit positions', () => {
    expect(() => decodeResistor(['gold', 'brown', 'red', 'gold'], '4-band')).toThrow()
    expect(() => decodeResistor(['silver', 'brown', 'red', 'black', 'gold'], '5-band')).toThrow()
  })

  it('corrects an adjacent gold/yellow image-sampling swap', () => {
    const result = decodeDetectedBands(['brown', 'red', 'gold', 'yellow'])

    expect(result.bands).toEqual(['brown', 'red', 'yellow', 'gold'])
    expect(result.result.ohms).toBe(120000)
    expect(result.result.tolerance).toBe(5)
  })

  it('recognizes the presentation image colors even when stripe samples are out of order', () => {
    const result = decodeDetectedBands(['brown', 'gold', 'red', 'yellow'])

    expect(result.bands).toEqual(['brown', 'red', 'yellow', 'gold'])
    expect(result.result.formatted).toBe('120 kΩ ±5%')
  })
})
