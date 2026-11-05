<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  readonly?: boolean
  compact?: boolean
}>(), {
  readonly: false,
  compact: false,
})

/**
 * Управление сложностью задания.
 * Наружу — float 0..1, внутри — уровень + число 1..50.
 *
 *   Общий       : 0.000 .. 0.300
 *   Продвинутый : 0.300 .. 0.600
 *   Олимпиадный : 0.600 .. 1.000
 */
const model = defineModel<number | null>({ default: null })

type Level = 'general' | 'advanced' | 'olympiad'

interface LevelDef {
  key: Level
  label: string
  min: number
  max: number
  icon: string
  color: string
  bg: string
  sliderColor: string
}

const LEVELS: LevelDef[] = [
  { key: 'general',   label: 'Базовый',        min: 0,   max: 0.3, icon: 'i-lucide-book-open', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', sliderColor: '#10b981' },
  { key: 'advanced',  label: 'Продвинутый',  min: 0.3, max: 0.6, icon: 'i-lucide-zap',       color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-500/10',   sliderColor: '#f59e0b' },
  { key: 'olympiad',  label: 'Сложный',  min: 0.6, max: 1.0, icon: 'i-lucide-trophy',    color: 'text-rose-600 dark:text-rose-400',     bg: 'bg-rose-500/10',    sliderColor: '#f43f5e' },
]

const MIN_N = 1
const MAX_N = 50

const level = ref<Level>('general')
const n = ref<number>(1)
const isInternalChange = ref(false)

const currentDef = computed(() => LEVELS.find(l => l.key === level.value)!)
const currentFloat = computed(() => toFloat(level.value, n.value))
const sliderPercent = computed(() => ((n.value - 1) / (MAX_N - 1)) * 100)
const hasValue = computed(() => model.value != null && Number.isFinite(Number(model.value)))

function clampN(v: number): number {
  if (!Number.isFinite(v)) return MIN_N
  return Math.max(MIN_N, Math.min(MAX_N, Math.round(v)))
}

function toFloat(lvl: Level, num: number): number {
  const def = LEVELS.find(l => l.key === lvl)!
  const ratio = clampN(num) / MAX_N
  const raw = def.min + (def.max - def.min) * ratio
  return +raw.toFixed(3)
}

function fromFloat(v: number | null | undefined): { level: Level; n: number } {
  if (v == null || !Number.isFinite(Number(v))) return { level: 'general', n: 1 }

  const val = Math.max(0, Math.min(1, Number(v)))

  if (val <= 0.3) {
    const num = val === 0 ? 1 : Math.round((val / 0.3) * MAX_N)
    return { level: 'general', n: clampN(num) }
  }
  if (val <= 0.6) {
    const num = Math.round(((val - 0.3) / 0.3) * MAX_N)
    return { level: 'advanced', n: clampN(num) }
  }
  const num = Math.round(((val - 0.6) / 0.4) * MAX_N)
  return { level: 'olympiad', n: clampN(num) }
}

watch(model, (v) => {
  if (isInternalChange.value) return
  const { level: l, n: num } = fromFloat(v)
  level.value = l
  n.value = num
}, { immediate: true })

watch([level, n], () => {
  if (props.readonly) return
  const next = toFloat(level.value, n.value)
  if (next === model.value) return
  isInternalChange.value = true
  model.value = next
  queueMicrotask(() => { isInternalChange.value = false })
})

function setLevel(l: Level) {
  if (props.readonly) return
  level.value = l
}

function onInputNumber(e: Event) {
  if (props.readonly) return
  const t = e.target as HTMLInputElement
  n.value = clampN(Number(t.value))
  t.value = String(n.value)
}

function onSliderInput(e: Event) {
  if (props.readonly) return
  const t = e.target as HTMLInputElement
  n.value = clampN(Number(t.value))
}

const trackStyle = computed(() => ({
  background: `linear-gradient(to right,
    ${currentDef.value.sliderColor} 0%,
    ${currentDef.value.sliderColor} ${sliderPercent.value}%,
    var(--ui-bg-elevated, #f1f5f9) ${sliderPercent.value}%,
    var(--ui-bg-elevated, #f1f5f9) 100%)`,
  '--_slider-color': currentDef.value.sliderColor,
}))

const compactTitle = computed(() =>
  hasValue.value
    ? `Сложность: ${currentDef.value.label} · ${n.value}/50 (${currentFloat.value.toFixed(3)})`
    : 'Сложность не задана',
)
</script>

<template>
  <!-- ==================== COMPACT READONLY ==================== -->
  <span
    v-if="readonly && compact"
    class="inline-flex items-center gap-1.5"
    :title="compactTitle"
  >
    <template v-if="hasValue">
      <UIcon :name="currentDef.icon" class="size-3.5 shrink-0" :class="currentDef.color" />
      <span class="font-medium leading-none" :class="currentDef.color">{{ currentDef.label }}</span>
      <span class="font-mono tabular-nums leading-none">{{ n }}</span>
    </template>
    <template v-else>
      <UIcon name="i-lucide-gauge" class="size-3.5 shrink-0 opacity-60" />
      <span class="opacity-60">—</span>
    </template>
  </span>

  <!-- ==================== COMPACT (editable, не используется) ==================== -->
  <span
    v-else-if="compact"
    class="inline-flex items-center gap-1.5"
    :title="compactTitle"
  >
    <UIcon :name="currentDef.icon" class="size-3.5 shrink-0" :class="currentDef.color" />
    <span class="font-medium leading-none" :class="currentDef.color">{{ currentDef.label }}</span>
    <span class="font-mono tabular-nums leading-none">{{ n }}</span>
  </span>

  <!-- ==================== FULL ==================== -->
  <div v-else class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        <UIcon name="i-lucide-gauge" class="size-3.5 text-(--ui-primary)" />
        Сложность
      </span>
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-default bg-elevated px-2 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums text-highlighted"
        :title="`Числовое значение: ${currentFloat}`"
      >
        <span
          class="size-1.5 rounded-full"
          :style="{ backgroundColor: currentDef.sliderColor }"
        />
        {{ currentFloat.toFixed(3) }}
      </span>
    </div>

    <div class="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Уровень сложности">
      <button
        v-for="lvl in LEVELS"
        :key="lvl.key"
        type="button"
        role="radio"
        :aria-checked="level === lvl.key"
        :disabled="readonly"
        class="flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-all"
        :class="[
          level === lvl.key
            ? `${lvl.bg} ${lvl.color} border-current shadow-sm`
            : 'border-default bg-default text-muted',
          readonly ? 'cursor-default' : 'hover:bg-elevated',
        ]"
        @click="setLevel(lvl.key)"
      >
        <UIcon :name="lvl.icon" class="size-4 shrink-0" />
        <span class="text-[11px] font-semibold leading-tight">{{ lvl.label }}</span>
      </button>
    </div>

    <div class="flex items-center gap-2.5">
      <input
        type="range"
        :min="MIN_N"
        :max="MAX_N"
        :value="n"
        :style="trackStyle"
        :disabled="readonly"
        class="h-1.5 flex-1 appearance-none rounded-full outline-none
               [&::-webkit-slider-thumb]:appearance-none
               [&::-webkit-slider-thumb]:h-4
               [&::-webkit-slider-thumb]:w-4
               [&::-webkit-slider-thumb]:rounded-full
               [&::-webkit-slider-thumb]:border-2
               [&::-webkit-slider-thumb]:border-[var(--ui-bg,#fff)]
               [&::-webkit-slider-thumb]:bg-[var(--_slider-color)]
               [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.15)]
               [&::-webkit-slider-thumb]:transition-transform
               [&::-webkit-slider-thumb]:cursor-pointer
               [&::-moz-range-thumb]:h-4
               [&::-moz-range-thumb]:w-4
               [&::-moz-range-thumb]:rounded-full
               [&::-moz-range-thumb]:border-2
               [&::-moz-range-thumb]:border-[var(--ui-bg,#fff)]
               [&::-moz-range-thumb]:bg-[var(--_slider-color)]
               [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.15)]
               [&::-moz-range-track]:bg-transparent
               focus-visible:ring-2
               focus-visible:ring-[var(--_slider-color)]
               focus-visible:ring-offset-2"
        :class="readonly ? 'cursor-default opacity-80' : 'cursor-pointer'"
        :aria-label="`Значение сложности внутри уровня «${currentDef.label}»`"
        @input="onSliderInput"
      />
      <input
        type="number"
        :min="MIN_N"
        :max="MAX_N"
        :value="n"
        inputmode="numeric"
        :disabled="readonly"
        class="h-7 w-14 shrink-0 rounded-md border border-default bg-default px-1.5 text-center font-mono text-xs font-semibold text-highlighted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        :class="readonly ? 'cursor-default opacity-80' : ''"
        aria-label="Числовое значение сложности"
        @input="onInputNumber"
      />
    </div>
  </div>
</template>
