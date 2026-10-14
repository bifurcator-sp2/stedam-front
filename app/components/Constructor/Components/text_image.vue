<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, toRaw } from 'vue'
import { MasonryWall } from '@yeger/vue-masonry-wall'
import type { FilesListResponse } from '~/types/files'

// ==================== Модель ====================
const value = defineModel<[]>({ default: () => [] })

const props = withDefaults(defineProps<{
  mode?: 'form' | 'body'
  id?: number
  allowDragAndDrop?: boolean
  showToDeleteImages?: boolean
  /** Готовые изображения (для рендера блока без API — например, в уроке) */
  initialImages?: any[]
  modelName?: string | null
}>(), {
  allowDragAndDrop: true,
  showToDeleteImages: false,
  initialImages: () => [],
  modelName: 'blocks',
})

// ==================== Общие утилиты ====================

import { useFormula } from '~/composables/useFormula'
import type { InlineEditBinding } from '~/directives/inlineEdit'

const { renderFormulas } = useFormula()

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number = min
): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.round(n), min), max)
}

function getDefault(blocks: any[] | undefined, path: string): string {
  let list: any[] | undefined = blocks
  let found: any | undefined
  for (const key of path.split('.')) {
    found = list?.find((b: any) => b.key === key)
    if (!found) return ''
    list = found.children
  }
  return found?.default ?? ''
}

function setDefault(
  blocks: any[] | undefined,
  path: string,
  newValue: unknown,
): boolean {
  if (!blocks) return false

  const keys = path.split('.')
  const last = keys.pop()
  if (!last) return false

  let current: any[] | undefined = blocks
  let parent: any | undefined

  for (const key of keys) {
    parent = current?.find((b: any) => b.key === key)
    if (!parent) return false
    current = parent.children
  }

  const target = current?.find((b: any) => b.key === last)
  if (!target) return false

  target.default = newValue
  return true
}

function toPx(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return `${n * 4}px`
}

function toPxBorder(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return `${n}px`
}

function toPxRadius(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return `${n * 4}px`
}

function paddingStyle(settings: Record<string, any>): Record<string, string> {
  const s: Record<string, string> = {}
  const map = {
    'padding-top': 'paddingTop',
    'padding-right': 'paddingRight',
    'padding-bottom': 'paddingBottom',
    'padding-left': 'paddingLeft',
  } as const

  for (const [jsonKey, cssKey] of Object.entries(map)) {
    const px = toPx(settings[jsonKey])
    if (px) s[cssKey] = px
  }
  return s
}

function marginStyle(settings: Record<string, any>): Record<string, string> {
  const s: Record<string, string> = {}
  const map = {
    'margin-top': 'marginTop',
    'margin-right': 'marginRight',
    'margin-bottom': 'marginBottom',
    'margin-left': 'marginLeft',
  } as const

  for (const [jsonKey, cssKey] of Object.entries(map)) {
    const px = toPx(settings[jsonKey])
    if (px) s[cssKey] = px
  }
  return s
}

function resolveBgVar(settingPath: string): string | null {
  const v = getDefault(value.value, settingPath)
  const name = typeof v === 'string' ? v.replace(/^bg-/, '') : ''
  return name ? `--bg-${name}` : null
}

function resolveBorderColor(
  colorRaw: string,
  bgVar: string | null,
): string | undefined {
  if (typeof colorRaw !== 'string' || !colorRaw) return undefined

  const name = colorRaw.replace(/^border-/, '')

  if (name === 'inherit') {
    return bgVar ? `var(${bgVar})` : 'transparent'
  }

  if (!name) return undefined

  return `var(--border-${name})`
}

function borderStyle(
  settings: Record<string, any>,
  bgVar: string | null = null,
): Record<string, string> {
  const s: Record<string, string> = {}

  const color = resolveBorderColor(settings['color'], bgVar)
  if (color) {
    s.borderColor = color
    s.borderStyle = 'solid'
  }

  const map = {
    top: 'borderTopWidth',
    right: 'borderRightWidth',
    bottom: 'borderBottomWidth',
    left: 'borderLeftWidth',
  } as const

  for (const [jsonKey, cssKey] of Object.entries(map)) {
    const px = toPxBorder(settings[jsonKey])
    if (px) s[cssKey] = px
  }

  return s
}

function radiusStyle(settings: Record<string, any> | undefined): Record<string, string> {
  if (!settings) return {}
  const s: Record<string, string> = {}
  const map = {
    'top-left': 'borderTopLeftRadius',
    'top-right': 'borderTopRightRadius',
    'bottom-right': 'borderBottomRightRadius',
    'bottom-left': 'borderBottomLeftRadius',
  } as const

  for (const [jsonKey, cssKey] of Object.entries(map)) {
    const px = toPxRadius(settings[jsonKey])
    if (px) s[cssKey] = px
  }

  return s
}

function collectBorderStyle(
  borderPath: string,
  radiusPath: string,
  bgVar: string | null = null,
): Record<string, string> {
  const border: Record<string, any> = {
    color: getDefault(value.value, `${borderPath}.color`),
    top: getDefault(value.value, `${borderPath}.top`),
    right: getDefault(value.value, `${borderPath}.right`),
    bottom: getDefault(value.value, `${borderPath}.bottom`),
    left: getDefault(value.value, `${borderPath}.left`),
  }
  const radius: Record<string, any> = {
    'top-left': getDefault(value.value, `${radiusPath}.top-left`),
    'top-right': getDefault(value.value, `${radiusPath}.top-right`),
    'bottom-right': getDefault(value.value, `${radiusPath}.bottom-right`),
    'bottom-left': getDefault(value.value, `${radiusPath}.bottom-left`),
  }
  return { ...borderStyle(border, bgVar), ...radiusStyle(radius) }
}

function collectPaddingStyle(basePath: string): Record<string, string> {
  return paddingStyle({
    'padding-top': getDefault(value.value, `${basePath}.top`),
    'padding-right': getDefault(value.value, `${basePath}.right`),
    'padding-bottom': getDefault(value.value, `${basePath}.bottom`),
    'padding-left': getDefault(value.value, `${basePath}.left`),
  })
}

function collectMarginStyle(basePath: string): Record<string, string> {
  return marginStyle({
    'margin-top': getDefault(value.value, `${basePath}.top`),
    'margin-right': getDefault(value.value, `${basePath}.right`),
    'margin-bottom': getDefault(value.value, `${basePath}.bottom`),
    'margin-left': getDefault(value.value, `${basePath}.left`),
  })
}

// ==================== Layout ====================
const layout = computed(() => getDefault(value.value, 'layout'))
const needDisplayImage = computed(() => layout.value !== 'text')
const needDisplayText = computed(() => layout.value !== 'image')

const layoutClass = computed(
  () =>
    ({
      'text': ' ',
      'image': ' ',
      'text-right': 'flex-row',
      'text-left': 'flex-row-reverse',
      'text-top': 'flex-col-reverse',
      'text-bottom': 'flex-col',
    }[layout.value ?? 'text-left'])
)

const layoutBcgStyle = computed(() => {
  const style: Record<string, string> = {}

  const v = getDefault(value.value, 'background-color')
  const name = v?.replace(/^bg-/, '')
  if (name) {
    style.backgroundColor = `var(--bg-${name})`
  }

  const bgImageNode = (value.value as any[] | undefined)
    ?.find((b: any) => b.key === 'background-image')

  const bgImage = Array.isArray(bgImageNode?.default)
    ? bgImageNode.default[0]
    : null

  const bgUrl = bgImage?.url ?? null

  if (bgUrl) {
    style.backgroundImage = `url(${bgUrl})`

    const bgSize = getDefault(value.value, 'background-size')
    const bgPosition = getDefault(value.value, 'background-position')

    if (bgSize) {
      style.backgroundSize = bgSize
    }
    if (bgPosition) {
      style.backgroundPosition = bgPosition
    }

    style.backgroundRepeat = 'no-repeat'
  }

  return style
})

const layoutBorderStyle = computed(() =>
  collectBorderStyle(
    'border',
    'border.radius',
    resolveBgVar('background-color'),
  )
)

const layoutMarginStyle = computed(() => collectMarginStyle('margin'))
const layoutPaddingStyle = computed(() => collectPaddingStyle('padding'))

// ==================== Пропорции текст / картинки ====================
const cols = 24
const textPercent = computed(() => Number(getDefault(value.value, 'text.cols')) / cols)
const imagesPercent = computed(() => clamp(1 - textPercent.value, 0, 1))

// ==================== Text ====================
type TextFieldKey = 'title' | 'summary' | 'text'

const textFieldKeys: TextFieldKey[] = ['title', 'summary', 'text']

const previewTitle = computed(() => getDefault(value.value, 'text.title'))
const previewSummary = computed(() => getDefault(value.value, 'text.summary'))
const previewText = computed(() => getDefault(value.value, 'text.text'))

const textBcgStyle = computed(() => {
  const v = getDefault(value.value, 'text.background-color')
  const name = v?.replace(/^bg-/, '')
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})

const textPaddingStyle = computed(() => collectPaddingStyle('text.padding'))
const textMarginStyle = computed(() => collectMarginStyle('text.margin'))

const textBorderStyle = computed(() =>
  collectBorderStyle(
    'text.border',
    'text.border.radius',
    resolveBgVar('text.background-color'),
  )
)

const textBlockStyle = computed(() => ({
  flex: `0 0 ${textPercent.value * 100}%`,
  ...textPaddingStyle.value,
  ...textMarginStyle.value,
}))

const textOnlyAlignStyle = computed(() => {
  if (needDisplayImage.value) return {}
  const pos = getDefault(value.value, 'text.text-block-position')
  if (pos === 'flex-start' || pos === 'center' || pos === 'flex-end') {
    return { justifyContent: pos }
  }
  return { justifyContent: 'center' }
})

const imagesOnlyAlignStyle = computed(() => {
  if (needDisplayText.value) return {}
  const pos = getDefault(value.value, 'images.images-block-position')
  if (pos === 'flex-start' || pos === 'center' || pos === 'flex-end') {
    return { justifyContent: pos }
  }
  return { justifyContent: 'center' }
})

function textFieldMeta(field: TextFieldKey) {
  const settingsPath = `text.${field}-settings`

  const containerRaw = getDefault(value.value, `${settingsPath}.container`)
  const container = containerRaw || 'ProseP'

  const sizeRaw = getDefault(value.value, `${settingsPath}.text-size`)
  const sizeClass = sizeRaw ? ` ${sizeRaw} ` : ' '

  const alignRaw = getDefault(value.value, `${settingsPath}.text-block-align`)
  const alignClass = alignRaw ? `text-${alignRaw}` : ''

  const colsValue = clampInt(
    getDefault(value.value, `${settingsPath}.text-cols`),
    1, 4, 1
  )

  return {
    container,
    sizeClass,
    alignClass,
    colsValue,
  }
}

const titleMeta = computed(() => textFieldMeta('title'))
const summaryMeta = computed(() => textFieldMeta('summary'))
const textMeta = computed(() => textFieldMeta('text'))

const visibleTextFields = computed(() => {
  const map: Record<TextFieldKey, boolean> = {
    title: !!previewTitle.value,
    summary: !!previewSummary.value,
    text: !!previewText.value,
  }
  return textFieldKeys
    .filter((k) => map[k])
    .map((k) => ({
      key: k,
      meta:
        k === 'title' ? titleMeta.value :
          k === 'summary' ? summaryMeta.value :
            textMeta.value,
    }))
})

const inlineBindings = computed<Record<TextFieldKey, InlineEditBinding>>(() => ({
  title: {
    get: () => previewTitle.value,
    set: (v: string) => commitField('title', v),
    renderFormulas,
  },
  summary: {
    get: () => previewSummary.value,
    set: (v: string) => commitField('summary', v),
    renderFormulas,
  },
  text: {
    get: () => previewText.value,
    set: (v: string) => commitField('text', v),
    renderFormulas,
  },
}))

function commitText(path: string, v: string) {
  const arr = value.value as any[] | undefined
  if (!arr) return

  const prev = getDefault(arr, path)
  if (prev === v) return

  setDefault(arr, path, v)
}

function commitField(field: TextFieldKey, v: string) {
  commitText(`text.${field}`, v)
}

// ==================== Images ====================
const imagesBcgStyle = computed(() => {
  const v = getDefault(value.value, 'images.background-color')
  const name = v?.replace(/^bg-/, '')
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})

const imagesBorderStyle = computed(() =>
  collectBorderStyle(
    'images.border',
    'images.border.radius',
    resolveBgVar('images.background-color'),
  )
)

const imageBorderStyle = computed(() =>
  collectBorderStyle(
    'images.image-border',
    'images.image-border.radius',
    resolveBgVar('images.background-color'),
  )
)

const imageOutlineStyle = computed(() => {
  const widthRaw = getDefault(value.value, 'images.image-outline')
  const colorRaw = getDefault(value.value, 'images.image-outline-color')

  const width = Number(widthRaw)
  if (!Number.isFinite(width) || width <= 0) return {}

  const style: Record<string, string> = {
    outlineStyle: 'solid',
    outlineWidth: `${width}px`,
    outlineOffset: '0px',
  }

  const color = resolveBorderColor(
    colorRaw,
    resolveBgVar('images.background-color'),
  )
  if (color) {
    style.outlineColor = color
  }

  return style
})

const imagesPaddingStyle = computed(() => collectPaddingStyle('images.padding'))
const imagesMarginStyle = computed(() => collectMarginStyle('images.margin'))

const imagesCount = computed(() => {
  const raw = getDefault(value.value, 'images.count')
  const n = Number(raw)
  if (!Number.isFinite(n)) return -1
  return Math.trunc(n)
})

const columns = computed(() =>
  clampInt(getDefault(value.value, 'images.columns'), 0, 6, 1)
)

const distance = computed(() =>
  clampInt(getDefault(value.value, 'images.distance'), 0, 6, 1)
)

const distancePx = computed(() => {
  const v = Number(getDefault(value.value, 'images.distance'))
  if (!Number.isFinite(v) || v < 0) return 16
  return v * 4
})

const imagesFlexDirection = computed(() => {
  const v = getDefault(value.value, 'images.flex-direction')
  if (v === 'column') return 'column'
  if (v === 'masonry') return 'masonry'
  return 'row'
})

const isMasonry = computed(() => imagesFlexDirection.value === 'masonry')

const imageHeightPx = computed(() => {
  const v = Number(getDefault(value.value, 'images.image-height'))
  return Number.isFinite(v) && v > 0 ? v : 200
})

const imageFitClass = computed(() => {
  const v = getDefault(value.value, 'images.image-size-strategy')
  return (
    ({
      'fill': 'object-fill',
      'contain': 'object-contain',
      'cover': 'object-cover',
      'none': 'object-none',
      'scale-down': 'object-scale-down',
    } as Record<string, string>)[v] ?? 'object-contain'
  )
})

const imagesContainerClass = computed(() => {
  if (isMasonry.value) return ''
  if (imagesFlexDirection.value === 'column') return 'images-columns'
  return 'flex flex-row flex-wrap'
})

const imagesContainerStyle = computed(() => {
  const base: Record<string, string> = {
    flex: `0 0 ${imagesPercent.value * 100}%`,
    ...imagesPaddingStyle.value,
    ...imagesMarginStyle.value,
  }

  if (imagesFlexDirection.value === 'column') {
    base.display = 'block'
    base.columnCount = String(Math.max(1, columns.value))
    base.columnGap = `${distancePx.value}px`
  } else if (imagesFlexDirection.value === 'row') {
    base.display = 'flex'
    base.flexWrap = 'wrap'
    base.gap = `${distancePx.value}px`
  }

  return base
})

const imageItemClass = computed(() => {
  if (isMasonry.value) {
    return 'w-full h-auto block'
  }
  if (imagesFlexDirection.value === 'column') {
    return 'image-column-item'
  }
  return `w-auto ${imageFitClass.value}`
})

const imageItemStyle = computed(() => {
  if (isMasonry.value) return {}

  if (imagesFlexDirection.value === 'column') {
    return {
      boxSizing: 'border-box',
      display: 'block',
      width: '100%',
      minWidth: 0,
      marginBottom: `${distancePx.value}px`,
    }
  }

  return {
    boxSizing: 'border-box',
    height: `${imageHeightPx.value}px`,
    width: 'auto',
  }
})

const imageImgStyle = computed(() => {
  if (imagesFlexDirection.value === 'column' && !isMasonry.value) {
    return {
      display: 'block',
      boxSizing: 'border-box',
      width: '100%',
      height: 'auto',
      maxWidth: '100%',
    } as Record<string, string>
  }
  return {
    display: 'block',
    boxSizing: 'border-box',
    maxWidth: '100%',
    height: '100%',
  } as Record<string, string>
})

const masonryColumnWidth = computed(() => 200)

// ==================== Files model ====================

const filesModel = ref<FilesListResponse>({
  images: [],
  files: [],
  temp: { images: [], files: [] },
  stored: { images: [], files: [] },
})

const fileContainerRef = ref<InstanceType<typeof FileContainer> | null>(null)

/**
 * Готовые файлы для FileContainer.
 * Преобразуем props.initialImages в структуру FilesListResponse.
 *
 * ВАЖНО: используем toRaw, чтобы снять Vue-Proxy с реактивных объектов.
 * structuredClone на Proxy падает с DataCloneError, поэтому используем
 * ручное поверхностное копирование.
 */
const formattedInitialFiles = computed<FilesListResponse | null>(() => {
  const imgs = props.initialImages
  if (!Array.isArray(imgs) || imgs.length === 0) {
    return null
  }

  const raw = toRaw(imgs)
  const images = raw.map((i: any) => ({ ...toRaw(i) }))

  return {
    images,
    files: [],
    temp: { images: [], files: [] },
    stored: { images, files: [] },
  }
})

// ==================== Emit ====================

const emit = defineEmits<{
  (e: 'register-files', inst: InstanceType<typeof FileContainer> | null): void
}>()

onMounted(() => emit('register-files', fileContainerRef.value))

// ==================== FileContainer: hover-панель ====================

const rootRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

/** Показывать FileContainer: по ховеру на text_image или во время drag-over. */
const showFilePanel = ref(false)
const isFileDragOver = ref(false)

/** Координаты панели (position: fixed) — top, left, width. */
const panelTop = ref(0)
const panelLeft = ref(0)
const panelWidth = ref(0)

let hoverTimer: ReturnType<typeof setTimeout> | null = null
let rafId: number | null = null

/**
 * Считает позицию панели по getBoundingClientRect корневого элемента.
 * Панель растёт вверх от rect.top — за это отвечает transform: translateY(-100%).
 * Прозрачный зазор между панелью и блоком реализован padding-bottom
 * у самой панели, поэтому нижняя граница bounding rect панели примыкает
 * к верхней границе блока, и мёртвой зоны для ховера нет.
 */
function computePanelRect() {
  const root = rootRef.value
  if (!root) return

  const rect = root.getBoundingClientRect()
  panelWidth.value = rect.width
  panelLeft.value = rect.left
  panelTop.value = rect.top
}

function scheduleRectUpdate() {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    if (showFilePanel.value) computePanelRect()
  })
}

function onRootEnter() {
  if (hoverTimer) clearTimeout(hoverTimer)
  // небольшая задержка, чтобы панель не мигала при быстром проходе мыши
  hoverTimer = setTimeout(() => {
    computePanelRect()
    showFilePanel.value = true
  }, 150)
}

function onRootLeave() {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  // не скрываем, если идёт drag файла — иначе нельзя будет бросить
  if (!isFileDragOver.value) {
    showFilePanel.value = false
  }
}

function onRootDragEnter(e: DragEvent) {
  const dt = e.dataTransfer
  if (!dt) return
  if (!Array.from(dt.types).includes('Files')) return
  isFileDragOver.value = true
  computePanelRect()
  showFilePanel.value = true
}

function onRootDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Node | null
  const root = rootRef.value
  const panel = panelRef.value

  if (panel && related && panel.contains(related)) return
  if (root && related && root.contains(related)) return

  isFileDragOver.value = false
  if (!root?.matches(':hover') && !panel?.matches(':hover')) {
    showFilePanel.value = false
  }
}

/**
 * mouseleave на корне. Панель в body (Teleport), поэтому relatedTarget
 * может указывать на неё — учитываем это и не скрываем панель.
 */
function onRootMouseLeave(e: MouseEvent) {
  const related = e.relatedTarget as Node | null
  const panel = panelRef.value

  if (panel && related && panel.contains(related)) return

  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  if (!isFileDragOver.value) {
    showFilePanel.value = false
  }
}

function onPanelMouseLeave(e: MouseEvent) {
  const related = e.relatedTarget as Node | null
  const root = rootRef.value
  const panel = panelRef.value

  if (panel && related && panel.contains(related)) return
  if (root && related && root.contains(related)) return

  if (!isFileDragOver.value) {
    showFilePanel.value = false
  }
}

function onPanelDragEnter() {
  isFileDragOver.value = true
  showFilePanel.value = true
}

function onPanelDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Node | null
  const root = rootRef.value
  const panel = panelRef.value

  if (panel && related && panel.contains(related)) return
  if (root && related && root.contains(related)) return

  isFileDragOver.value = false
  if (!root?.matches(':hover') && !panel?.matches(':hover')) {
    showFilePanel.value = false
  }
}

// ==================== Отслеживание позиции при скролле/ресайзе ====================

function onScrollOrResize() {
  if (showFilePanel.value) scheduleRectUpdate()
}

// ==================== Lifecycle хуков для hover-панели ====================

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
  if (hoverTimer) clearTimeout(hoverTimer)
  if (rafId !== null) cancelAnimationFrame(rafId)
  emit('register-files', null)
})

// ==================== Reorder ====================

const draggingIndex = ref<number | null>(null)

function onImageDragStart(index: number) {
  draggingIndex.value = index
}

function onImageDragEnd() {
  draggingIndex.value = null
}

function onDropBefore(from: number, beforeIndex: number) {
  const imgs = filesModel.value.images
  if (from < 0 || from >= imgs.length) return

  let to = beforeIndex
  if (from < beforeIndex) {
    to = beforeIndex - 1
  }

  if (to === from) return
  if (to < 0 || to >= imgs.length) return

  const next = imgs.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)

  filesModel.value = { ...filesModel.value, images: next }
}

function onDropAfter(from: number, afterIndex: number) {
  const imgs = filesModel.value.images
  if (from < 0 || from >= imgs.length) return

  let to = afterIndex + 1
  if (from < to) {
    to = to - 1
  }

  if (to === from) return
  if (to < 0 || to > imgs.length) return

  const next = imgs.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)

  filesModel.value = { ...filesModel.value, images: next }
}

const masonryKey = computed(() => {
  return JSON.stringify({
    columns: columns.value,
    distance: distancePx.value,
    width: masonryColumnWidth.value,
    count: filesModel.value.images.length,
    urls: filesModel.value.images.map(i => i.url).join('|'),
  })
})
</script>

<template>
  <ConstructorBlockLayout :mode="props.mode ?? 'body'">
    <template #form>
      <div>Тут ничего нет еще</div>
    </template>

    <template #body>
      <div
        ref="rootRef"
        class="text-image-root"
        @mouseenter="onRootEnter"
        @mouseleave="onRootMouseLeave"
        @dragenter.prevent="onRootDragEnter"
        @dragover.prevent
        @dragleave="onRootDragLeave"
      >
        <!-- FileContainer как всплывающая панель над всем (Teleport в body) -->
        <Teleport to="body">
          <Transition name="file-panel-fade">
            <div
              v-show="showFilePanel"
              ref="panelRef"
              class="file-panel"
              :style="{
                top: panelTop + 'px',
                left: panelLeft + 'px',
                width: panelWidth + 'px',
              }"
              @mouseleave="onPanelMouseLeave"
              @dragenter.prevent="onPanelDragEnter"
              @dragover.prevent
              @dragleave="onPanelDragLeave"
            >
              <div class="file-panel__inner">
                <FileContainer
                  ref="fileContainerRef"
                  :model-name="modelName"
                  :model-id="id"
                  file-type="image"
                  :max-images="imagesCount"
                  :show-to-delete-images="showToDeleteImages"
                  :initial-files="formattedInitialFiles"
                  v-model:files="filesModel"
                />
              </div>
            </div>
          </Transition>
        </Teleport>

        <div :style="[layoutMarginStyle]">
          <div
            :style="[
              layoutBcgStyle,
              layoutBorderStyle,
              layoutPaddingStyle,
              textOnlyAlignStyle,
              imagesOnlyAlignStyle,
            ]"
            :class="[
              'flex',
              'items-start',
              layoutClass,
            ]"
          >
            <div v-if="needDisplayImage" :style="{ flex: `0 0 ${imagesPercent * 100}%` }">
              <MasonryWall
                v-if="isMasonry"
                :items="filesModel.images"
                :column-width="masonryColumnWidth"
                :gap="distancePx"
                :min-columns="columns"
                :max-columns="columns"
                :ssr-columns="columns"
                :key="masonryKey"
              >
                <template #default="{ item }">
                  <ImageWrapper
                    :item="item"
                    :siblings="filesModel.images"
                    :allow-drag-and-drop="allowDragAndDrop"
                    :show-to-delete="showToDeleteImages"
                    :dragging-index="draggingIndex"
                    @drag-start="onImageDragStart"
                    @drag-end="onImageDragEnd"
                    @remove="fileContainerRef?.removeFile($event)"
                    @restore="fileContainerRef?.restoreFile($event)"
                    @drop-before="onDropBefore"
                    @drop-after="onDropAfter"
                    :class="imageItemClass"
                    :style="[imageItemStyle]"
                  >
                    <img
                      :src="item.url"
                      :style="[imageImgStyle, imageBorderStyle, imageOutlineStyle]"
                    />
                  </ImageWrapper>
                </template>
              </MasonryWall>

              <div
                v-else
                :class="[imagesContainerClass]"
                :style="[imagesContainerStyle, imagesBcgStyle, imagesBorderStyle]"
              >
                <ImageWrapper
                  v-for="(img, idx) in filesModel.images"
                  :key="img.url ?? idx"
                  :item="img"
                  :siblings="filesModel.images"
                  :allow-drag-and-drop="allowDragAndDrop"
                  :show-to-delete="showToDeleteImages"
                  :dragging-index="draggingIndex"
                  @drag-start="onImageDragStart"
                  @drag-end="onImageDragEnd"
                  @remove="fileContainerRef?.removeFile($event)"
                  @restore="fileContainerRef?.restoreFile($event)"
                  @drop-before="onDropBefore"
                  @drop-after="onDropAfter"
                  :class="imageItemClass"
                  :style="[imageItemStyle]"
                >
                  <img
                    :src="img.url"
                    :style="[imageImgStyle, imageBorderStyle, imageOutlineStyle]"
                  />
                </ImageWrapper>
              </div>
            </div>
            <div
              v-if="needDisplayText"
              :style="[textBlockStyle, textBcgStyle, textBorderStyle]"
            >
              <component
                v-for="field in visibleTextFields"
                :key="field.key"
                :is="field.meta.container"
                :style="{ columnCount: field.meta.colsValue }"
                :class="[field.meta.sizeClass, field.meta.alignClass, 'block-title-break']"
                v-inline-edit="inlineBindings[field.key]"
              ></component>
            </div>
          </div>
        </div>
      </div>
    </template>
  </ConstructorBlockLayout>
</template>

<style scoped>
img:last-child {
  margin-bottom: 0;
}

.block-title-break,
.block-title-break :deep(*) {
  overflow-wrap: anywhere;
  word-break: break-word;
  hyphens: auto;
  min-width: 0;
}

.block-title-break.text-justify-all,
.block-title-break.text-justify-all :deep(*) {
  text-align: justify;
  text-align-last: justify;
}

.block-title-break.text-match-parent,
.block-title-break.text-match-parent :deep(*) {
  text-align: match-parent;
}

/*
  Multi-column контейнер для изображений (режим "column").
  Работает одинаково в Chrome и Firefox: картинки распределяются
  по колонкам, не разрезаясь между ними.
*/
.images-columns {
  column-fill: balance;
  -webkit-column-fill: balance;
}

/*
  Элемент-обёртка одной картинки внутри multi-column.
  width: 100% в multi-column = ширина колонки, поэтому маленькие
  изображения растягиваются до ширины соседей.
*/
.image-column-item {
  break-inside: avoid;
  -webkit-column-break-inside: avoid;
  page-break-inside: avoid;
  display: block;
  width: 100%;
  min-width: 0;
}

/* Дополнительная страховка: сама картинка на всю ширину обёртки */
.image-column-item > img {
  display: block;
  width: 100%;
  height: auto;
  max-width: 100%;
}

/* ==================== FileContainer: hover-панель ==================== */

.text-image-root {
  position: relative;
}

/*
  Панель вынесена в <body> через Teleport. position: fixed,
  координаты top/left/width — инлайн из getBoundingClientRect.
  Никакой родитель не может её обрезать.

  transform: translateY(-100%) поднимает панель над блоком.

  padding-bottom: 6px — прозрачный «мостик» между панелью и блоком.
  Он ЧАСТЬ панели: нижняя граница bounding rect панели примыкает к блоку,
  значит при переходе мыши из блока в панель нет мёртвой зоны.

  Визуально фон/бордер/тень — у .file-panel__inner, поэтому зазор виден.
*/
.file-panel {
  position: fixed;
  z-index: 9999;
  transform: translateY(-100%);
  padding-bottom: 6px;
}

.file-panel__inner {
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 10px;
  padding: 10px;
  box-shadow:
    0 10px 30px rgba(15, 23, 42, 0.12),
    0 2px 8px rgba(15, 23, 42, 0.06);
}

.file-panel-fade-enter-active,
.file-panel-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.file-panel-fade-enter-from,
.file-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(calc(-100% + 4px));
}
</style>
