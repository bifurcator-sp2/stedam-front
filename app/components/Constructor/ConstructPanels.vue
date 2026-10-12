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
}

const props = withDefaults(defineProps<Props>(), {
  leftTitle: '',
  mainTitle: '',
  rightTitle: '',
  defaultViewportWidth: 834, // iPad Pro 11"
  viewportStorageKey: 'constructor:viewport-width',
  showViewportPicker: true,
})

// ==================== Ресайз панелей ====================

const MIN_LEFT = 180
const MAX_LEFT = 500
const MIN_RIGHT = 200
const MAX_RIGHT = 600

const leftWidth = ref(260)
const rightWidth = ref(500)

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
    const maxByWindow = winW - rightWidth.value - 4 - 4 - MIN_RIGHT - 200
    const max = Math.max(MIN_LEFT, Math.min(MAX_LEFT, maxByWindow))

    leftWidth.value = clamp(e.clientX - startOffset, MIN_LEFT, max)
  } else {
    const maxByWindow = winW - leftWidth.value - 4 - 4 - MIN_LEFT - 200
    const max = Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, maxByWindow))

    rightWidth.value = clamp(winW - e.clientX - startOffset, MIN_RIGHT, max)
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

const gridStyle = computed(() => ({
  gridTemplateColumns: `${leftWidth.value}px 4px 1fr 4px ${rightWidth.value}px`,
}))

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
  if (viewportWidth.value === null) {
    return { width: '100%', maxWidth: '100%' }
  }
  return {
    width: `${viewportWidth.value}px`,
    maxWidth: `${viewportWidth.value}px`,
  }
})

const isViewportBounded = computed(() => viewportWidth.value !== null)

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
  <div class="constructor-root">
    <div class="constructor-grid" :style="gridStyle">
      <!-- === ЛЕВАЯ ПАНЕЛЬ === -->
      <aside class="panel panel-left">
        <header class="panel-header">
          <div class="panel-header-row">
            <slot name="left-header">
              <span>{{ props.leftTitle }}</span>
            </slot>
          </div>
        </header>
        <div class="panel-body">
          <slot name="left" />
        </div>
      </aside>

      <!-- === ЛЕВЫЙ РЕСАЙЗЕР === -->
      <div
        class="resizer"
        :class="{ 'resizer-active': resizing === 'left' }"
        @pointerdown="startResize('left', $event)"
      >
        <div class="resizer-bar" />
      </div>

      <!-- === ЦЕНТР === -->
      <main class="panel panel-center">
        <header class="panel-header panel-header--center">
          <!-- Слева: заголовок (или слот) -->
          <div class="panel-header__left">
            <slot name="main-header">
              <span>{{ props.mainTitle }}</span>
            </slot>
          </div>

          <!-- По центру: управление вьюпортом — всегда видно -->
          <div class="panel-header__center">
            <div class="viewport-picker">
              <button
                type="button"
                class="viewport-picker__button"
                :title="activePreset?.label ?? 'Авто'"
                @click="viewportMenuOpen = !viewportMenuOpen"
              >
                <UIcon
                  :name="activePreset?.icon ?? 'i-lucide-maximize'"
                  class="viewport-picker__icon"
                />
                <span class="viewport-picker__value">{{ viewportLabel }}</span>
                <UIcon name="i-lucide-chevron-down" class="viewport-picker__chevron" />
              </button>

              <Transition name="viewport-menu-fade">
                <div
                  v-if="viewportMenuOpen"
                  class="viewport-menu"
                  @click.stop
                >
                  <!-- Авто -->
                  <button
                    type="button"
                    class="viewport-menu__item"
                    :class="{ 'viewport-menu__item--active': viewportWidth === null }"
                    @click="selectAuto"
                  >
                    <UIcon name="i-lucide-maximize" class="viewport-menu__icon" />
                    <span class="viewport-menu__label">Без ограничения</span>
                    <span class="viewport-menu__width">авто</span>
                  </button>

                  <div class="viewport-menu__divider" />

                  <!-- Пресеты по группам -->
                  <template
                    v-for="(group, groupName) in groupedPresets"
                    :key="groupName"
                  >
                    <div class="viewport-menu__group">{{ groupName }}</div>

                    <button
                      v-for="preset in group"
                      :key="preset.key"
                      type="button"
                      class="viewport-menu__item"
                      :class="{ 'viewport-menu__item--active': activePreset?.key === preset.key }"
                      @click="selectPreset(preset)"
                    >
                      <UIcon :name="preset.icon" class="viewport-menu__icon" />
                      <span class="viewport-menu__label">{{ preset.label }}</span>
                      <span class="viewport-menu__width">{{ preset.width }}</span>
                    </button>
                  </template>

                  <div class="viewport-menu__divider" />

                  <!-- Произвольная ширина -->
                  <div class="viewport-menu__custom">
                    <UIcon name="i-lucide-pencil-ruler" class="viewport-menu__icon" />
                    <span class="viewport-menu__label">Своя ширина</span>
                    <div class="viewport-menu__input-wrap">
                      <input
                        v-model="customWidth"
                        type="number"
                        min="320"
                        max="3840"
                        placeholder="px"
                        class="viewport-menu__input"
                        @keydown.enter="applyCustomWidth"
                      />
                      <span class="viewport-menu__input-suffix">px</span>
                    </div>
                    <button
                      type="button"
                      class="viewport-menu__apply"
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
                class="viewport-backdrop"
                @click="viewportMenuOpen = false"
              />
            </div>
          </div>

          <!-- Справа: пустая зона-балансир (можно положить что-то через слот) -->
          <div class="panel-header__right">
            <slot name="main-header-right" />
          </div>
        </header>

        <div class="panel-body">
          <!-- Рамка эмуляции вьюпорта — часть UI ConstructPanels -->
          <div
            class="viewport-frame"
            :class="{ 'viewport-frame--bounded': isViewportBounded }"
          >
            <div
              class="viewport-frame__screen bg-default mx-auto"
              :style="viewportStyle"
              :class="{ 'viewport-frame__screen--bounded': isViewportBounded }"
            >
              <slot name="main" />
            </div>

            <div v-if="isViewportBounded" class="viewport-frame__label">
              <UIcon name="i-lucide-monitor" class="viewport-frame__label-icon" />
              <span>{{ viewportWidth }} px</span>
            </div>
          </div>
        </div>
      </main>

      <!-- === ПРАВЫЙ РЕСАЙЗЕР === -->
      <div
        class="resizer"
        :class="{ 'resizer-active': resizing === 'right' }"
        @pointerdown="startResize('right', $event)"
      >
        <div class="resizer-bar" />
      </div>

      <!-- === ПРАВАЯ ПАНЕЛЬ === -->
      <aside class="panel panel-right">
        <header class="panel-header">
          <div class="panel-header-row">
            <slot name="right-header">
              <span>{{ props.rightTitle }}</span>
            </slot>
          </div>
        </header>
        <div class="panel-body">
          <slot name="right" />
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ==================== Общая структура ==================== */

.constructor-root {
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: var(--ui-bg, #ffffff);
}

.constructor-grid {
  display: grid;
  height: 100%;
  width: 100%;
}

.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.panel-left {
  border-right: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
}

.panel-right {
  border-left: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
}

.panel-center {
}

.panel-header {
  flex-shrink: 0;
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--ui-border, #e5e7eb);
}

.panel-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ==================== Центральный хедер: три зоны ==================== */

.panel-header--center {
  /* Перебиваем flex-раскладку базового .panel-header */
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
}

.panel-header--center .panel-header__left {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
}

.panel-header--center .panel-header__center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-header--center .panel-header__right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

/* ==================== Ресайзеры ==================== */

.resizer {
  position: relative;
  width: 4px;
  cursor: col-resize;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  user-select: none;
  touch-action: none;
}

.resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  right: -4px;
  cursor: col-resize;
  z-index: 1;
}

.resizer:hover,
.resizer-active {
  background: var(--ui-primary, #3b82f6);
}

.resizer-bar {
  width: 2px;
  height: 32px;
  border-radius: 2px;
  background: var(--ui-border, #d1d5db);
  transition: background 0.15s ease;
  pointer-events: none;
}

.resizer:hover .resizer-bar,
.resizer-active .resizer-bar {
  background: #ffffff;
}

/* ==================== Управление шириной вьюпорта ==================== */

.viewport-picker {
  position: relative;
}

.viewport-picker__button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
  color: var(--ui-text, #111827);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.viewport-picker__button:hover {
  border-color: var(--ui-primary, #3b82f6);
  background: var(--ui-bg-elevated, #f9fafb);
}

.viewport-picker__icon {
  width: 13px;
  height: 13px;
  color: var(--ui-text-muted, #6b7280);
}

.viewport-picker__value {
  min-width: 28px;
  text-align: right;
}

.viewport-picker__chevron {
  width: 12px;
  height: 12px;
  color: var(--ui-text-muted, #9ca3af);
}

.viewport-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.viewport-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  min-width: 260px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.viewport-menu__group {
  padding: 6px 8px 2px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-text-muted, #9ca3af);
}

.viewport-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  text-align: left;
  font-size: 12px;
  color: var(--ui-text, #111827);
  cursor: pointer;
  transition: background 0.1s;
}

.viewport-menu__item:hover {
  background: var(--ui-bg-muted, rgba(59, 130, 246, 0.08));
}

.viewport-menu__item--active {
  background: var(--ui-primary, #3b82f6);
  color: #ffffff;
}

.viewport-menu__item--active .viewport-menu__icon,
.viewport-menu__item--active .viewport-menu__width {
  color: #ffffff;
}

.viewport-menu__icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--ui-text-muted, #6b7280);
}

.viewport-menu__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewport-menu__width {
  flex-shrink: 0;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ui-text-muted, #6b7280);
}

.viewport-menu__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--ui-border, #e5e7eb);
}

.viewport-menu__custom {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}

.viewport-menu__input-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 1 1 auto;
}

.viewport-menu__input {
  width: 100%;
  height: 24px;
  padding: 0 22px 0 6px;
  border-radius: 5px;
  border: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ui-text, #111827);
  text-align: right;
}

.viewport-menu__input:focus {
  outline: none;
  border-color: var(--ui-primary, #3b82f6);
}

.viewport-menu__input::-webkit-outer-spin-button,
.viewport-menu__input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.viewport-menu__input[type='number'] {
  -moz-appearance: textfield;
}

.viewport-menu__input-suffix {
  position: absolute;
  right: 6px;
  font-size: 10px;
  color: var(--ui-text-muted, #9ca3af);
  pointer-events: none;
}

.viewport-menu__apply {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: var(--ui-primary, #3b82f6);
  color: #ffffff;
  cursor: pointer;
  transition: background 0.15s;
}

.viewport-menu__apply:hover {
  background: #2563eb;
}

.viewport-menu__apply :deep(svg) {
  width: 14px;
  height: 14px;
}

/* ==================== Рамка эмуляции ==================== */

.viewport-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  position: relative;
}

.viewport-frame--bounded {
  padding: 24px 16px;
}

.viewport-frame__screen {
  transition: width 0.2s ease, max-width 0.2s ease;
  position: relative;
}

.viewport-frame__screen--bounded::before,
.viewport-frame__screen--bounded::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 2px dashed var(--ui-border, #a5acb5);
  pointer-events: none;
}

.viewport-frame__screen--bounded::before {
  left: 0;
}

.viewport-frame__screen--bounded::after {
  right: 0;
}

.viewport-frame__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--ui-bg-elevated, #f9fafb);
  border: 1px solid var(--ui-border, #e5e7eb);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ui-text-muted, #6b7280);
  pointer-events: none;
  user-select: none;
}

.viewport-frame__label-icon {
  width: 12px;
  height: 12px;
  opacity: 0.7;
}
</style>
