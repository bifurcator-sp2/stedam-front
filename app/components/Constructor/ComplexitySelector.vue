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
 * Наружу — float 0..1, внутри — уровень + позиция ползунка 0..100
 * внутри диапазона выбранного уровня.
 *
 * Градация и диапазоны — в `app/utils/complexity.ts` (COMPLEXITY_LEVELS).
 */
const model = defineModel<number | null>({ default: null })

/** Позиция ползунка внутри уровня: 0..100 */
const MAX_PERCENT = 100

const level = ref<ComplexityLevelKey>(COMPLEXITY_LEVELS[0].key)
const percent = ref<number>(0)
const isInternalChange = ref(false)

const levels = COMPLEXITY_LEVELS

const hasValue = computed(() => model.value != null && Number.isFinite(Number(model.value)))
// Уровень берём из выбранной кнопки, а не из model, чтобы UI не «прыгал»,
// пока позиция ползунка ещё не выровнялась под диапазон нового уровня.
const currentDef = computed(() => levels.find(l => l.key === level.value) ?? levels[0])

const clampPercent = (v: number): number => {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(MAX_PERCENT, Math.round(v)))
}

/** Позиция 0..100 внутри уровня → float 0..1 (внутри диапазона уровня) */
function percentToFloat(p: number, def = currentDef.value): number {
  const t = clampPercent(p) / MAX_PERCENT
  return +(def.min + (def.max - def.min) * t).toFixed(3)
}

/** Float 0..1 → позиция 0..100 внутри своего уровня */
function floatToPercent(v: number | null | undefined, def = complexityLevel(v)): number {
  const clamped = clampComplexity(v)
  const span = def.max - def.min
  if (span <= 0) return 0
  return clampPercent(((clamped - def.min) / span) * MAX_PERCENT)
}

const currentFloat = computed(() => percentToFloat(percent.value))

watch(model, (v) => {
  if (isInternalChange.value) return
  const def = complexityLevel(v)
  level.value = def.key
  percent.value = floatToPercent(v, def)
}, { immediate: true })

watch([level, percent], () => {
  if (props.readonly) return
  // Сменили уровень — позиция ползунка сохраняется (0..100 внутри нового диапазона).
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

function onSliderInput(e: Event) {
  if (props.readonly) return
  const t = e.target as HTMLInputElement
  percent.value = clampPercent(Number(t.value))
}

const trackStyle = computed(() => ({
  'background': `linear-gradient(to right,
    ${currentDef.value.hex} 0%,
    ${currentDef.value.hex} ${percent.value}%,
    var(--ui-bg-elevated, #f1f5f9) ${percent.value}%,
    var(--ui-bg-elevated, #f1f5f9) 100%)`,
  '--_slider-color': currentDef.value.hex
}))

const compactTitle = computed(() =>
  hasValue.value
    ? `Сложность: ${currentDef.value.label} · ${percent.value}% (${currentFloat.value.toFixed(3)})`
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
      <span class="font-mono tabular-nums leading-none">{{ percent }}%</span>
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
    <span class="font-mono tabular-nums leading-none">{{ percent }}%</span>
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
        min="0"
        :max="MAX_PERCENT"
        step="1"
        :value="percent"
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
      <span
        class="inline-flex h-7 w-14 shrink-0 items-center justify-center rounded-md border border-default bg-default font-mono text-xs font-semibold tabular-nums text-highlighted"
        :class="readonly ? 'opacity-80' : ''"
        aria-label="Позиция внутри уровня, %"
      >{{ percent }}%</span>
    </div>
  </div>
</template>
