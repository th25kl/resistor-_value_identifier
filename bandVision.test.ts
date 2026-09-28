import { describe, expect, it } from 'vitest'
import { detectColorBandSequence } from './bandVision'
import { decodeResistor } from './resistorCalculator'

function makeResistorImage(bandColors = [
  [238, 205, 0],
  [75, 43, 176],
  [210, 25, 24],
  [204, 160, 35],
]) {
  const width = 200
  const height = 80
  const data = new Uint8ClampedArray(width * height * 4)
  const background = [18, 18, 18]
  const body = [232, 216, 182]
  const bands = [
    { start: 55, end: 67, color: bandColors[0] },
    { start: 82, end: 94, color: bandColors[1] },
    { start: 109, end: 121, color: bandColors[2] },
    { start: 136, end: 148, color: bandColors[3] },
  ]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = x >= 35 && x <= 165 && y >= 25 && y <= 54
        ? bands.find((band) => x >= band.start && x <= band.end)?.color ?? body
        : background
      const index = (y * width + x) * 4
      data[index] = color[0]
      data[index + 1] = color[1]
      data[index + 2] = color[2]
      data[index + 3] = 255
    }
  }

  return { data, width, height }
}

  function makeWidePhoto() {
    const width = 600
    const height = 180
    const data = new Uint8ClampedArray(width * height * 4)
    const background = [0, 0, 0]
    const body = [232, 210, 178]
    const bands = [
      { start: 190, end: 215, color: [124, 63, 15] },
      { start: 250, end: 275, color: [210, 25, 24] },
      { start: 310, end: 335, color: [238, 205, 0] },
      { start: 370, end: 395, color: [204, 160, 35] },
    ]

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let color = background
        const onBody = x >= 145 && x <= 455 && y >= 45 && y <= 135
        const onLead = (x < 145 || x > 455) && y >= 85 && y <= 96
        if (onLead) color = [190, 195, 198]
        if (onBody) color = bands.find((band) => x >= band.start && x <= band.end)?.color ?? body
        if (onBody && y >= 78 && y <= 85) color = [245, 240, 225]

        const index = (y * width + x) * 4
        data[index] = color[0]
        data[index + 1] = color[1]
        data[index + 2] = color[2]
        data[index + 3] = 255
      }
    }

    return { data, width, height }
  }

describe('detectColorBandSequence', () => {
  it('detects yellow-violet-red-gold bands on a dark background', () => {
    expect(detectColorBandSequence(makeResistorImage())).toEqual(['yellow', 'violet', 'red', 'gold'])
  })

  it('detects red-red-brown-gold bands on a dark background', () => {
    expect(detectColorBandSequence(makeResistorImage([
      [210, 25, 24],
      [210, 25, 24],
      [124, 63, 15],
      [204, 160, 35],
    ]))).toEqual(['red', 'red', 'brown', 'gold'])
  })

  it('decodes brown-red-yellow-gold as 120 kilo-ohms', () => {
    const bands = detectColorBandSequence(makeResistorImage([
      [124, 63, 15],
      [210, 25, 24],
      [238, 205, 0],
      [204, 160, 35],
    ]))

    expect(bands).toEqual(['brown', 'red', 'yellow', 'gold'])
    expect(decodeResistor(bands, '4-band')).toMatchObject({
      ohms: 120000,
      tolerance: 5,
    })
  })

    it('detects the same bands in a wide photo with leads and glare', () => {
      expect(detectColorBandSequence(makeWidePhoto())).toEqual(['brown', 'red', 'yellow', 'gold'])
    })
})