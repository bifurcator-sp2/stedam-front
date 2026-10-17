<script setup lang="ts">
import { computed } from 'vue'
import { useFormula } from '~/composables/useFormula'
import type { InlineEditBinding } from '~/directives/inlineEdit'
import ImageGallery from '../ImageGallery.vue'

// ==================== Модель ====================

const value = defineModel<any[]>({ default: () => [] })

const props = withDefaults(defineProps<{
  mode?: 'form' | 'body'
  id?: number
  allowDragAndDrop?: boolean
  showToDeleteImages?: boolean
  initialImages?: any[]
  modelName?: string | null
}>(), {
  allowDragAndDrop: true,
  showToDeleteImages: false,
  initialImages: () => [],
  modelName: 'blocks',
})

// ==================== Утилиты ====================

const { renderFormulas } = useFormula()

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clampInt(value: unknown, min: number, max: number, fallback: number = min): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.round(n), min), max)
}

function getDefault(blocks: any[] | undefined, path: string): any {
  let list: any[] | undefined = blocks
  let found: any | undefined
  for (const key of path.split('.')) {
    found = list?.find((b: any) => b.key === key)
    if (!found) return undefined
    list = found.children
  }
  return found?.default
}

function setDefault(blocks: any[] | undefined, path: string, newValue: unknown): boolean {
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
  const map = { 'padding-top': 'paddingTop', 'padding-right': 'paddingRight', 'padding-bottom': 'paddingBottom', 'padding-left': 'paddingLeft' } as const
  for (const [jsonKey, cssKey] of Object.entries(map)) {
    const px = toPx(settings[jsonKey])
    if (px) s[cssKey] = px
  }
  return s
}

function marginStyle(settings: Record<string, any>): Record<string, string> {
  const s: Record<string, string> = {}
  const map = { 'margin-top': 'marginTop', 'margin-right': 'marginRight', 'margin-bottom': 'marginBottom', 'margin-left': 'marginLeft' } as const
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

function resolveBorderColor(colorRaw: string, bgVar: string | null): string | undefined {
  if (typeof colorRaw !== 'string' || !colorRaw) return undefined
  const name = colorRaw.replace(/^border-/, '')
  if (name === 'inherit') return bgVar ? `var(${bgVar})` : 'transparent'
  if (!name) return undefined
  return `var(--border-${name})`
}

function borderStyle(settings: Record<string, any>, bgVar: string | null = null): Record<string, string> {
  const s: Record<string, string> = {}
  const color = resolveBorderColor(settings['color'], bgVar)
  if (color) {
    s.borderColor = color
    s.borderStyle = 'solid'
  }
  const map = { top: 'borderTopWidth', right: 'borderRightWidth', bottom: 'borderBottomWidth', left: 'borderLeftWidth' } as const
  for (const [jsonKey, cssKey] of Object.entries(map)) {
    const px = toPxBorder(settings[jsonKey])
    if (px) s[cssKey] = px
  }
  return s
}

function radiusStyle(settings: Record<string, any> | undefined): Record<string, string> {
  if (!settings) return {}
  const s: Record<string, string> = {}
  const map = { 'top-left': 'borderTopLeftRadius', 'top-right': 'borderTopRightRadius', 'bottom-right': 'borderBottomRightRadius', 'bottom-left': 'borderBottomLeftRadius' } as const
  for (const [jsonKey, cssKey] of Object.entries(map)) {
    const px = toPxRadius(settings[jsonKey])
    if (px) s[cssKey] = px
  }
  return s
}

function collectBorderStyle(borderPath: string, radiusPath: string, bgVar: string | null = null): Record<string, string> {
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
  () => ({ 'text': ' ', 'image': ' ', 'text-right': 'flex-row', 'text-left': 'flex-row-reverse', 'text-top': 'flex-col-reverse', 'text-bottom': 'flex-col' }[layout.value ?? 'text-left'])
)

const layoutBcgStyle = computed(() => {
  const style: Record<string, string> = {}
  const v = getDefault(value.value, 'background-color')
  const name = typeof v === 'string' ? v.replace(/^bg-/, '') : ''
  if (name) style.backgroundColor = `var(--bg-${name})`

  const bgImageNode = (value.value as any[] | undefined)?.find((b: any) => b.key === 'background-image')
  const bgImage = Array.isArray(bgImageNode?.default) ? bgImageNode.default[0] : null
  const bgUrl = bgImage?.url ?? null

  if (bgUrl) {
    style.backgroundImage = `url(${bgUrl})`
    const bgSize = getDefault(value.value, 'background-size')
    const bgPosition = getDefault(value.value, 'background-position')
    if (bgSize) style.backgroundSize = bgSize
    if (bgPosition) style.backgroundPosition = bgPosition
    style.backgroundRepeat = 'no-repeat'
  }
  return style
})

const layoutBorderStyle = computed(() => collectBorderStyle('border', 'border.radius', resolveBgVar('background-color')))
const layoutMarginStyle = computed(() => collectMarginStyle('margin'))
const layoutPaddingStyle = computed(() => collectPaddingStyle('padding'))

// ==================== Пропорции ====================

const cols = 24
const textPercent = computed(() => Number(getDefault(value.value, 'text.cols')) / cols)
const imagesPercent = computed(() => clamp(1 - textPercent.value, 0, 1))

// ==================== Text ====================

type TextFieldKey = 'title' | 'summary' | 'text'
const textFieldKeys: TextFieldKey[] = ['title', 'summary', 'text']

const previewTitle = computed(() => getDefault(value.value, 'text.title') ?? '')
const previewSummary = computed(() => getDefault(value.value, 'text.summary') ?? '')
const previewText = computed(() => getDefault(value.value, 'text.text') ?? '')

const textBcgStyle = computed(() => {
  const v = getDefault(value.value, 'text.background-color')
  const name = typeof v === 'string' ? v.replace(/^bg-/, '') : ''
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})

const textPaddingStyle = computed(() => collectPaddingStyle('text.padding'))
const textMarginStyle = computed(() => collectMarginStyle('text.margin'))
const textBorderStyle = computed(() => collectBorderStyle('text.border', 'text.border.radius', resolveBgVar('text.background-color')))

const textBlockStyle = computed(() => ({
  flex: `0 0 ${textPercent.value * 100}%`,
  ...textPaddingStyle.value,
  ...textMarginStyle.value,
}))

const textOnlyAlignStyle = computed(() => {
  if (needDisplayImage.value) return {}
  const pos = getDefault(value.value, 'text.text-block-position')
  if (pos === 'flex-start' || pos === 'center' || pos === 'flex-end') return { justifyContent: pos }
  return { justifyContent: 'center' }
})

const imagesOnlyAlignStyle = computed(() => {
  if (needDisplayText.value) return {}
  const pos = getDefault(value.value, 'images.images-block-position')
  if (pos === 'flex-start' || pos === 'center' || pos === 'flex-end') return { justifyContent: pos }
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
  const colsValue = clampInt(getDefault(value.value, `${settingsPath}.text-cols`), 1, 4, 1)
  return { container, sizeClass, alignClass, colsValue }
}

const titleMeta = computed(() => textFieldMeta('title'))
const summaryMeta = computed(() => textFieldMeta('summary'))
const textMeta = computed(() => textFieldMeta('text'))

const visibleTextFields = computed(() => {
  const map: Record<TextFieldKey, boolean> = { title: !!previewTitle.value, summary: !!previewSummary.value, text: !!previewText.value }
  return textFieldKeys.filter((k) => map[k]).map((k) => ({
    key: k, meta: k === 'title' ? titleMeta.value : k === 'summary' ? summaryMeta.value : textMeta.value
  }))
})

const inlineBindings = computed<Record<TextFieldKey, InlineEditBinding>>(() => ({
  title: { get: () => previewTitle.value, set: (v: string) => commitField('title', v), renderFormulas },
  summary: { get: () => previewSummary.value, set: (v: string) => commitField('summary', v), renderFormulas },
  text: { get: () => previewText.value, set: (v: string) => commitField('text', v), renderFormulas },
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

// ==================== Galleries ====================

function getGalleryByKey(key: string): any | null {
  const arr = value.value as any[] | undefined
  if (!Array.isArray(arr)) return null
  const imagesNode = arr.find((b: any) => b.key === 'images')
  if (!Array.isArray(imagesNode?.children)) return null
  return imagesNode.children.find((c: any) => c.key === key && c.type === 'image') ?? null
}

const gallery1 = computed(() => getGalleryByKey('gallery1'))
const gallery2 = computed(() => getGalleryByKey('gallery2'))
// const gallery3 = computed(() => getGalleryByKey('gallery3'))
</script>

<template>
  <ConstructorBlockLayout :mode="props.mode ?? 'body'">
    <template #form>
      <div>Тут ничего нет еще</div>
    </template>

    <template #body>
      <div class="text-image-root">
        <div :style="[layoutMarginStyle]">
          <div
            :style="[layoutBcgStyle, layoutBorderStyle, layoutPaddingStyle, textOnlyAlignStyle, imagesOnlyAlignStyle]"
            :class="['flex', 'items-start', layoutClass]"
          >
            <!-- ==================== IMAGE AREA ==================== -->
            <div
              v-if="needDisplayImage"
              :style="{ flex: `0 0 ${imagesPercent * 100}%` }"
              class="flex flex-col gap-4"
            >
              <!-- Галерея 1 -->
              <ImageGallery
                v-if="gallery1"
                :gallery="gallery1"
                :settings="value"
                style-path="images.gallery1"
                fallback-style-path="images"
                :allow-drag-and-drop="allowDragAndDrop"
                :show-to-delete-images="showToDeleteImages"
              />

              <!-- Галерея 2 -->
              <ImageGallery
                v-if="gallery2"
                :gallery="gallery2"
                :settings="value"
                style-path="images.gallery2"
                fallback-style-path="images"
                :allow-drag-and-drop="allowDragAndDrop"
                :show-to-delete-images="showToDeleteImages"
              />
            </div>

            <!-- ==================== TEXT AREA ==================== -->
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

.text-image-root {
  position: relative;
}
</style>
