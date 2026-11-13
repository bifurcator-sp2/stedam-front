<!-- components/Education/Ink/InkRecognizer.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useFormula } from '~/composables/useFormula'

const props = withDefaults(defineProps<{
  debounceMs?: number
}>(), {
  debounceMs: 1000,
})

const { renderFormulas } = useFormula()

const textResult = ref('')
const formulaResult = ref('')
const hasAnyResult = computed(() => !!textResult.value || !!formulaResult.value)

const isReady = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const lastMs = ref<number | null>(null)

let worker: Worker | null = null
let pendingStrokes: any[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let currentSeq = 0
let isPaused = false
let startTime = 0

onMounted(() => {
  // Используем new URL для корректной сборки воркера в Vite
  worker = new Worker(new URL('~/workers/ink.worker.ts', import.meta.url), { type: 'module' })

  worker.onmessage = (e) => {
    const { type, seq, text, formula, error: errMsg } = e.data

    if (type === 'ready') {
      isReady.value = true
      error.value = null
    }
    else if (type === 'result') {
      if (seq === currentSeq && !isPaused) {
        textResult.value = text
        formulaResult.value = formula ? renderFormulas(`$$${formula}$$`) : ''
        lastMs.value = Math.round(performance.now() - startTime)
        busy.value = false
      }
    }
    else if (type === 'error') {
      if (seq === currentSeq && !isPaused) {
        error.value = errMsg
        busy.value = false
      }
    }
  }

  worker.onerror = (err) => {
    error.value = 'Ошибка воркера: ' + err.message
    isReady.value = false
  }

  worker.postMessage({ type: 'init' })
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  worker?.terminate()
})

function scheduleRecognize(strokes: any[]) {
  pendingStrokes = strokes

  if (pendingStrokes.length === 0) {
    textResult.value = ''
    formulaResult.value = ''
    busy.value = false
    currentSeq++
    if (debounceTimer) clearTimeout(debounceTimer)
    return
  }

  if (debounceTimer) clearTimeout(debounceTimer)

  if (!isPaused && isReady.value) {
    debounceTimer = setTimeout(runRecognize, props.debounceMs)
  }
}

function runRecognize() {
  if (isPaused || !worker || !isReady.value || pendingStrokes.length === 0) return

  busy.value = true
  error.value = null
  startTime = performance.now()
  currentSeq++

  worker.postMessage({
    type: 'recognize',
    payload: [...pendingStrokes],
    seq: currentSeq
  })
}

function pause() {
  isPaused = true
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  busy.value = false
}

function resume() {
  if (!isPaused) return
  isPaused = false
  if (pendingStrokes.length > 0) {
    debounceTimer = setTimeout(runRecognize, props.debounceMs)
  }
}

function recognizeNow(strokes?: any[]) {
  if (strokes) pendingStrokes = strokes
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  if (!isPaused && isReady.value) runRecognize()
}

defineExpose({ recognizeNow, pause, resume })
</script>

<template>
  <div class="flex flex-col gap-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
    <div class="flex flex-wrap items-center gap-2 text-sm font-medium">
      <span v-if="!isReady && !error" class="text-blue-500 flex items-center gap-2">
        <UIcon name="i-lucide-loader-2" class="animate-spin size-4" />
        Инициализация ИИ (в фоне)...
      </span>
      <span v-else-if="busy" class="text-purple-500 flex items-center gap-2">
        <UIcon name="i-lucide-loader-2" class="animate-spin size-4" />
        Распознавание...
      </span>
      <span v-else-if="error" class="text-red-500">⚠️ {{ error }}</span>
      <span v-else-if="!hasAnyResult" class="text-muted">
        Напишите текст или формулу на холсте.
      </span>
      <span v-else-if="hasAnyResult" class="text-green-600 flex items-center gap-1">
        <UIcon name="i-lucide-check-circle" class="size-4" />
        Готово за {{ lastMs }} мс
      </span>
    </div>

    <div v-if="hasAnyResult" class="flex flex-col gap-2">
      <div v-if="textResult" class="p-3 bg-white rounded border border-default">
        <div class="text-xs text-muted mb-1 flex items-center gap-1 uppercase tracking-wider font-semibold">
          <UIcon name="i-lucide-type" class="size-3" /> Распознанный текст
        </div>
        <div class="text-lg font-mono whitespace-pre-wrap">{{ textResult }}</div>
      </div>

      <div v-if="formulaResult" class="p-3 bg-white rounded border border-purple-200">
        <div class="text-xs text-purple-500 mb-1 flex items-center gap-1 uppercase tracking-wider font-semibold">
          <UIcon name="i-lucide-sigma" class="size-3" /> Распознанная формула
        </div>
        <div class="prose max-w-none overflow-x-auto text-lg" v-html="formulaResult" />
      </div>
    </div>
  </div>
</template>
