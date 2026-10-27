<!-- components/Constructor/Components/completer.vue -->
<script setup lang="ts">
import { computed, inject, ref, type Ref, watch } from 'vue'
import type { SettingNode } from '~/utils/constructors'

const value = defineModel<SettingNode | null>({ default: null })

withDefaults(defineProps<{
  id?: number
  modelName?: string | null
}>(), {
  modelName: 'blocks',
})

// ==================== Режим урока ====================

const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))

// ==================== Хелперы ====================

function child(node: SettingNode | null | undefined, key: string): SettingNode | undefined {
  return node?.children?.find((c) => c.key === key)
}

function toPx(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : `${n * 4}px`
}

function toPxBorder(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : `${n}px`
}

function toPxRadius(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : `${n * 4}px`
}

// ==================== Layout ====================

const blockWidth = computed(() => {
  const cols = Number(child(value.value, 'first-block-cols')?.default ?? 12)
  const pct = Math.min(Math.max(cols / 24, 0), 1)
  return `${pct * 100}%`
})

const blockPosition = computed(() => {
  const pos = child(value.value, 'first-block-position')?.default
  if (pos === 'flex-start' || pos === 'center' || pos === 'flex-end') return pos
  return 'center'
})

// ==================== Стили корня ====================

const paddingStyle = computed(() => {
  const node = child(value.value, 'padding')
  if (!node) return {}
  const s: Record<string, string> = {}
  const map = { left: 'paddingLeft', right: 'paddingRight', top: 'paddingTop', bottom: 'paddingBottom' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = toPx(node.children?.find((c) => c.key === side)?.default)
    if (px) s[cssKey] = px
  }
  return s
})

const marginStyle = computed(() => {
  const node = child(value.value, 'margin')
  if (!node) return {}
  const s: Record<string, string> = {}
  const map = { left: 'marginLeft', right: 'marginRight', top: 'marginTop', bottom: 'marginBottom' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = toPx(node.children?.find((c) => c.key === side)?.default)
    if (px) s[cssKey] = px
  }
  return s
})

const backgroundStyle = computed(() => {
  const bg = child(value.value, 'background-color')?.default
  const name = typeof bg === 'string' ? bg.replace(/^bg-/, '') : ''
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})

const borderStyle = computed(() => {
  const node = child(value.value, 'border')
  if (!node) return {}
  const s: Record<string, string> = {}

  const bg = child(value.value, 'background-color')?.default
  const bgName = typeof bg === 'string' ? bg.replace(/^bg-/, '') : ''
  const bgVar = bgName ? `--bg-${bgName}` : null

  const colorNode = node.children?.find((c) => c.key === 'color')
  if (colorNode?.default) {
    const name = String(colorNode.default).replace(/^border-/, '')
    if (name === 'inherit') {
      s.borderColor = bgVar ? `var(${bgVar})` : 'transparent'
    } else if (name) {
      s.borderColor = `var(--border-${name})`
    }
    if (s.borderColor) s.borderStyle = 'solid'
  }

  const widthMap = {
    left: 'borderLeftWidth',
    right: 'borderRightWidth',
    top: 'borderTopWidth',
    bottom: 'borderBottomWidth'
  } as const
  for (const [side, cssKey] of Object.entries(widthMap)) {
    const px = toPxBorder(node.children?.find((c) => c.key === side)?.default)
    if (px) s[cssKey] = px
  }

  const radius = node.children?.find((c) => c.key === 'radius')
  if (radius) {
    const rMap = {
      'top-left': 'borderTopLeftRadius',
      'top-right': 'borderTopRightRadius',
      'bottom-right': 'borderBottomRightRadius',
      'bottom-left': 'borderBottomLeftRadius',
    } as const
    for (const [corner, cssKey] of Object.entries(rMap)) {
      const px = toPxRadius(radius.children?.find((c) => c.key === corner)?.default)
      if (px) s[cssKey] = px
    }
  }

  return s
})

const contentStyle = computed(() => ({
  ...backgroundStyle.value,
  ...borderStyle.value,
  ...paddingStyle.value,
  width: blockWidth.value,
}))

// ==================== Цвета ====================

const accentColor = computed<string>(() => {
  const raw = child(value.value, 'steps-color')?.default
  if (typeof raw !== 'string' || !raw) return 'var(--ui-primary)'

  const name = raw.replace(/^accent-/, '')
  if (!name) return 'var(--ui-primary)'

  if (name === 'inherit') {
    const bg = child(value.value, 'background-color')?.default
    const bgName = typeof bg === 'string' ? bg.replace(/^bg-/, '') : ''
    return bgName ? `var(--bg-${bgName})` : 'var(--ui-primary)'
  }

  return `var(--accent-${name})`
})

const textColor = computed<string>(() => {
  const raw = child(value.value, 'text-color')?.default
  if (typeof raw !== 'string' || !raw) return 'inherit'

  const name = raw.replace(/^accent-/, '')
  if (!name) return 'inherit'

  if (name === 'inherit') {
    return 'inherit'
  }

  return `var(--accent-${name})`
})

const activeStepStyle = computed(() => ({
  backgroundColor: accentColor.value,
  borderColor: accentColor.value,
}))

const inactiveStepStyle = computed(() => ({
  borderColor: `color-mix(in srgb, ${accentColor.value} 30%, var(--ui-border))`,
  color: accentColor.value,
}))

function connectorStyle(isActive: boolean): Record<string, string> {
  return isActive ? { backgroundColor: accentColor.value } : {}
}

// ==================== Локальный стейт шагов (Вариант 1) ====================

// Храним выбранные шаги локально, чтобы не триггерить автосохранение
const localActiveSteps = ref<string[]>([])

// Синхронизируем локальный стейт с настройками (только при загрузке или изменении извне)
watch(
  () => value.value,
  (val) => {
    const stepsNode = child(val, 'steps')
    if (!stepsNode?.children) {
      localActiveSteps.value = []
      return
    }

    const active: string[] = []
    for (const c of stepsNode.children) {
      const isValTrue = c.children?.find((x) => x.key === 'value')?.default === true
      if (isValTrue) active.push(c.key)
    }
    localActiveSteps.value = active
  },
  { immediate: true, deep: true }
)

// ==================== Шаги ====================

interface StepView {
  key: string
  label: string
  icon: string
  active: boolean
}

const steps = computed<StepView[]>(() => {
  const node = child(value.value, 'steps')
  if (!node?.children) return []

  const enabled = Array.isArray(node.default) ? (node.default as string[]) : []
  const list: StepView[] = []

  for (const c of node.children) {
    if (!enabled.includes(c.key)) continue
    list.push({
      key: c.key,
      label: typeof c.default === 'string' && c.default ? c.default : (c.label ?? c.key),
      icon: (c.children?.find((x) => x.key === 'icon')?.default as string) || 'i-lucide-circle',
      active: localActiveSteps.value.includes(c.key), // Берем из локального стейта
    })
  }

  return list
})

// ==================== Строго последовательный тоггл ====================

function toggleStep(clickedStep: StepView) {
  const visibleStepKeys = steps.value.map((s) => s.key)
  const clickedVisibleIdx = visibleStepKeys.indexOf(clickedStep.key)
  if (clickedVisibleIdx === -1) return

  const newActiveSet = new Set(localActiveSteps.value)

  if (clickedStep.active) {
    // Если выключаем — оставляем предыдущие, а этот и ВСЕ ПОСЛЕДУЮЩИЕ выключаем
    for (let i = clickedVisibleIdx; i < visibleStepKeys.length; i++) {
      newActiveSet.delete(visibleStepKeys[i])
    }
  } else {
    // Если включаем — активируем этот и ВСЕ ПРЕДЫДУЩИЕ
    for (let i = 0; i <= clickedVisibleIdx; i++) {
      newActiveSet.add(visibleStepKeys[i])
    }
  }

  // Обновляем ТОЛЬКО локальный стейт, не трогая value.value
  localActiveSteps.value = Array.from(newActiveSet)
}
</script>

<template>
  <div class="completer-root w-full">
    <!-- Контейнер отступов -->
    <div :style="marginStyle">
      <!-- Контейнер выравнивания -->
      <div class="flex w-full" :style="{ justifyContent: blockPosition }">
        <!-- Контейнер ширины, фона и рамок -->
        <div class="min-w-0" :style="contentStyle">
          <div v-if="steps.length" class="relative flex items-start">
            <!-- Колонки шагов -->
            <div
              v-for="step in steps"
              :key="step.key"
              class="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <button
                type="button"
                class="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                :class="[
                  step.active
                    ? 'text-white shadow-md'
                    : 'bg-default text-muted',
                ]"
                :style="step.active ? activeStepStyle : inactiveStepStyle"
                :title="step.label"
                @click="toggleStep(step)"
              >
                <UIcon :name="step.icon" class="size-6"/>
              </button>

              <span
                class="w-full text-center text-[11.5px] font-semibold transition-colors"
                :class="step.active ? '' : 'opacity-60'"
                :style="{ color: textColor }"
              >
                {{ step.label }}
              </span>
            </div>

            <!-- Соединители (между центрами колонок) -->
            <div
              v-for="i in steps.length - 1"
              :key="`conn-${i}`"
              class="absolute top-6 h-0.5 -translate-y-1/2 transition-colors duration-200 z-0"
              :class="!steps[i - 1].active ? 'bg-default' : ''"
              :style="{
                left: `calc(${((i - 0.5) / steps.length) * 100}% + 28px)`,
                width: `calc(${(1 / steps.length) * 100}% - 56px)`,
                ...connectorStyle(steps[i - 1].active),
              }"
            />
          </div>

          <div
            v-else
            class="flex items-center justify-center gap-1.5 py-4 text-[12px] text-muted"
          >
            <UIcon name="i-lucide-info" class="size-3.5"/>
            <span>Нет шагов для отображения</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.completer-root {
  position: relative;
}
</style>
