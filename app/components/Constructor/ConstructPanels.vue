<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// ==================== Props ====================

interface Props {
  leftTitle?: string
  mainTitle?: string
  rightTitle?: string
  defaultViewportWidth?: number | null
  viewportStorageKey?: string
  showViewportPicker?: boolean
  displayRight?: boolean
  displayViewportSelector?: boolean
  minLeftWidth?: number
  maxLeftWidth?: number
  minRightWidth?: number
  maxRightWidth?: number
  defaultLeftWidth?: number
  defaultRightWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  leftTitle: '',
  mainTitle: '',
  rightTitle: '',
  defaultViewportWidth: 834,
  viewportStorageKey: 'constructor:viewport-width',
  showViewportPicker: true,
  displayRight: true,
  displayViewportSelector: true,
  minLeftWidth: 180,
  maxLeftWidth: 500,
  minRightWidth: 200,
  maxRightWidth: 600,
  defaultLeftWidth: 260,
  defaultRightWidth: 500,
})

// ==================== Ресайз панелей ====================

const leftWidth = ref(props.defaultLeftWidth)
const rightWidth = ref(props.defaultRightWidth)

type Side = 'left' | 'right' | null
const resizing = ref<Side>(null)

let startOffset = 0

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function startResize(side: Exclude<Side, null>, e: PointerEvent) {
  e.preventDefault()

  resizing.value = side

  if (side === 'left') {
    startOffset = e.clientX - leftWidth.value
  } else {
    startOffset = window.innerWidth - e.clientX - rightWidth.value
  }

  const root = document.documentElement
  root.style.cursor = 'col-resize'
  root.style.userSelect = 'none'
}

function onPointerMove(e: PointerEvent) {
  if (!resizing.value) return

  const winW = window.innerWidth

  if (resizing.value === 'left') {
    const maxByWindow = winW - rightWidth.value - 4 - 4 - props.minRightWidth - 200
    const max = Math.max(props.minLeftWidth, Math.min(props.maxLeftWidth, maxByWindow))

    leftWidth.value = clamp(e.clientX - startOffset, props.minLeftWidth, max)
  } else {
    const maxByWindow = winW - leftWidth.value - 4 - 4 - props.minLeftWidth - 200
    const max = Math.max(props.minRightWidth, Math.min(props.maxRightWidth, maxByWindow))

    rightWidth.value = clamp(winW - e.clientX - startOffset, props.minRightWidth, max)
  }
}

function endResize() {
  if (!resizing.value) return

  resizing.value = null

  const root = document.documentElement
  root.style.cursor = ''
  root.style.userSelect = ''
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
  window.addEventListener('blur', endResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  window.removeEventListener('blur', endResize)
})

const gridStyle = computed(() => {
  if (!props.displayRight) {
    return {
      gridTemplateColumns: `${leftWidth.value}px 4px 1fr`,
    }
  }
  return {
    gridTemplateColumns: `${leftWidth.value}px 4px 1fr 4px ${rightWidth.value}px`,
  }
})

// ==================== Вьюпорт (эмуляция устройств) ====================

interface ViewportPreset {
  key: string
  label: string
  width: number
  icon: string
  group?: string
}

const viewportPresets: ViewportPreset[] = [
  { key: 'tv-1080',    label: '1080p Full HD',  width: 1920, icon: 'i-lucide-monitor',    group: 'TV' },
  { key: 'tv-4k',      label: '4K Ultra HD',    width: 3840, icon: 'i-lucide-monitor',    group: 'TV' },

  { key: 'iphone-se',  label: 'iPhone SE',      width: 375,  icon: 'i-lucide-smartphone', group: 'Mobile' },
  { key: 'iphone-14',  label: 'iPhone 14',      width: 390,  icon: 'i-lucide-smartphone', group: 'Mobile' },
  { key: 'iphone-14p', label: 'iPhone 14 Pro',  width: 393,  icon: 'i-lucide-smartphone', group: 'Mobile' },
  { key: 'pixel-7',    label: 'Pixel 7',        width: 412,  icon: 'i-lucide-smartphone', group: 'Mobile' },
  { key: 'galaxy-s25', label: 'Galaxy S25',     width: 360,  icon: 'i-lucide-smartphone', group: 'Mobile' },

  { key: 'ipad-mini',  label: 'iPad Mini',      width: 744,  icon: 'i-lucide-tablet',     group: 'Tablet' },
  { key: 'ipad-pro',   label: 'iPad Pro 11"',   width: 834,  icon: 'i-lucide-tablet',     group: 'Tablet' },
  { key: 'galaxy-tab', label: 'Galaxy Tab S9',  width: 800,  icon: 'i-lucide-tablet',     group: 'Tablet' },

  { key: 'laptop-hd',  label: 'Laptop HD',      width: 1280, icon: 'i-lucide-laptop',     group: 'Laptop' },
  { key: 'laptop-fhd', label: 'Laptop Full HD', width: 1440, icon: 'i-lucide-laptop',     group: 'Laptop' },
  { key: 'laptop-4k',  label: 'Laptop 4K',      width: 1920, icon: 'i-lucide-laptop',     group: 'Laptop' },
]

function readStoredWidth(): number | null {
  if (!import.meta.client) return props.defaultViewportWidth

  const raw = localStorage.getItem(props.viewportStorageKey)
  if (raw === null) return props.defaultViewportWidth

  if (raw === 'auto') return null

  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : props.defaultViewportWidth
}

const viewportWidth = ref<number | null>(readStoredWidth())
const customWidth = ref<string>(
  viewportWidth.value !== null ? String(viewportWidth.value) : '',
)
const viewportMenuOpen = ref(false)

watch(viewportWidth, (val) => {
  if (!import.meta.client) return
  localStorage.setItem(
    props.viewportStorageKey,
    val === null ? 'auto' : String(val),
  )
})

const activePreset = computed(() =>
  viewportPresets.find((p) => p.width === viewportWidth.value) ?? null
)

const viewportLabel = computed(() =>
  viewportWidth.value === null ? 'Авто' : `${viewportWidth.value}`,
)

const groupedPresets = computed(() => {
  const result: Record<string, ViewportPreset[]> = {}
  for (const p of viewportPresets) {
    const key = p.group ?? 'Другое'
    if (!result[key]) result[key] = []
    result[key].push(p)
  }
  return result
})

function selectPreset(preset: ViewportPreset) {
  viewportWidth.value = preset.width
  customWidth.value = String(preset.width)
  viewportMenuOpen.value = false
}

function selectAuto() {
  viewportWidth.value = null
  customWidth.value = ''
  viewportMenuOpen.value = false
}

function applyCustomWidth() {
  const n = Number(customWidth.value)
  if (!Number.isFinite(n) || n <= 0) {
    viewportWidth.value = null
    return
  }
  viewportWidth.value = Math.round(n)
  viewportMenuOpen.value = false
}

const viewportStyle = computed(() => {
  // Если управление вьюпортом отключено, всегда растягиваем на 100%
  if (!props.displayViewportSelector || viewportWidth.value === null) {
    return { width: '100%', maxWidth: '100%' }
  }
  return {
    width: `${viewportWidth.value}px`,
    maxWidth: `${viewportWidth.value}px`,
  }
})

const isViewportBounded = computed(() => {
  // Если управление вьюпортом отключено, ограничений нет
  if (!props.displayViewportSelector) return false
  return viewportWidth.value !== null
})

// Классы для пунктирных границ эмуляции вьюпорта (используются условно).
// Строка должна присутствовать в файле целиком, чтобы Tailwind её обнаружил.
const boundedScreenClasses =
  "before:absolute before:inset-y-0 before:left-0 before:w-0 before:border-l-2 before:border-dashed before:border-[var(--ui-border,#a5acb5)] before:pointer-events-none before:content-[''] after:absolute after:inset-y-0 after:right-0 after:w-0 after:border-l-2 after:border-dashed after:border-[var(--ui-border,#a5acb5)] after:pointer-events-none after:content-['']"

// ==================== Публичный API ====================

defineExpose({
  viewportWidth,
  viewportStyle,
  isViewportBounded,
  selectPreset,
  selectAuto,
  applyCustomWidth,
})
</script>

<template>
  <div class="w-full h-dvh overflow-hidden bg-[var(--ui-bg,#ffffff)]">
    <div class="grid h-full w-full" :style="gridStyle">
      <!-- === ЛЕВАЯ ПАНЕЛЬ === -->
      <aside class="flex flex-col min-w-0 min-h-0 overflow-hidden border-r border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)]">
        <header class="shrink-0 h-12 px-4 flex items-center text-xs font-semibold text-[var(--ui-text-muted,#6b7280)] uppercase tracking-wider border-b border-[var(--ui-border,#e5e7eb)]">
          <div class="flex items-center justify-between w-full gap-2">
            <slot name="left-header">
              <span>{{ props.leftTitle }}</span>
            </slot>
          </div>
        </header>
        <div class="flex-auto min-h-0 overflow-y-auto overflow-x-hidden">
          <slot name="left" />
        </div>
      </aside>

      <!-- === ЛЕВЫЙ РЕСАЙЗЕР === -->
      <div
        class="group relative w-1 cursor-col-resize bg-transparent flex items-center justify-center transition-colors select-none touch-none hover:bg-[var(--ui-primary,#3b82f6)] before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:cursor-col-resize before:z-[1] before:content-['']"
        :class="{ 'bg-[var(--ui-primary,#3b82f6)]': resizing === 'left' }"
        @pointerdown="startResize('left', $event)"
      >
        <div
          class="w-0.5 h-8 rounded-sm transition-colors pointer-events-none"
          :class="resizing === 'left' ? 'bg-white' : 'bg-[var(--ui-border,#d1d5db)] group-hover:bg-white'"
        />
      </div>

      <!-- === ЦЕНТР === -->
      <main class="flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header class="shrink-0 h-12 px-4 grid grid-cols-[1fr_auto_1fr] items-center text-xs font-semibold text-[var(--ui-text-muted,#6b7280)] uppercase tracking-wider border-b border-[var(--ui-border,#e5e7eb)] gap-3">
          <!-- Слева: заголовок (или слот) -->
          <div class="flex items-center justify-start min-w-0">
            <slot name="main-header">
              <span>{{ props.mainTitle }}</span>
            </slot>
          </div>

          <!-- По центру: управление вьюпортом (скрывается пропсом) -->
          <div v-if="displayViewportSelector" class="flex items-center justify-center">
            <div class="relative">
              <button
                type="button"
                class="inline-flex items-center gap-1 h-[26px] px-2 rounded-md border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] text-[var(--ui-text,#111827)] text-[11px] font-mono cursor-pointer transition-colors duration-150 hover:border-[var(--ui-primary,#3b82f6)] hover:bg-[var(--ui-bg-elevated,#f9fafb)]"
                :title="activePreset?.label ?? 'Авто'"
                @click="viewportMenuOpen = !viewportMenuOpen"
              >
                <UIcon
                  :name="activePreset?.icon ?? 'i-lucide-maximize'"
                  class="w-[13px] h-[13px] text-[var(--ui-text-muted,#6b7280)]"
                />
                <span class="min-w-7 text-right">{{ viewportLabel }}</span>
                <UIcon name="i-lucide-chevron-down" class="w-3 h-3 text-[var(--ui-text-muted,#9ca3af)]" />
              </button>

              <Transition name="viewport-menu-fade">
                <div
                  v-if="viewportMenuOpen"
                  class="absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 z-[100] min-w-[260px] max-h-[70vh] overflow-y-auto p-1 rounded-lg border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
                  @click.stop
                >
                  <!-- Авто -->
                  <button
                    type="button"
                    class="flex items-center gap-2 w-full px-2 py-1.5 border-none rounded-[5px] bg-transparent text-left text-xs cursor-pointer transition-colors duration-100"
                    :class="viewportWidth === null
                      ? 'bg-[var(--ui-primary,#3b82f6)] text-white'
                      : 'text-[var(--ui-text,#111827)] hover:bg-[var(--ui-bg-muted,rgba(59,130,246,0.08))]'"
                    @click="selectAuto"
                  >
                    <UIcon
                      name="i-lucide-maximize"
                      class="shrink-0 w-3.5 h-3.5"
                      :class="viewportWidth === null ? 'text-white' : 'text-[var(--ui-text-muted,#6b7280)]'"
                    />
                    <span class="flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">Без ограничения</span>
                    <span
                      class="shrink-0 text-[11px] font-mono"
                      :class="viewportWidth === null ? 'text-white' : 'text-[var(--ui-text-muted,#6b7280)]'"
                    >авто</span>
                  </button>

                  <div class="h-px my-1 bg-[var(--ui-border,#e5e7eb)]" />

                  <!-- Пресеты по группам -->
                  <template
                    v-for="(group, groupName) in groupedPresets"
                    :key="groupName"
                  >
                    <div class="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted,#9ca3af)]">{{ groupName }}</div>

                    <button
                      v-for="preset in group"
                      :key="preset.key"
                      type="button"
                      class="flex items-center gap-2 w-full px-2 py-1.5 border-none rounded-[5px] bg-transparent text-left text-xs cursor-pointer transition-colors duration-100"
                      :class="activePreset?.key === preset.key
                        ? 'bg-[var(--ui-primary,#3b82f6)] text-white'
                        : 'text-[var(--ui-text,#111827)] hover:bg-[var(--ui-bg-muted,rgba(59,130,246,0.08))]'"
                      @click="selectPreset(preset)"
                    >
                      <UIcon
                        :name="preset.icon"
                        class="shrink-0 w-3.5 h-3.5"
                        :class="activePreset?.key === preset.key ? 'text-white' : 'text-[var(--ui-text-muted,#6b7280)]'"
                      />
                      <span class="flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ preset.label }}</span>
                      <span
                        class="shrink-0 text-[11px] font-mono"
                        :class="activePreset?.key === preset.key ? 'text-white' : 'text-[var(--ui-text-muted,#6b7280)]'"
                      >{{ preset.width }}</span>
                    </button>
                  </template>

                  <div class="h-px my-1 bg-[var(--ui-border,#e5e7eb)]" />

                  <!-- Произвольная ширина -->
                  <div class="flex items-center gap-2 px-2 py-1.5">
                    <UIcon name="i-lucide-pencil-ruler" class="shrink-0 w-3.5 h-3.5 text-[var(--ui-text-muted,#6b7280)]" />
                    <span class="flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--ui-text,#111827)]">Своя ширина</span>
                    <div class="relative inline-flex items-center flex-auto">
                      <input
                        v-model="customWidth"
                        type="number"
                        min="320"
                        max="3840"
                        placeholder="px"
                        class="w-full h-6 pl-1.5 pr-[22px] rounded-[5px] border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] text-[11px] font-mono text-[var(--ui-text,#111827)] text-right focus:outline-none focus:border-[var(--ui-primary,#3b82f6)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
                        @keydown.enter="applyCustomWidth"
                      />
                      <span class="absolute right-1.5 text-[10px] text-[var(--ui-text-muted,#9ca3af)] pointer-events-none">px</span>
                    </div>
                    <button
                      type="button"
                      class="inline-flex items-center justify-center w-6 h-6 p-0 border-none rounded-[5px] bg-[var(--ui-primary,#3b82f6)] text-white cursor-pointer transition-colors duration-150 hover:bg-[#2563eb] [&_svg]:w-3.5 [&_svg]:h-3.5"
                      title="Применить"
                      @click="applyCustomWidth"
                    >
                      <UIcon name="i-lucide-check" />
                    </button>
                  </div>
                </div>
              </Transition>

              <div
                v-if="viewportMenuOpen"
                class="fixed inset-0 z-[99]"
                @click="viewportMenuOpen = false"
              />
            </div>
          </div>

          <!-- Справа: пустая зона-балансир -->
          <div class="flex items-center justify-end min-w-0">
            <slot name="main-header-right" />
          </div>
        </header>

        <div class="flex-auto min-h-0 overflow-y-auto overflow-x-hidden">
          <!-- Рамка эмуляции вьюпорта -->
          <div
            class="flex flex-col items-center gap-2 py-4 relative"
            :class="{ 'py-6 px-4': isViewportBounded }"
          >
            <div
              class="bg-default mx-auto transition-[width,max-width] duration-200 relative"
              :style="viewportStyle"
              :class="isViewportBounded ? boundedScreenClasses : ''"
            >
              <slot name="main" />
            </div>

            <div
              v-if="isViewportBounded"
              class="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full bg-[var(--ui-bg-elevated,#f9fafb)] border border-[var(--ui-border,#e5e7eb)] text-[11px] font-mono text-[var(--ui-text-muted,#6b7280)] pointer-events-none select-none"
            >
              <UIcon name="i-lucide-monitor" class="w-3 h-3 opacity-70" />
              <span>{{ viewportWidth }} px</span>
            </div>
          </div>
        </div>
      </main>

      <!-- === ПРАВЫЙ РЕСАЙЗЕР (только если displayRight) === -->
      <div
        v-if="displayRight"
        class="group relative w-1 cursor-col-resize bg-transparent flex items-center justify-center transition-colors select-none touch-none hover:bg-[var(--ui-primary,#3b82f6)] before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:cursor-col-resize before:z-[1] before:content-['']"
        :class="{ 'bg-[var(--ui-primary,#3b82f6)]': resizing === 'right' }"
        @pointerdown="startResize('right', $event)"
      >
        <div
          class="w-0.5 h-8 rounded-sm transition-colors pointer-events-none"
          :class="resizing === 'right' ? 'bg-white' : 'bg-[var(--ui-border,#d1d5db)] group-hover:bg-white'"
        />
      </div>

      <!-- === ПРАВАЯ ПАНЕЛЬ (только если displayRight) === -->
      <aside
        v-if="displayRight"
        class="flex flex-col min-w-0 min-h-0 overflow-hidden border-l border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)]"
      >
        <header class="shrink-0 h-12 px-4 flex items-center text-xs font-semibold text-[var(--ui-text-muted,#6b7280)] uppercase tracking-wider border-b border-[var(--ui-border,#e5e7eb)]">
          <div class="flex items-center justify-between w-full gap-2">
            <slot name="right-header">
              <span>{{ props.rightTitle }}</span>
            </slot>
          </div>
        </header>
        <div class="flex-auto min-h-0 overflow-y-auto overflow-x-hidden">
          <slot name="right" />
        </div>
      </aside>
    </div>
  </div>
</template>
