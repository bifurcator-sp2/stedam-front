// app/workers/ink.worker.ts

// ★ ПОЛИФИЛЛ ДЛЯ WORKER: Добавляем заглушку document, чтобы ppu-paddle-ocr не падал
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return new OffscreenCanvas(1, 1)
      return {}
    }
  }
}

import { InferenceEngine, preprocessStrokes, isStrokeMeaningful, loadVocab } from 'ink-on/core'
import { PaddleOcrService, V5_CYRILLIC_MOBILE_MODEL } from 'ppu-paddle-ocr/web'

let formulaEngine: InferenceEngine | null = null
let formulaVocab: any = null
let textEngine: any = null
let modelsLoaded = false
let currentSeq = 0

// В воркере нельзя использовать import.meta.env.BASE_URL, поэтому
// жестко прописываем путь или передаем его из компонента
const ASSET_BASE = '/app/'

async function initModels() {
  try {
    // 1. Инициализация ink-on (формулы)
    formulaVocab = await loadVocab(`${ASSET_BASE}models/comer/vocab.json`)
    formulaEngine = new InferenceEngine({
      encoderUrl: `${ASSET_BASE}models/comer/encoder_int8.onnx`,
      decoderUrl: `${ASSET_BASE}models/comer/decoder_int8.onnx`,
      beamWidth: 3,
      executionProvider: 'wasm',
    })
    await formulaEngine.init()

    // 2. Инициализация ppu-paddle-ocr (текст)
    const service = new PaddleOcrService({ model: V5_CYRILLIC_MOBILE_MODEL })
    await service.initialize()
    textEngine = service

    modelsLoaded = true
    self.postMessage({ type: 'ready' })
  } catch (e: any) {
    console.error('Worker init error:', e)
    self.postMessage({ type: 'error', error: e.message })
  }
}

function strokesToImage(strokes: any[]): OffscreenCanvas {
  const canvas = new OffscreenCanvas(1000, 250)
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1000, 250)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of strokes) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
    }
  }

  const drawWidth = maxX - minX
  const drawHeight = maxY - minY
  const scale = Math.min((1000 - 100) / (drawWidth || 1), (250 - 100) / (drawHeight || 1), 5)
  const offsetX = (1000 - drawWidth * scale) / 2 - minX * scale
  const offsetY = (250 - drawHeight * scale) / 2 - minY * scale

  for (const s of strokes) {
    const points = s.points
    if (points.length < 1) continue

    if (s.eraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = (s.size || 30) * scale
      ctx.strokeStyle = '#000'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.lineWidth = 6
      ctx.strokeStyle = '#000000'
    }

    if (points.length === 1) {
      ctx.beginPath()
      ctx.arc(points[0].x * scale + offsetX, points[0].y * scale + offsetY, ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(points[0].x * scale + offsetX, points[0].y * scale + offsetY)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * scale + offsetX, points[i].y * scale + offsetY)
      }
      ctx.stroke()
    }
  }
  return canvas
}

function isFormulaValid(latex: string): boolean {
  if (!latex || latex.trim().length === 0) return false
  const clean = latex.trim()
  const cyrillicMatches = clean.match(/[а-яА-ЯёЁ]/g)
  if (cyrillicMatches && cyrillicMatches.length > 2) return false
  if (/^\\?[a-zA-Z]+$/.test(clean)) return false
  const hasMathOp = /[0-9=+\-*/^_{}\\\[\]()]/.test(clean) ||
    /\\frac|\\sqrt|\\sum|\\int|\\lim|\\alpha|\\beta|\\pi|\\theta/.test(clean)
  return hasMathOp && clean.length < 40
}

self.onmessage = async (e) => {
  const { type, payload, seq } = e.data

  if (type === 'init') {
    if (!modelsLoaded) initModels()
    return
  }

  if (type === 'recognize') {
    currentSeq = seq

    if (!modelsLoaded || !payload || payload.length === 0) {
      self.postMessage({ type: 'result', seq, text: '', formula: '' })
      return
    }

    let textResult = ''
    let formulaResult = ''

    try {
      if (textEngine) {
        const canvas = strokesToImage(payload)
        // ppu-paddle-ocr может вернуть Promise
        const result = await textEngine.recognize(canvas)
        if (currentSeq !== seq) return
        textResult = result?.text || ''
      }

      if (formulaEngine && formulaVocab && isStrokeMeaningful(payload)) {
        const input = preprocessStrokes(payload)
        const res = await formulaEngine.recognize(input, formulaVocab, { mode: 'auto' })
        if (currentSeq !== seq) return
        if (res.latex && isFormulaValid(res.latex)) {
          formulaResult = res.latex
        }
      }

      self.postMessage({ type: 'result', seq, text: textResult, formula: formulaResult })
    } catch (err: any) {
      self.postMessage({ type: 'error', seq, error: err.message })
    }
  }
}
