<!-- components/Constructor/ContentTypes/gallery.vue -->
<script setup lang="ts">
import { computed, ref, watch, toRaw } from 'vue'
import { MasonryWall } from '@yeger/vue-masonry-wall'
import type { ImageItem } from '~/types/files'
import type { SettingNode } from '~/utils/constructors'

const props = withDefaults(defineProps<{
  gallery: SettingNode
  settings?: SettingNode | null
  stylePath?: string
  fallbackStylePath?: string | null
  allowDragAndDrop?: boolean
  showToDeleteImages?: boolean
}>(), {
  settings: null,
  stylePath: 'images',
  fallbackStylePath: null,
  allowDragAndDrop: true,
  showToDeleteImages: false,
})

// ==================== Резолв путей ====================

function resolvePath(root: any, path: string): any {
  if (root == null || !path) return undefined

  // Поддержка единичного корневого узла (SettingNode) — разворачиваем в список
  if (!Array.isArray(root) && typeof root === 'object' && 'key' in root) {
    root = [root]
  }

  const parts = path.split('.')
  let current = root

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (current == null) return undefined
    const isLast = i === parts.length - 1

    if (Array.isArray(current)) {
      const found = current.find((it: any) => it?.key === part)
      if (!found) return undefined
      if (isLast) return found.default
      current = found
    } else if (typeof current === 'object') {
      if (part in current) {
        current = current[part]
      } else if (Array.isArray(current.children)) {
        const found = current.children.find((it: any) => it?.key === part)
        if (!found) return undefined
        if (isLast) return found.default
        current = found
      } else {
        return undefined
      }
    } else {
      return undefined
    }
  }
  return current
}

function styleGet(key: string): any {
  const primary = resolvePath(props.settings, `${props.stylePath}.${key}`)
  if (primary !== undefined) return primary
  if (props.fallbackStylePath) {
    return resolvePath(props.settings, `${props.fallbackStylePath}.${key}`)
  }
  return undefined
}

function clampInt(value: unknown, min: number, max: number, fallback: number = min): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.round(n), min), max)
}
function toPx(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return `${n * 4}px`
}
function toPxBorder(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return `${n}px`
}
function toPxRadius(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return `${n * 4}px`
}
function resolveBgVar(settingKey: string): string | null {
  const v = styleGet(settingKey)
  const name = typeof v === 'string' ? v.replace(/^bg-/, '') : ''
  return name ? `--bg-${name}` : null
}
function resolveBorderColor(colorRaw: unknown, bgVar: string | null): string | undefined {
  if (typeof colorRaw !== 'string' || !colorRaw) return undefined
  const name = colorRaw.replace(/^border-/, '')
  if (name === 'inherit') return bgVar ? `var(${bgVar})` : 'transparent'
  if (!name) return undefined
  return `var(--border-${name})`
}
function paddingStyleOf(): Record<string, string> {
  const s: Record<string, string> = {}
  const map = { top: 'paddingTop', right: 'paddingRight', bottom: 'paddingBottom', left: 'paddingLeft' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = toPx(styleGet(`padding.${side}`))
    if (px) s[cssKey] = px
  }
  return s
}
function marginStyleOf(): Record<string, string> {
  const s: Record<string, string> = {}
  const map = { top: 'marginTop', right: 'marginRight', bottom: 'marginBottom', left: 'marginLeft' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = toPx(styleGet(`margin.${side}`))
    if (px) s[cssKey] = px
  }
  return s
}
function borderStyleOf(borderKey: string, bgVar: string | null): Record<string, string> {
  const s: Record<string, string> = {}
  const color = resolveBorderColor(styleGet(`${borderKey}.color`), bgVar)
  if (color) {
    s.borderColor = color
    s.borderStyle = 'solid'
  }
  const map = { top: 'borderTopWidth', right: 'borderRightWidth', bottom: 'borderBottomWidth', left: 'borderLeftWidth' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = toPxBorder(styleGet(`${borderKey}.${side}`))
    if (px) s[cssKey] = px
  }
  return s
}
function radiusStyleOf(radiusKey: string): Record<string, string> {
  const s: Record<string, string> = {}
  const map = { 'top-left': 'borderTopLeftRadius', 'top-right': 'borderTopRightRadius', 'bottom-right': 'borderBottomRightRadius', 'bottom-left': 'borderBottomLeftRadius' } as const
  for (const [corner, cssKey] of Object.entries(map)) {
    const px = toPxRadius(styleGet(`${radiusKey}.${corner}`))
    if (px) s[cssKey] = px
  }
  return s
}

// ==================== Вычисляемые стили ====================

const imagesBcgStyle = computed(() => {
  const v = styleGet('background-color')
  const name = typeof v === 'string' ? v.replace(/^bg-/, '') : ''
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})
const imagesBorderStyle = computed(() => ({
  ...borderStyleOf('border', resolveBgVar('background-color')),
  ...radiusStyleOf('border.radius'),
}))
const imageBorderStyle = computed(() => ({
  ...borderStyleOf('image-border', resolveBgVar('background-color')),
  ...radiusStyleOf('image-border.radius'),
}))
const imageOutlineStyle = computed(() => {
  const width = Number(styleGet('image-outline'))
  if (!Number.isFinite(width) || width <= 0) return {}
  const style: Record<string, string> = {
    outlineStyle: 'solid',
    outlineWidth: `${width}px`,
    outlineOffset: '0px',
  }
  const color = resolveBorderColor(styleGet('image-outline-color'), resolveBgVar('background-color'))
  if (color) style.outlineColor = color
  return style
})
const imagesPaddingStyle = computed(() => paddingStyleOf())
const imagesMarginStyle = computed(() => marginStyleOf())

// ==================== Layout ====================

const columns = computed(() => clampInt(styleGet('columns'), 0, 6, 1))
const distancePx = computed(() => {
  const v = Number(styleGet('distance'))
  if (!Number.isFinite(v) || v < 0) return 16
  return v * 4
})
const flexDirection = computed<'row' | 'column' | 'masonry'>(() => {
  const v = styleGet('flex-direction')
  if (v === 'column') return 'column'
  if (v === 'masonry') return 'masonry'
  return 'row'
})
const isMasonry = computed(() => flexDirection.value === 'masonry')
const imageHeightPx = computed(() => {
  const v = Number(styleGet('image-height'))
  return Number.isFinite(v) && v > 0 ? v : 200
})
const imageFitClass = computed(() => {
  const v = styleGet('image-size-strategy')
  return ({ 'fill': 'object-fill', 'contain': 'object-contain', 'cover': 'object-cover', 'none': 'object-none', 'scale-down': 'object-scale-down' } as Record<string, string>)[v] ?? 'object-contain'
})
const imagesContainerClass = computed(() => {
  if (isMasonry.value) return ''
  if (flexDirection.value === 'column') return 'images-columns'
  return 'flex flex-row flex-wrap'
})
const imagesContainerStyle = computed(() => {
  const base: Record<string, string> = {}
  if (flexDirection.value === 'column') {
    base.display = 'block'
    base.columnCount = String(Math.max(1, columns.value))
    base.columnGap = `${distancePx.value}px`
  } else if (flexDirection.value === 'row') {
    base.display = 'flex'
    base.flexWrap = 'wrap'
    base.gap = `${distancePx.value}px`
  }
  return base
})
const imageItemClass = computed(() => {
  if (isMasonry.value) return 'w-full h-auto block'
  if (flexDirection.value === 'column') return 'image-column-item'
  return `w-auto ${imageFitClass.value}`
})
const imageItemStyle = computed(() => {
  if (isMasonry.value) return {}
  if (flexDirection.value === 'column') {
    return { boxSizing: 'border-box', display: 'block', width: '100%', minWidth: 0, marginBottom: `${distancePx.value}px` } as Record<string, string>
  }
  return { boxSizing: 'border-box', height: `${imageHeightPx.value}px`, width: 'auto' } as Record<string, string>
})
const imageImgStyle = computed(() => {
  if (flexDirection.value === 'column' && !isMasonry.value) {
    return { display: 'block', boxSizing: 'border-box', width: '100%', height: 'auto', maxWidth: '100%' } as Record<string, string>
  }
  return { display: 'block', boxSizing: 'border-box', maxWidth: '100%', height: '100%' } as Record<string, string>
})
const masonryColumnWidth = 200

// ==================== Локальная модель изображений ====================

const filesModel = ref<ImageItem[]>([])

function imagesEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => x?.url === b[i]?.url)
}

watch(
  () => props.gallery?.default,
  (val) => {
    let list: any[]
    if (Array.isArray(val)) list = val
    else if (val && Array.isArray((val as any).images)) list = (val as any).images
    else list = []

    if (imagesEqual(filesModel.value, list)) return

    const raw = toRaw(list)
    filesModel.value = raw.map((i: any) => ({ ...toRaw(i) }))
  },
  { immediate: true, deep: true },
)

watch(
  filesModel,
  (images) => {
    if (!props.gallery) return
    const current = Array.isArray(props.gallery.default) ? props.gallery.default : []
    if (imagesEqual(current, images)) return
    props.gallery.default = images
  },
  { deep: true },
)

// ==================== Drag & drop ====================

const draggingIndex = ref<number | null>(null)
function onImageDragStart(index: number) { draggingIndex.value = index }
function onImageDragEnd() { draggingIndex.value = null }
function onDropBefore(from: number, beforeIndex: number) {
  const imgs = filesModel.value
  if (from < 0 || from >= imgs.length) return
  let to = beforeIndex
  if (from < beforeIndex) to = beforeIndex - 1
  if (to === from) return
  if (to < 0 || to >= imgs.length) return
  const next = imgs.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  filesModel.value = next
}
function onDropAfter(from: number, afterIndex: number) {
  const imgs = filesModel.value
  if (from < 0 || from >= imgs.length) return
  let to = afterIndex + 1
  if (from < to) to = to - 1
  if (to === from) return
  if (to < 0 || to > imgs.length) return
  const next = imgs.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  filesModel.value = next
}
function onRemoveImage(item: ImageItem) {
  filesModel.value = filesModel.value.filter((i) => i.url !== item.url)
}
function onRestoreImage(item: ImageItem) {
  filesModel.value = filesModel.value.map((i) => i.url === item.url ? { ...i, toDelete: false } : i)
}

const masonryKey = computed(() => JSON.stringify({
  columns: columns.value,
  distance: distancePx.value,
  width: masonryColumnWidth,
  count: filesModel.value.length,
  urls: filesModel.value.map((i) => i.url).join('|'),
}))
</script>

<template>
  <div v-if="isMasonry" :style="[imagesBcgStyle, imagesBorderStyle, imagesPaddingStyle, imagesMarginStyle]">
    <MasonryWall :items="filesModel" :column-width="masonryColumnWidth" :gap="distancePx" :min-columns="columns" :max-columns="columns" :ssr-columns="columns" :key="masonryKey">
      <template #default="{ item }">
        <ImageWrapper :item="item" :siblings="filesModel" :allow-drag-and-drop="allowDragAndDrop" :show-to-delete="showToDeleteImages" :dragging-index="draggingIndex" @drag-start="onImageDragStart" @drag-end="onImageDragEnd" @drop-before="onDropBefore" @drop-after="onDropAfter" @remove="onRemoveImage" @restore="onRestoreImage" :class="imageItemClass" :style="[imageItemStyle]">
          <img :src="item.url" :style="[imageImgStyle, imageBorderStyle, imageOutlineStyle]" />
        </ImageWrapper>
      </template>
    </MasonryWall>
  </div>

  <div v-else :class="[imagesContainerClass]" :style="[imagesContainerStyle, imagesBcgStyle, imagesBorderStyle, imagesPaddingStyle, imagesMarginStyle]">
    <ImageWrapper v-for="(img, idx) in filesModel" :key="img.url ?? idx" :item="img" :siblings="filesModel" :allow-drag-and-drop="allowDragAndDrop" :show-to-delete-images="showToDeleteImages" :dragging-index="draggingIndex" @drag-start="onImageDragStart" @drag-end="onImageDragEnd" @drop-before="onDropBefore" @drop-after="onDropAfter" @remove="onRemoveImage" @restore="onRestoreImage" :class="imageItemClass" :style="[imageItemStyle]">
      <img :src="img.url" :style="[imageImgStyle, imageBorderStyle, imageOutlineStyle]" />
    </ImageWrapper>
  </div>
</template>

<style scoped>
.images-columns { column-fill: balance; -webkit-column-fill: balance; }
.image-column-item { break-inside: avoid; -webkit-column-break-inside: avoid; page-break-inside: avoid; display: block; width: 100%; min-width: 0; }
.image-column-item > img { display: block; width: 100%; height: auto; max-width: 100%; }
</style>
