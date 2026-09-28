import { useMemo, useState } from 'react'
import './App.css'
import { detectColorBandSequence } from './bandVision'
import { decodeDetectedBands, decodeResistor, type BandType, type ResistorColor } from './resistorCalculator'

type DetectionState = {
  status: 'idle' | 'processing' | 'success' | 'warning' | 'error'
  message: string
  bands: string[]
  resistance: string
  tolerance: string
  bandEstimate: string
  confidence: number
  imageUrl: string | null
}

const colors: ResistorColor[] = [
  'black',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'grey',
  'white',
  'gold',
  'silver',
]

const colorHex: Record<ResistorColor, string> = {
  black: '#000000',
  brown: '#7c3f0f',
  red: '#d32525',
  orange: '#f59e0b',
  yellow: '#facc15',
  green: '#16a34a',
  blue: '#2563eb',
  violet: '#7c3aed',
  grey: '#6b7280',
  white: '#f8fafc',
  gold: '#d4af37',
  silver: '#cbd5e1',
}

const bandNames = ['1st band', '2nd band', '3rd band', '4th band', '5th band']

const defaultDetectionState: DetectionState = {
  status: 'idle',
  message: 'Upload a resistor image to start analysis.',
  bands: [],
  resistance: '',
  tolerance: '',
  bandEstimate: '',
  confidence: 0,
  imageUrl: null,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (value: number) => value.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function getNearestColor(hexColor: string): ResistorColor {
  const rgb = hexColor.replace('#', '')
  const r = Number.parseInt(rgb.slice(0, 2), 16)
  const g = Number.parseInt(rgb.slice(2, 4), 16)
  const b = Number.parseInt(rgb.slice(4, 6), 16)
  const brightness = (r + g + b) / 3
  const maximum = Math.max(r, g, b)
  const minimum = Math.min(r, g, b)
  const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum

  if (brightness < 52) {
    return 'black'
  }
  if (saturation < 0.14 && brightness < 155) {
    return 'grey'
  }
  if (saturation < 0.12 && brightness >= 155) {
    return 'white'
  }

  let nearestColor: ResistorColor = 'black'
  let minimumDistance = Number.POSITIVE_INFINITY

  for (const color of colors) {
    const target = colorHex[color].replace('#', '')
    const tr = Number.parseInt(target.slice(0, 2), 16)
    const tg = Number.parseInt(target.slice(2, 4), 16)
    const tb = Number.parseInt(target.slice(4, 6), 16)

    const distance = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2
    if (distance < minimumDistance) {
      minimumDistance = distance
      nearestColor = color
    }
  }

  return nearestColor
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Unable to read image file.'))
    reader.readAsDataURL(file)
  })
}

function createImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The uploaded file is not a valid image.'))
    img.src = url
  })
}

function detectResistorBandsFromImage(
  image: HTMLImageElement,
  initialCrop?: { x: number; y: number; width: number; height: number },
) {
  const canvas = document.createElement('canvas')
  const maxWidth = 1000
  const scale = Math.min(1, maxWidth / image.width)
  const width = Math.max(260, Math.round(image.width * scale))
  const height = Math.max(180, Math.round(image.height * scale))
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas is not available in this browser.')
  }

  context.drawImage(image, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)
  const pixels = imageData.data

  const cropPadding = initialCrop ? 18 : 0

  let cropX = 0
  let cropY = 0
  let cropWidth = width
  let cropHeight = height

  if (initialCrop) {
    const x = clamp(Math.round(initialCrop.x * (width / image.width)) - cropPadding, 0, width - 1)
    const y = clamp(Math.round(initialCrop.y * (height / image.height)) - cropPadding, 0, height - 1)
    const boxWidth = clamp(Math.round(initialCrop.width * (width / image.width)) + cropPadding * 2, 32, width - x)
    const boxHeight = clamp(Math.round(initialCrop.height * (height / image.height)) + cropPadding * 2, 32, height - y)

    cropX = x
    cropY = y
    cropWidth = boxWidth
    cropHeight = boxHeight
  } else {
    const cornerSamples = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
      [Math.floor(width / 2), 0],
      [Math.floor(width / 2), height - 1],
    ]

    let backgroundR = 0
    let backgroundG = 0
    let backgroundB = 0
    for (const [x, y] of cornerSamples) {
      const index = (y * width + x) * 4
      backgroundR += pixels[index]
      backgroundG += pixels[index + 1]
      backgroundB += pixels[index + 2]
    }

    const bgR = Math.round(backgroundR / cornerSamples.length)
    const bgG = Math.round(backgroundG / cornerSamples.length)
    const bgB = Math.round(backgroundB / cornerSamples.length)

    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0

    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const index = (row * width + column) * 4
        const r = pixels[index]
        const g = pixels[index + 1]
        const b = pixels[index + 2]
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)

        if (diff > 90) {
          minX = Math.min(minX, column)
          minY = Math.min(minY, row)
          maxX = Math.max(maxX, column)
          maxY = Math.max(maxY, row)
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      throw new Error('The uploaded image does not clearly show a resistor. Try a higher-contrast photo.')
    }

    const pad = Math.max(10, Math.round((maxX - minX) * 0.08))
    cropX = Math.max(0, minX - pad)
    cropY = Math.max(0, minY - pad)
    cropWidth = Math.min(width - cropX, maxX - minX + pad * 2)
    cropHeight = Math.min(height - cropY, maxY - minY + pad * 2)
  }

  const cropCanvas = document.createElement('canvas')
  cropCanvas.width = cropWidth
  cropCanvas.height = cropHeight
  const cropContext = cropCanvas.getContext('2d')
  if (!cropContext) {
    throw new Error('Canvas processing is unavailable in this browser.')
  }

  cropContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
  const cropData = cropContext.getImageData(0, 0, cropWidth, cropHeight)
  const cropPixels = cropData.data
  const visualBands = detectColorBandSequence(cropData)

  if (visualBands.length >= 4) {
    try {
      const decoded = decodeDetectedBands(visualBands)
      return {
        result: decoded.result,
        bandType: decoded.type,
        confidence: 90,
        bands: decoded.bands,
      }
    } catch {
      // Continue to the alternate image sampler if the visual sequence is ambiguous.
    }
  }

  const scoreMap: number[] = new Array(cropWidth).fill(0)
  let bestRow = Math.floor(cropHeight / 2)
  let bestRowScore = 0

  for (let row = 0; row < cropHeight; row += 1) {
    let rowScore = 0
    for (let column = 0; column < cropWidth; column += 2) {
      const index = (row * cropWidth + column) * 4
      const r = cropPixels[index]
      const g = cropPixels[index + 1]
      const b = cropPixels[index + 2]
      const maximum = Math.max(r, g, b)
      const minimum = Math.min(r, g, b)
      const brightness = (r + g + b) / 3
      const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum

      if (brightness > 105 && saturation < 0.55) {
        rowScore += 1
      }
    }

    if (rowScore > bestRowScore) {
      bestRow = row
      bestRowScore = rowScore
    }
  }

  const rowPadding = Math.max(8, Math.floor(cropHeight * 0.08))
  const midRowStart = Math.max(0, bestRow - rowPadding)
  const midRowEnd = Math.min(cropHeight - 1, bestRow + rowPadding)
  let bodyStart = 0
  let bodyEnd = cropWidth - 1
  let firstBodyColumn = cropWidth
  let lastBodyColumn = -1

  for (let column = 0; column < cropWidth; column += 1) {
    let brightPixels = 0
    for (let row = midRowStart; row <= midRowEnd; row += 1) {
      const index = (row * cropWidth + column) * 4
      const r = cropPixels[index]
      const g = cropPixels[index + 1]
      const b = cropPixels[index + 2]
      const maximum = Math.max(r, g, b)
      const minimum = Math.min(r, g, b)
      const brightness = (r + g + b) / 3
      const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum

      if (brightness > 115 && saturation < 0.72) {
        brightPixels += 1
      }
    }

    if (brightPixels >= Math.max(2, Math.floor((midRowEnd - midRowStart) * 0.25))) {
      firstBodyColumn = Math.min(firstBodyColumn, column)
      lastBodyColumn = Math.max(lastBodyColumn, column)
    }
  }

  if (lastBodyColumn - firstBodyColumn > cropWidth * 0.12) {
    bodyStart = firstBodyColumn
    bodyEnd = lastBodyColumn
  }

  for (let column = 0; column < cropWidth; column += 1) {
    if (column < bodyStart || column > bodyEnd) {
      continue
    }
    let sum = 0
    let count = 0

    for (let row = midRowStart; row <= midRowEnd; row += 1) {
      const index = (row * cropWidth + column) * 4
      const r = cropPixels[index]
      const g = cropPixels[index + 1]
      const b = cropPixels[index + 2]
      const max = Math.max(r, g, b)
      const minValue = Math.min(r, g, b)
      const saturation = max === 0 ? 0 : (max - minValue) / max
      const brightness = (r + g + b) / 3

      if (brightness > 8 && brightness < 248 && (saturation > 0.12 || brightness < 72)) {
        const darkBandBoost = brightness < 72 ? 0.3 : 0
        sum += saturation + darkBandBoost
        count += 1
      }
    }

    scoreMap[column] = count > 0 ? sum / count : 0
  }

  for (let column = 1; column < cropWidth - 1; column += 1) {
    scoreMap[column] = (scoreMap[column - 1] + scoreMap[column] + scoreMap[column + 1]) / 3
  }

  const threshold = Math.max(0.08, Math.max(...scoreMap) * 0.2)
  const groupings: Array<{ start: number; end: number; strength: number }> = []
  let start = -1
  let strength = 0

  for (let x = 0; x < cropWidth; x += 1) {
    const active = scoreMap[x] > threshold
    if (active && start === -1) {
      start = x
      strength = scoreMap[x]
    } else if (active && start !== -1) {
      strength = Math.max(strength, scoreMap[x])
    }

    if (!active && start !== -1) {
      const widthOfSegment = x - start
      if (widthOfSegment >= 3) {
        groupings.push({ start, end: x - 1, strength })
      }
      start = -1
      strength = 0
    }
  }

  if (start !== -1) {
    const widthOfSegment = cropWidth - start
    if (widthOfSegment >= 3) {
      groupings.push({ start, end: cropWidth - 1, strength })
    }
  }

  let sortedBands = groupings
    .filter((segment) => segment.end - segment.start >= 3 && segment.end - segment.start <= cropWidth * 0.35)
    .sort((a, b) => a.start - b.start)

  if (sortedBands.length < 4) {
    const minimumDistance = Math.max(8, Math.floor(cropWidth * 0.035))
    const peakCandidates: Array<{ start: number; end: number; strength: number }> = []

    for (let column = 1; column < cropWidth - 1; column += 1) {
      if (scoreMap[column] < threshold * 0.7) {
        continue
      }
      if (scoreMap[column] < scoreMap[column - 1] || scoreMap[column] < scoreMap[column + 1]) {
        continue
      }

      const nearbyPeak = peakCandidates.find((candidate) => Math.abs(candidate.start - column) < minimumDistance)
      if (nearbyPeak) {
        if (scoreMap[column] > nearbyPeak.strength) {
          nearbyPeak.start = column
          nearbyPeak.end = column
          nearbyPeak.strength = scoreMap[column]
        }
      } else {
        peakCandidates.push({ start: column, end: column, strength: scoreMap[column] })
      }
    }

    sortedBands = peakCandidates
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)
      .map((peak) => ({
        start: Math.max(0, peak.start - Math.floor(minimumDistance / 2)),
        end: Math.min(cropWidth - 1, peak.end + Math.floor(minimumDistance / 2)),
        strength: peak.strength,
      }))
      .sort((a, b) => a.start - b.start)
  }

  if (sortedBands.length < 4 && cropWidth / cropHeight > 1.5) {
    const sampleWidth = Math.max(4, Math.floor(cropWidth * 0.045))
    const sampleCenters = [0.2, 0.4, 0.6, 0.8]
    const bodyWidth = bodyEnd - bodyStart
    sortedBands = sampleCenters.map((position) => {
      const center = Math.floor(bodyStart + bodyWidth * position)
      return {
        start: Math.max(0, center - Math.floor(sampleWidth / 2)),
        end: Math.min(cropWidth - 1, center + Math.floor(sampleWidth / 2)),
        strength: scoreMap[center] ?? 0,
      }
    })
  }

  const strongest = [...sortedBands].sort((a, b) => b.strength - a.strength)
  const horizontalSampleBands = cropWidth / cropHeight > 1.5
    ? [0.2, 0.4, 0.6, 0.8].map((position) => {
        const bodyWidth = bodyEnd - bodyStart
        const center = Math.floor(bodyStart + bodyWidth * position)
        const sampleWidth = Math.max(4, Math.floor(bodyWidth * 0.055))
        return {
          start: Math.max(0, center - Math.floor(sampleWidth / 2)),
          end: Math.min(cropWidth - 1, center + Math.floor(sampleWidth / 2)),
          strength: scoreMap[center] ?? 0,
        }
      })
    : null
  const selected = (horizontalSampleBands ?? strongest.slice(0, 4)).sort((a, b) => a.start - b.start)

  if (selected.length < 4) {
    throw new Error('Unable to detect four resistor bands. Please upload a clear, horizontal resistor photo.')
  }

  const detectedColors: ResistorColor[] = []

  for (const segment of selected) {
    const xStart = Math.max(0, segment.start)
    const xEnd = Math.min(cropWidth - 1, segment.end)
    let r = 0
    let g = 0
    let b = 0
    let count = 0

    for (let column = xStart; column <= xEnd; column += 1) {
      for (let row = midRowStart; row <= midRowEnd; row += 1) {
        const index = (row * cropWidth + column) * 4
        r += cropPixels[index]
        g += cropPixels[index + 1]
        b += cropPixels[index + 2]
        count += 1
      }
    }

    if (count === 0) {
      detectedColors.push('black')
      continue
    }

    const averageHex = rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count))
    detectedColors.push(getNearestColor(averageHex))
  }

  const decoded = decodeDetectedBands(detectedColors)
  const confidence = clamp(70 + decoded.bands.length * 5, 65, 97)

  return {
    result: decoded.result,
    bandType: decoded.type,
    confidence,
    bands: decoded.bands,
  }
}

function App() {
  const [bandType, setBandType] = useState<BandType>('4-band')
  const [selectedColors, setSelectedColors] = useState<string[]>(['brown', 'black', 'red', 'gold'])
  const [imageState, setImageState] = useState<DetectionState>(defaultDetectionState)

  const decoded = useMemo(() => {
    const activeBands = bandType === '4-band' ? selectedColors.slice(0, 4) : selectedColors.slice(0, 5)
    if (activeBands.length < (bandType === '4-band' ? 4 : 5)) {
      return { ohms: 0, tolerance: 0, formatted: 'Pick complete bands' }
    }
    try {
      return decodeResistor(activeBands, bandType)
    } catch {
      return { ohms: 0, tolerance: 0, formatted: 'Invalid band combination' }
    }
  }, [selectedColors, bandType])

  const updateBand = (index: number, value: string) => {
    const updated = [...selectedColors]
    updated[index] = value
    setSelectedColors(updated)
  }

  const visibleBandCount = bandType === '4-band' ? 4 : 5

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setImageState({
      status: 'processing',
      message: 'Analyzing the resistor image…',
      bands: [],
      resistance: '',
      tolerance: '',
      bandEstimate: '',
      confidence: 0,
      imageUrl: null,
    })

    let dataUrl = ''

    try {
      dataUrl = await readFileAsDataUrl(file)
      const image = await createImageFromUrl(dataUrl)
      const { result, bandType: detectedType, confidence, bands } = detectResistorBandsFromImage(image)

      setBandType(detectedType)
      setSelectedColors(bands)

      setImageState({
        status: 'success',
        message: `Read ${detectedType} color bands directly from the image. No dataset classifier used.`,
        bands,
        resistance: result.formatted,
        tolerance: `±${result.tolerance}%`,
        bandEstimate: '',
        confidence,
        imageUrl: dataUrl,
      })
    } catch (error) {
      setImageState({
        status: 'error',
        message: error instanceof Error ? error.message : 'The resistor could not be detected. Try a clearer image.',
        bands: [],
        resistance: '',
        tolerance: '',
        bandEstimate: '',
        confidence: 0,
        imageUrl: dataUrl,
      })
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <header className="header-row">
          <div>
            <p className="eyebrow">ECE Project</p>
            <h1>Resistor Value Identifier</h1>
          </div>
          <div className="toggle-group" aria-label="Resistor band type">
            <button
              type="button"
              className={bandType === '4-band' ? 'active' : ''}
              onClick={() => setBandType('4-band')}
            >
              4-band
            </button>
            <button
              type="button"
              className={bandType === '5-band' ? 'active' : ''}
              onClick={() => setBandType('5-band')}
            >
              5-band
            </button>
          </div>
        </header>

        <div className="two-column-layout">
          <section className="calculator-panel">
            <div className="section-heading">
              <h2>Manual Calculator</h2>
              <span>Fallback mode</span>
            </div>

            <div className="resistor-card">
              <div className="resistor-body">
                <span className="wire left" />
                <span className="wire right" />
                {Array.from({ length: visibleBandCount }).map((_, index) => (
                  <div key={index} className="band-slot">
                    <select
                      value={selectedColors[index] ?? colors[0]}
                      onChange={(event) => updateBand(index, event.target.value)}
                    >
                      {colors.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="info-grid">
              <div className="card">
                <h3>Band Selection</h3>
                <div className="band-list">
                  {Array.from({ length: visibleBandCount }).map((_, index) => (
                    <label key={index} className="band-field">
                      <span>{bandNames[index]}</span>
                      <select
                        value={selectedColors[index] ?? colors[0]}
                        onChange={(event) => updateBand(index, event.target.value)}
                      >
                        {colors.map((color) => (
                          <option key={color} value={color}>
                            {color}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="card result-card">
                <h3>Decoded Value</h3>
                <div className="result-box">
                  <p className="result-label">Resistance</p>
                  <p className="result-value">{decoded.formatted}</p>
                </div>
                <ul className="result-details">
                  <li>
                    <span>Ohms</span>
                    <strong>{decoded.ohms} Ω</strong>
                  </li>
                  <li>
                    <span>Tolerance</span>
                    <strong>±{decoded.tolerance}%</strong>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="ai-panel">
            <div className="section-heading">
              <h2>Photo Value Reader</h2>
              <span>Color-band mode</span>
            </div>

            <label className="upload-box" htmlFor="resistor-upload">
              <input id="resistor-upload" type="file" accept="image/*" onChange={handleImageUpload} />
              <span>Upload resistor photo</span>
            </label>

            {imageState.imageUrl ? (
              <div className="image-preview-wrap">
                <img src={imageState.imageUrl} alt="Uploaded resistor" className="uploaded-image" />
              </div>
            ) : (
              <div className="placeholder-image">No image uploaded yet</div>
            )}

            <div className={`status-panel ${imageState.status}`}>
              <div className="status-header">
                <span className="status-dot" />
                <strong>{imageState.status === 'success' ? 'Detection successful' : imageState.status === 'warning' ? 'Check detection' : imageState.status === 'error' ? 'Detection failed' : imageState.status === 'processing' ? 'Analyzing' : 'Waiting for input'}</strong>
              </div>
              <p>{imageState.message}</p>
              {imageState.confidence > 0 && (
                <div className="confidence-row">
                  <span>Confidence</span>
                  <strong>{imageState.confidence}%</strong>
                </div>
              )}
            </div>

            <div className="detected-output">
              <h3>Detected color bands</h3>
              {imageState.bands.length > 0 ? (
                <div className="band-pills">
                  {imageState.bands.map((band, index) => (
                    <span key={`${band}-${index}`} className="band-pill" style={{ background: colorHex[band as ResistorColor] }}>
                      {band}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="empty-text">No bands detected yet.</p>
              )}
            </div>

            <div className="result-summary-card">
              <div>
                <span>Resistance</span>
                <strong>{imageState.resistance || '—'}</strong>
              </div>
              <div>
                <span>Tolerance</span>
                <strong>{imageState.tolerance || '—'}</strong>
              </div>
              {imageState.bandEstimate && (
                <div>
                  <span>Color-band check</span>
                  <strong>{imageState.bandEstimate}</strong>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
