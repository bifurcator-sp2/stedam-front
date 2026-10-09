<script setup lang="ts">
import { computed } from 'vue'
import { MasonryWall } from '@yeger/vue-masonry-wall'

// ==================== Модель ====================
const value = defineModel<[]>({ default: () => [] })

const props = withDefaults(defineProps<{
  mode?: 'form' | 'body'
  id?: number
  allowDragAndDrop?: boolean
  /** Если true — stored-картинки помечаются toDelete, а не удаляются сразу. */
  showToDeleteImages?: boolean
}>(), {
  allowDragAndDrop: true,
  showToDeleteImages: false,
})

// ==================== Общие утилиты ====================
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

/**
 * Записать новое значение в дерево схемы по пути 'a.b.c'.
 * Возвращает true, если узел найден и обновлён.
 */
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

function borderStyle(settings: Record<string, any>): Record<string, string> {
  const s: Record<string, string> = {}

  const colorRaw = settings['color']
  if (typeof colorRaw === 'string' && colorRaw) {
    const name = colorRaw.replace(/^border-/, '')
    if (name) {
      s.borderColor = `var(--border-${name})`
      s.borderStyle = 'solid'
    }
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
  radiusPath: string
): Record<string, string> {
  const border: Record<string, any> = {
    color:  getDefault(value.value, `${borderPath}.color`),
    top:    getDefault(value.value, `${borderPath}.top`),
    right:  getDefault(value.value, `${borderPath}.right`),
    bottom: getDefault(value.value, `${borderPath}.bottom`),
    left:   getDefault(value.value, `${borderPath}.left`),
  }
  const radius: Record<string, any> = {
    'top-left':     getDefault(value.value, `${radiusPath}.top-left`),
    'top-right':    getDefault(value.value, `${radiusPath}.top-right`),
    'bottom-right': getDefault(value.value, `${radiusPath}.bottom-right`),
    'bottom-left':  getDefault(value.value, `${radiusPath}.bottom-left`),
  }
  return { ...borderStyle(border), ...radiusStyle(radius) }
}

function collectPaddingStyle(basePath: string): Record<string, string> {
  return paddingStyle({
    'padding-top':    getDefault(value.value, `${basePath}.top`),
    'padding-right':  getDefault(value.value, `${basePath}.right`),
    'padding-bottom': getDefault(value.value, `${basePath}.bottom`),
    'padding-left':   getDefault(value.value, `${basePath}.left`),
  })
}

function collectMarginStyle(basePath: string): Record<string, string> {
  return marginStyle({
    'margin-top':    getDefault(value.value, `${basePath}.top`),
    'margin-right':  getDefault(value.value, `${basePath}.right`),
    'margin-bottom': getDefault(value.value, `${basePath}.bottom`),
    'margin-left':   getDefault(value.value, `${basePath}.left`),
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

  // Цвет фона
  const v = getDefault(value.value, 'background-color')
  const name = v?.replace(/^bg-/, '')
  if (name) {
    style.backgroundColor = `var(--bg-${name})`
  }

  // Фоновое изображение
  const bgImageNode = (value.value as any[] | undefined)
    ?.find((b: any) => b.key === 'background-image')

  const bgImage = Array.isArray(bgImageNode?.default)
    ? bgImageNode.default[0]
    : null

  const bgUrl = bgImage?.url ?? null

  if (bgUrl) {
    style.backgroundImage = `url(${bgUrl})`

    // Размер и позиция
    const bgSize = getDefault(value.value, 'background-size')
    const bgPosition = getDefault(value.value, 'background-position')

    if (bgSize) {
      style.backgroundSize = bgSize
    }
    if (bgPosition) {
      style.backgroundPosition = bgPosition
    }

    // Чтобы фон не тайлился
    style.backgroundRepeat = 'no-repeat'
  }

  return style
})

const layoutBorderStyle = computed(() =>
  collectBorderStyle('border', 'border.radius')
)

const layoutMarginStyle = computed(() => collectMarginStyle('margin'))
const layoutPaddingStyle = computed(() => collectPaddingStyle('padding'))

// ==================== Пропорции текст / картинки ====================
const cols = 12
const textPercent = computed(() => Number(getDefault(value.value, 'text.cols')) / cols)
const imagesPercent = computed(() => clamp(1 - textPercent.value, 0, 1))

// ==================== Text ====================
const previewTitle = computed(() => getDefault(value.value, 'text.title'))
const previewText = computed(() => getDefault(value.value, 'text.text'))

const tag = computed(
  () => `Prose${getDefault(value.value, 'text.header-type').toUpperCase()}`
)
const textSize = computed(() => ' ' + getDefault(value.value, 'text.text-size') + ' ')

const textBcgStyle = computed(() => {
  const v = getDefault(value.value, 'text.background-color')
  const name = v?.replace(/^bg-/, '')
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})

const textPaddingStyle = computed(() => collectPaddingStyle('text.padding'))
const textMarginStyle = computed(() => collectMarginStyle('text.margin'))

const textBorderStyle = computed(() =>
  collectBorderStyle('text.border', 'text.border.radius')
)

const textBlockStyle = computed(() => ({
  flex: `0 0 ${textPercent.value * 100}%`,
  ...textPaddingStyle.value,
  ...textMarginStyle.value,
}))

const textCols = computed(() =>
  clampInt(getDefault(value.value, 'text.text-cols'), 1, 4, 1)
)

/**
 * Записать значение в дерево схемы и форсировать эмит update:modelValue.
 * Используется как `set` для v-inline-edit — чтобы правки в центре
 * попадали в модель, а значит — в правую панель и в save().
 */
function commitText(path: string, v: string) {
  const arr = value.value as any[] | undefined
  if (!arr) return

  const ok = setDefault(arr, path, v)
  if (!ok) return

  // Форсим эмит новой ссылкой, чтобы родитель (editingBlock.settings)
  // получил update:modelValue.
  value.value = arr.slice() as any
}

function commitTitle(v: string) {
  commitText('text.title', v)
}

function commitBody(v: string) {
  commitText('text.text', v)
}

// ==================== Images ====================
const imagesBcgStyle = computed(() => {
  const v = getDefault(value.value, 'images.background-color')
  const name = v?.replace(/^bg-/, '')
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})

const imagesBorderStyle = computed(() =>
  collectBorderStyle('images.border', 'images.border.radius')
)

const imageBorderStyle = computed(() =>
  collectBorderStyle('images.image-border', 'images.image-border.radius')
)

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
  if (imagesFlexDirection.value === 'column') return ''
  return 'flex flex-row flex-wrap'
})

const imagesContainerStyle = computed(() => {
  const base: Record<string, string> = {
    flex: `0 0 ${imagesPercent.value * 100}%`,
    ...imagesPaddingStyle.value,
    ...imagesMarginStyle.value,
  }

  if (imagesFlexDirection.value === 'column') {
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
    return 'w-full h-auto break-inside-avoid'
  }
  return `w-auto ${imageFitClass.value}`
})

const imageItemStyle = computed(() => {
  if (isMasonry.value) return {}
  if (imagesFlexDirection.value === 'column') {
    return { marginBottom: `${distancePx.value}px` }
  }
  return { height: `${imageHeightPx.value}px`, width: 'auto' }
})

const imageImgStyle = computed(() => {
  return { display: 'block' }
})

/**
 * Ширина колонки для MasonryWall.
 */
const masonryColumnWidth = computed(() => 200)

import type { FilesListResponse } from '~/types/files'
import { ref, onMounted, onBeforeUnmount } from 'vue'

const filesModel = ref<FilesListResponse>({
  images: [],
  files: [],
  temp: { images: [], files: [] },
  stored: { images: [], files: [] },
})

const fileContainerRef = ref<InstanceType<typeof FileContainer> | null>(null)

const emit = defineEmits<{
  (e: 'register-files', inst: InstanceType<typeof FileContainer> | null): void
}>()

onMounted(() => emit('register-files', fileContainerRef.value))
onBeforeUnmount(() => emit('register-files', null))

// ==================== Reorder ====================
function onReorder(from: number, to: number) {
  const imgs = filesModel.value.images
  if (from === to) return
  if (from < 0 || from >= imgs.length) return
  if (to < 0 || to >= imgs.length) return

  const next = imgs.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)

  filesModel.value = { ...filesModel.value, images: next }
}

const masonryKey = computed(() => {
  // Всё, что влияет на layout masonry
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
      <FileContainer
        ref="fileContainerRef"
        model-name="blocks"
        :model-id="id"
        file-type="image"
        :max-images="imagesCount"
        :show-to-delete-images="showToDeleteImages"
        v-model:files="filesModel"
      />
      <div :style="[layoutMarginStyle]">
        <div
          :style="[layoutBcgStyle, layoutBorderStyle, layoutPaddingStyle]"
          :class="['flex', 'items-start', 'justify-center', layoutClass]"
        >
          <div :style="{ flex: `0 0 ${imagesPercent * 100}%` }">
            <!-- Masonry (JS) -->
            <MasonryWall
              v-if="needDisplayImage && isMasonry"
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
                  @remove="fileContainerRef?.removeFile($event)"
                  @restore="fileContainerRef?.restoreFile($event)"
                  @reorder="onReorder"
                  :class="imageItemClass"
                  :style="[imageItemStyle, imageBorderStyle]"
                >
                  <img
                    :src="item.url"
                    :style="imageImgStyle"
                  />
                </ImageWrapper>
              </template>
            </MasonryWall>

            <!-- Column / Row (CSS) -->
            <div
              v-else-if="needDisplayImage"
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
                @remove="fileContainerRef?.removeFile($event)"
                @restore="fileContainerRef?.restoreFile($event)"
                @reorder="onReorder"
                :class="imageItemClass"
                :style="[imageItemStyle, imageBorderStyle]"
              >
                <img
                  :src="img.url"
                  :style="imageImgStyle"
                />
              </ImageWrapper>
            </div>
          </div>
          <div
            v-if="needDisplayText"
            :style="[textBlockStyle, textBcgStyle, textBorderStyle]"
          >
            <component
              v-if="previewTitle"
              :is="tag"
              class="mt-0 block-title-break"
              v-inline-edit="{
                get: () => previewTitle,
                set: commitTitle,
                renderFormulas: true,
              }"
            ></component>

            <ProseP
              v-if="previewText"
              :style="{ columnCount: textCols }"
              :class="[textSize, 'block-title-break']"
              v-inline-edit="{
                get: () => previewText,
                set: commitBody,
                renderFormulas: true,
              }"
            ></ProseP>
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
</style>
