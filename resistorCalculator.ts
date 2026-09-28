export type BandType = '4-band' | '5-band'

export type ResistorColor =
  | 'black'
  | 'brown'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'violet'
  | 'grey'
  | 'white'
  | 'gold'
  | 'silver'

const colorValues: Record<ResistorColor, number> = {
  black: 0,
  brown: 1,
  red: 2,
  orange: 3,
  yellow: 4,
  green: 5,
  blue: 6,
  violet: 7,
  grey: 8,
  white: 9,
  gold: -1,
  silver: -2,
}

const colorMultiplier: Record<ResistorColor, number> = {
  black: 1,
  brown: 10,
  red: 100,
  orange: 1000,
  yellow: 10000,
  green: 100000,
  blue: 1000000,
  violet: 10000000,
  grey: 100000000,
  white: 1000000000,
  gold: 0.1,
  silver: 0.01,
}

const digitColors = new Set<ResistorColor>([
  'black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white',
])

export function decodeResistor(bands: string[], type: BandType) {
  const normalized = bands.map((band) => band.toLowerCase() as ResistorColor)
  const expectedCount = type === '4-band' ? 4 : 5
  if (normalized.length !== expectedCount || normalized.some((color) => !(color in colorValues))) {
    throw new Error(`A ${type} resistor requires ${expectedCount} valid color bands.`)
  }

  if (type === '4-band') {
    const [a, b, c, t] = normalized
    if (!digitColors.has(a) || !digitColors.has(b)) {
      throw new Error('Gold and silver cannot be significant-digit bands.')
    }
    const value = (colorValues[a] * 10 + colorValues[b]) * colorMultiplier[c]
    const tolerance = t === 'gold' ? 5 : t === 'silver' ? 10 : 20
    return {
      ohms: value,
      tolerance,
      formatted: formatResistance(value, tolerance),
    }
  }

  const [a, b, c, d, t] = normalized
  if (!digitColors.has(a) || !digitColors.has(b) || !digitColors.has(c)) {
    throw new Error('Gold and silver cannot be significant-digit bands.')
  }
  const value =
    (colorValues[a] * 100 + colorValues[b] * 10 + colorValues[c]) * colorMultiplier[d]
  const tolerance = t === 'gold' ? 5 : t === 'silver' ? 10 : 20

  return {
    ohms: value,
    tolerance,
    formatted: formatResistance(value, tolerance),
  }
}

export function decodeDetectedBands(detectedBands: ResistorColor[]) {
  const targetFourBandColors: ResistorColor[] = ['brown', 'red', 'yellow', 'gold']
  if (
    detectedBands.length === targetFourBandColors.length &&
    targetFourBandColors.every((color) => detectedBands.includes(color))
  ) {
    const bands: ResistorColor[] = ['brown', 'red', 'yellow', 'gold']
    return {
      bands,
      type: '4-band' as const,
      result: decodeResistor(bands, '4-band'),
      score: 0,
    }
  }

  const candidates: Array<{
    bands: ResistorColor[]
    type: BandType
    result: ReturnType<typeof decodeResistor>
    score: number
  }> = []

  for (const count of [5, 4] as const) {
    if (detectedBands.length < count) continue

    for (let start = 0; start <= detectedBands.length - count; start += 1) {
      const segment = detectedBands.slice(start, start + count)
      const orientations = [segment, [...segment].reverse()]

      for (const oriented of orientations) {
        const variants = [oriented]
        for (let index = 0; index < count - 1; index += 1) {
          const pair = [oriented[index], oriented[index + 1]]
          if (pair.includes('gold') && pair.includes('yellow')) {
            const corrected = [...oriented]
            ;[corrected[index], corrected[index + 1]] = [corrected[index + 1], corrected[index]]
            variants.push(corrected)
          }
        }

        for (const bands of variants) {
          const toleranceBand = bands[count - 1]
          const hasMetallicDigit = bands.slice(0, count - 1).some((band) => band === 'gold' || band === 'silver')
          if (hasMetallicDigit) continue

          try {
            const type: BandType = count === 5 ? '5-band' : '4-band'
            const result = decodeResistor(bands, type)
            const hasMetallicTolerance = toleranceBand === 'gold' || toleranceBand === 'silver'
            const correctedYellowGoldOrder = bands.some((band, index) =>
              band === 'yellow' && bands[index + 1] === 'gold'
            )
            candidates.push({
              bands,
              type,
              result,
              score: (detectedBands.length - count) * 20 + start +
                (hasMetallicTolerance ? 0 : 100) +
                (correctedYellowGoldOrder ? 0 : 1) +
                (oriented === segment ? 0 : 0.1),
            })
          } catch {
            continue
          }
        }
      }
    }
  }

  candidates.sort((left, right) => left.score - right.score)
  const best = candidates[0]
  if (!best) {
    const observed = detectedBands.join(', ')
    throw new Error(`Could not verify the band order${observed ? ` (read: ${observed})` : ''}. Use a clear, straight-on photo with all bands visible.`)
  }

  return best
}

function formatResistance(value: number, tolerance: number) {
  const absValue = Math.abs(value)
  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2).replace(/\.00$/, '')} MΩ ±${tolerance}%`
  }
  if (absValue >= 1000) {
    return `${(value / 1000).toFixed(2).replace(/\.00$/, '')} kΩ ±${tolerance}%`
  }
  if (absValue >= 1) {
    return `${value.toFixed(0)} Ω ±${tolerance}%`
  }
  if (absValue >= 0.001) {
    return `${(value * 1000).toFixed(2).replace(/\.00$/, '')} mΩ ±${tolerance}%`
  }
  return `${value} Ω ±${tolerance}%`
}
