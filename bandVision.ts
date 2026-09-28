import type { ResistorColor } from './resistorCalculator'

type PixelImage = {
  data: Uint8ClampedArray
  width: number
  height: number
}

type Range = { start: number; end: number }

function getPixelColor(data: Uint8ClampedArray, index: number): ResistorColor | null {
  const red = data[index]
  const green = data[index + 1]
  const blue = data[index + 2]
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const value = maximum / 255
  const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum

  if (saturation < 0.42) {
    if (value < 0.18) return 'black'
    if (saturation < 0.1 && value > 0.88) return 'white'
    if (saturation < 0.16 && value > 0.55) return 'silver'
    return null
  }

  const redNorm = red / 255
  const greenNorm = green / 255
  const blueNorm = blue / 255
  const delta = (maximum - minimum) / 255
  let hue = 0

  if (maximum === red) {
    hue = 60 * (((greenNorm - blueNorm) / delta) % 6)
  } else if (maximum === green) {
    hue = 60 * ((blueNorm - redNorm) / delta + 2)
  } else {
    hue = 60 * ((redNorm - greenNorm) / delta + 4)
  }
  hue = (hue + 360) % 360

  if (hue < 10 || hue >= 350) return 'red'
  if (hue < 35) return value < 0.62 ? 'brown' : 'orange'
  if (hue < 49) return 'gold'
  if (hue < 75) return 'yellow'
  if (hue < 165) return 'green'
  if (hue < 235) return 'blue'
  return 'violet'
}

function longestRange(mask: boolean[], allowedGap: number): Range | null {
  let best: Range | null = null
  let start = -1
  let lastActive = -1

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) {
      if (start === -1) start = index
      lastActive = index
      continue
    }

    if (start !== -1 && index - lastActive > allowedGap) {
      const candidate = { start, end: lastActive }
      if (!best || candidate.end - candidate.start > best.end - best.start) best = candidate
      start = -1
      lastActive = -1
    }
  }

  if (start !== -1) {
    const candidate = { start, end: lastActive }
    if (!best || candidate.end - candidate.start > best.end - best.start) best = candidate
  }

  return best
}

export function detectColorBandSequence(image: PixelImage): ResistorColor[] {
  const { data, width, height } = image
  if (width < 80 || height < 30) return []

  const brightRowThreshold = Math.max(8, Math.floor(height * 0.09))
  const bodyColumns = Array.from({ length: width }, (_, x) => {
    let brightRows = 0
    for (let y = 0; y < height; y += 1) {
      const index = (y * width + x) * 4
      if ((data[index] + data[index + 1] + data[index + 2]) / 3 > 50) brightRows += 1
    }
    return brightRows >= brightRowThreshold
  })

  const body = longestRange(bodyColumns, 4)
  if (!body || body.end - body.start < width * 0.16) return []

  const bodyWidth = body.end - body.start + 1
  const rowThreshold = Math.max(4, Math.floor(bodyWidth * 0.24))
  const bodyRows = Array.from({ length: height }, (_, y) => {
    let brightColumns = 0
    for (let x = body.start; x <= body.end; x += 1) {
      const index = (y * width + x) * 4
      if ((data[index] + data[index + 1] + data[index + 2]) / 3 > 100) brightColumns += 1
    }
    return brightColumns >= rowThreshold
  })

  const verticalBody = longestRange(bodyRows, 3)
  if (!verticalBody || verticalBody.end - verticalBody.start < height * 0.08) return []

  const top = verticalBody.start + Math.floor((verticalBody.end - verticalBody.start) * 0.12)
  const bottom = verticalBody.end - Math.floor((verticalBody.end - verticalBody.start) * 0.12)
  const left = body.start + Math.floor(bodyWidth * 0.06)
  const right = body.end - Math.floor(bodyWidth * 0.06)
  const sampleHeight = bottom - top + 1
  const columnColors: Array<ResistorColor | null> = []

  for (let x = left; x <= right; x += 1) {
    const votes = new Map<ResistorColor, number>()
    for (let y = top; y <= bottom; y += 1) {
      const color = getPixelColor(data, (y * width + x) * 4)
      if (color) votes.set(color, (votes.get(color) ?? 0) + 1)
    }

    const [color, count] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    columnColors.push(color && count >= sampleHeight * 0.34 ? color : null)
  }

  for (let index = 1; index < columnColors.length - 1; index += 1) {
    if (columnColors[index] === null && columnColors[index - 1] && columnColors[index - 1] === columnColors[index + 1]) {
      columnColors[index] = columnColors[index - 1]
    }
  }

  const minimumBandWidth = Math.max(2, Math.floor(bodyWidth * 0.012))
  const bands: ResistorColor[] = []
  let currentColor: ResistorColor | null = null
  let runLength = 0

  const saveBand = () => {
    if (currentColor && runLength >= minimumBandWidth && runLength <= bodyWidth * 0.22) {
      bands.push(currentColor)
    }
  }

  for (const color of columnColors) {
    if (color === currentColor && color !== null) {
      runLength += 1
      continue
    }
    saveBand()
    currentColor = color
    runLength = color ? 1 : 0
  }
  saveBand()

  return bands.length === 4 || bands.length === 5 ? bands : []
}