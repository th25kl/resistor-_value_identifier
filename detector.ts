export type DetectorBox = {
  x1: number
  y1: number
  x2: number
  y2: number
}

export type DetectorDetection = {
  classId: number
  confidence: number
  box: DetectorBox
}

export type DetectorResultInput = {
  detections: DetectorDetection[]
  sourceWidth: number
  sourceHeight: number
}

export type NormalizedDetectorResult = {
  available: boolean
  confidence: number
  classId: number | null
  crop: {
    x: number
    y: number
    width: number
    height: number
  }
  label: string | null
}

const DETECTOR_CLASS_LABELS = [
  '1.2k ohms',
  '1.5k ohms',
  '1.8k ohms',
  '10 ohms',
  '100 ohms',
  '100k ohms',
  '100k ohms 5 bands',
  '10k ohms',
  '120 ohms',
  '12k ohms',
  '15 ohms',
  '150 ohms',
  '15k ohms',
  '180 ohms',
  '18k ohms',
  '1k ohms',
  '2.2k ohms',
  '2.2k ohms 5 bands',
  '2.7k ohms',
  '200 ohms 5 bands',
  '22 ohms 5 bands',
  '220 ohms',
  '22k ohms',
  '270 ohms',
  '27k ohms',
  '3.3k ohms',
  '3.9k ohms',
  '300k ohms 5 bands',
  '33 ohms',
  '330 ohms',
  '33k ohms',
  '390 ohms',
  '39k ohms',
  '4.7 ohms',
  '4.7k ohms',
  '4.7k ohms 5 bands',
  '47 ohms',
  '470 ohms',
  '470k ohms 5 bands',
  '47k ohms',
  '47k ohms 5 bands',
  '5.1k ohms 5 bands',
  '5.6 ohms',
  '5.6k ohms',
  '51k ohms 5 bands',
  '56 ohms',
  '560 ohms',
  '56k ohms',
  '58 ohms',
  '6.8k ohms',
  '680 ohms',
  '68k ohms',
  '8.2k ohms',
  '82 ohms',
  '820 ohms',
  'busted',
]

const MIN_CONFIDENCE = 0.35

export function normalizeDetectorResult(input: DetectorResultInput): NormalizedDetectorResult {
  const validDetections = input.detections.filter((detection) => {
    if (detection.confidence < MIN_CONFIDENCE) {
      return false
    }

    const width = detection.box.x2 - detection.box.x1
    const height = detection.box.y2 - detection.box.y1
    return width > 10 && height > 10 && width < input.sourceWidth && height < input.sourceHeight
  })

  if (validDetections.length === 0) {
    return {
      available: false,
      confidence: 0,
      classId: null,
      crop: { x: 0, y: 0, width: 0, height: 0 },
      label: null,
    }
  }

  const best = validDetections.reduce((current, candidate) =>
    candidate.confidence > current.confidence ? candidate : current
  )

  const x = Math.max(0, Math.round(best.box.x1))
  const y = Math.max(0, Math.round(best.box.y1))
  const width = Math.max(1, Math.round(best.box.x2 - best.box.x1))
  const height = Math.max(1, Math.round(best.box.y2 - best.box.y1))

  return {
    available: true,
    confidence: Number(best.confidence.toFixed(3)),
    classId: best.classId,
    crop: { x, y, width, height },
    label: DETECTOR_CLASS_LABELS[best.classId] ?? null,
  }
}
