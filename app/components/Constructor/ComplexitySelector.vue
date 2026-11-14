<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  readonly?: boolean
  compact?: boolean
}>(), {
  readonly: false,
  compact: false
})

/**
 * Управление сложностью задания.
 * Наружу — float 0..1, внутри — уровень + число 1..50.
 *
 * Градация и диапазоны — в `app/utils/complexity.ts` (COMPLEXITY_LEVELS).
 */
const model = defineModel<number | null>({ default: null })

const MIN_N = 1

const level = ref<ComplexityLevelKey>(COMPLEXITY_LEVELS[0].key)
const n = ref<number>(1)
const isInternalChange = ref(false)

const levels = COMPLEXITY_LEVELS

const hasValue = computed(() => model.value != null && Number.isFinite(Number(model.value)))
// Уровень берём из выбранной кнопки, а не из model, чтобы UI не «прыгал»,
// пока число ещё не выровнялось под диапазон нового уровня.
const currentDef = computed(() => levels.find(l => l.key === level.value) ?? levels[0])
const currentFloat = computed(() => complexityFromSlider(n.value))
const sliderPercent = computed(() => ((n.value - MIN_N) / (MAX_COMPLEXITY_N - MIN_N)) * 100)

function clampN(v: number): number {
  if (!Number.isFinite(v)) return MIN_N
  return Math.max(MIN_N, Math.min(MAX_COMPLEXITY_N, Math.round(v)))
}

watch(model, (v) => {
  if (isInternalChange.value) return
  level.value = complexityLevel(v).key
  n.value = complexitySliderValue(v)
}, { immediate: true })

watch([level, n], () => {
  if (props.readonly) return
  // Если уровень сменили, а число не влезает в его диапазон — ставим верхнюю границу
  const def = levels.find(l => l.key === level.value) ?? levels[0]
  const ratio = clampN(n.value) / MAX_COMPLEXITY_N
  if (ratio <= def.min || ratio > def.max) {
    const nextN = clampN(def.max * MAX_COMPLEXITY_N)
    if (nextN !== n.value) {
      n.value = nextN
      return
    }
  }

  const next = currentFloat.value
  if (next === model.value) return
  isInternalChange.value = true
  model.value = next
  queueMicrotask(() => {
    isInternalChange.value = false
  })
})

function setLevel(key: ComplexityLevelKey) {
  if (props.readonly) return
  level.value = key
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
  'background': `linear-gradient(to right,
    ${currentDef.value.hex} 0%,
    ${currentDef.value.hex} ${sliderPercent.value}%,
    var(--ui-bg-elevated, #f1f5f9) ${sliderPercent.value}%,
    var(--ui-bg-elevated, #f1f5f9) 100%)`,
  '--_slider-color': currentDef.value.hex
}))

const compactTitle = computed(() =>
  hasValue.value
    ? `Сложность: ${currentDef.value.label} · ${n.value}/${MAX_COMPLEXITY_N} (${currentFloat.value.toFixed(3)})`
    : 'Сложность не задана'
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
      <UIcon
        :name="currentDef.icon"
        class="size-3.5 shrink-0"
        :class="currentDef.text"
      />
      <span
        class="font-medium leading-none"
        :class="currentDef.text"
      >{{ currentDef.label }}</span>
      <span class="font-mono tabular-nums leading-none">{{ n }}</span>
    </template>
    <template v-else>
      <UIcon
        name="i-lucide-gauge"
        class="size-3.5 shrink-0 opacity-60"
      />
      <span class="opacity-60">—</span>
    </template>
  </span>

  <!-- ==================== COMPACT (editable, не используется) ==================== -->
  <span
    v-else-if="compact"
    class="inline-flex items-center gap-1.5"
    :title="compactTitle"
  >
    <UIcon
      :name="currentDef.icon"
      class="size-3.5 shrink-0"
      :class="currentDef.text"
    />
    <span
      class="font-medium leading-none"
      :class="currentDef.text"
    >{{ currentDef.label }}</span>
    <span class="font-mono tabular-nums leading-none">{{ n }}</span>
  </span>

  <!-- ==================== FULL ==================== -->
  <div
    v-else
    class="flex flex-col gap-3"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        <UIcon
          name="i-lucide-gauge"
          class="size-3.5 text-(--ui-primary)"
        />
        Сложность
      </span>
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-default bg-elevated px-2 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums text-highlighted"
        :title="`Числовое значение: ${currentFloat}`"
      >
        <span
          class="size-1.5 rounded-full"
          :style="{ backgroundColor: currentDef.hex }"
        />
        {{ currentFloat.toFixed(3) }}
      </span>
    </div>

    <div
      class="grid gap-1.5"
      :style="{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }"
      role="radiogroup"
      aria-label="Уровень сложности"
    >
      <button
        v-for="lvl in levels"
        :key="lvl.key"
        type="button"
        role="radio"
        :aria-checked="level === lvl.key"
        :disabled="readonly"
        class="flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-all"
        :class="[
          level === lvl.key
            ? `${lvl.badge} shadow-sm`
            : 'border-default bg-default text-muted',
          readonly ? 'cursor-default' : 'hover:bg-elevated'
        ]"
        @click="setLevel(lvl.key)"
      >
        <UIcon
          :name="lvl.icon"
          class="size-4 shrink-0"
        />
        <span class="text-[11px] font-semibold leading-tight">{{ lvl.label }}</span>
      </button>
    </div>

    <div class="flex items-center gap-2.5">
      <input
        type="range"
        :min="MIN_N"
        :max="MAX_COMPLEXITY_N"
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
      >
      <input
        type="number"
        :min="MIN_N"
        :max="MAX_COMPLEXITY_N"
        :value="n"
        inputmode="numeric"
        :disabled="readonly"
        class="h-7 w-14 shrink-0 rounded-md border border-default bg-default px-1.5 text-center font-mono text-xs font-semibold text-highlighted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        :class="readonly ? 'cursor-default opacity-80' : ''"
        aria-label="Числовое значение сложности"
        @input="onInputNumber"
      >
    </div>
  </div>
</template>
