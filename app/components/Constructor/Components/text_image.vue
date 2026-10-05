<script setup lang="ts">
import { computed } from 'vue'

// ==================== Модель ====================
const value = defineModel<[]>({ default: () => [] })

const props = defineProps<{
  mode?: 'form' | 'body'
}>()

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

function getDefault(blocks: [] | undefined, path: string): string {
  let list = blocks
  let found: Block | undefined
  for (const key of path.split('.')) {
    found = list?.find(b => b.key === key)
    if (!found) return ''
    list = found.children
  }
  return found?.default ?? ''
}

function toPx(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return `${n * 4}px` // 1 = 4px, как в Tailwind
}

function toPxBorder(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return `${n}px` // толщина бордера 1 = 1px
}

function toPxRadius(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return `${n * 4}px` // радиус 1 = 4px
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

  // Цвет
  const colorRaw = settings['color']
  if (typeof colorRaw === 'string' && colorRaw) {
    const name = colorRaw.replace(/^border-/, '')
    if (name) {
      s.borderColor = `var(--border-${name})`
      s.borderStyle = 'solid'
    }
  }

  // Толщины по сторонам
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

// Универсальный сборщик «border + radius» из путей схемы
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

// Универсальный сборщик padding из пути схемы
function collectPaddingStyle(basePath: string): Record<string, string> {
  return paddingStyle({
    'padding-top':    getDefault(value.value, `${basePath}.top`),
    'padding-right':  getDefault(value.value, `${basePath}.right`),
    'padding-bottom': getDefault(value.value, `${basePath}.bottom`),
    'padding-left':   getDefault(value.value, `${basePath}.left`),
  })
}

// Универсальный сборщик margin из пути схемы
function collectMarginStyle(basePath: string): Record<string, string> {
  return marginStyle({
    'margin-top':    getDefault(value.value, `${basePath}.top`),
    'margin-right':  getDefault(value.value, `${basePath}.right`),
    'margin-bottom': getDefault(value.value, `${basePath}.bottom`),
    'margin-left':   getDefault(value.value, `${basePath}.left`),
  })
}

// ==================== Превью-изображения ====================
const previewImages = [
  'https://img.magnific.com/premium-photo/trees-park-autumn_1048944-1833622.jpg?semt=ais_hybrid&w=740&q=80',
  'https://i.pinimg.com/originals/39/08/8c/39088c9907bce387867eb149fc9fed54.jpg',
  'https://turclub-pik.ru/crop/1160/464/uploads/blog_img/covers/ce0803b71598de24381350509c5d02f5.jpeg.webp',
  'https://avatars.mds.yandex.net/i?id=e9812860a39898a8a0494d0ae5399494_l-5232437-images-thumbs&n=13',
  'https://www.tripletcam.com/videos/categories/assets/4/background.png?1685627419',
  'https://cdn.xn--h1ajim.xn--p1ai/images/thumb/1/1f/20_Jahre_kann_ein_Star_alt_werden._03.jpg/640px-20_Jahre_kann_ein_Star_alt_werden._03.jpg',
  'https://avatars.mds.yandex.net/i?id=f1175b08cbc475e1f8d218a06dacd9bc585f1851-4577649-images-thumbs&n=13',
  'https://avatars.mds.yandex.net/get-mpic/5322414/img_id3536859793184490756.jpeg/orig',
]

// ==================== Layout ====================
const layout = computed(() => getDefault(value.value, 'layout'))
const needDisplayImage = computed(() => layout.value !== 'text')
const needDisplayText = computed(() => layout.value !== 'image')

const layoutClass = computed(
  () =>
    ({
      'text': ' ',
      'image': ' ',
      'text-right': 'flex-row',          // текст справа, картинка слева
      'text-left': 'flex-row-reverse',   // текст слева, картинка справа
      'text-top': 'flex-col-reverse',    // текст сверху, картинка снизу
      'text-bottom': 'flex-col',         // текст снизу, картинка сверху
    }[layout.value ?? 'text-left'])
)

const layoutBcgStyle = computed(() => {
  const v = getDefault(value.value, 'background-color')
  const name = v?.replace(/^bg-/, '')
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
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

// ==================== Images ====================
const imagesBcgStyle = computed(() => {
  const v = getDefault(value.value, 'images.background-color')
  const name = v?.replace(/^bg-/, '')
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})

const imagesBorderStyle = computed(() =>
  collectBorderStyle('images.border', 'images.border.radius')
)

const imagesPaddingStyle = computed(() => collectPaddingStyle('images.padding'))
const imagesMarginStyle = computed(() => collectMarginStyle('images.margin'))

const imagesCount = computed(() => {
  const def = Number(getDefault(value.value, 'images.count'))
  if (!Number.isFinite(def) || def < 0) return 10
  return def
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

  if (isMasonry.value) {
    base.display = 'grid'
    base.gridTemplateColumns = `repeat(${Math.max(1, columns.value)}, minmax(0, 1fr))`
    base.gridAutoRows = 'auto'
    base.alignItems = 'start'
    base.gap = `${distancePx.value}px`
  } else if (imagesFlexDirection.value === 'column') {
    base.columnCount = String(Math.max(1, columns.value))
    base.columnGap = `${distancePx.value}px`
  } else {
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
  if (isMasonry.value) {
    return {}
  }
  if (imagesFlexDirection.value === 'column') {
    return { marginBottom: `${distancePx.value}px` }
  }
  return { height: `${imageHeightPx.value}px`, width: 'auto' }
})
</script>

<template>
  <ConstructorBlockLayout :mode="props.mode ?? 'body'">
    <template #form>
      <div>Тут ничего нет еще</div>
    </template>

    <template #body>
      <div :style="[layoutMarginStyle]">
        <div
          :style="[layoutBcgStyle, layoutBorderStyle, layoutPaddingStyle]"
          :class="['flex', 'items-start', 'justify-center', layoutClass]"
        >
          <div>
            <div
              v-if="needDisplayImage"
              :class="[imagesContainerClass]"
              :style="[imagesContainerStyle, imagesBcgStyle, imagesBorderStyle]"
            >
              <img
                v-for="i in imagesCount"
                :key="'img' + i"
                :src="previewImages[(i - 1) % previewImages.length]"
                :class="imageItemClass"
                :style="imageItemStyle"
              />
            </div>
          </div>
          <div
            v-if="needDisplayText"
            :style="[textBlockStyle, textBcgStyle, textBorderStyle]"
          >
            <component
              v-if="previewTitle"
              :is="tag" class="mt-0 block-title-break"
              v-inline-edit="{
              get: () => previewTitle,
              set: (v: string) => (previewTitle = v),
              renderFormulas: true,
              }"
            ></component>
            <ProseP
              v-if="previewText"
              :style="{ columnCount: textCols }"
              :class="[textSize, 'block-title-break']"
              v-inline-edit="{
              get: () => previewText,
              set: (v: string) => (previewText = v),
              renderFormulas: true,
              }"
              class="text-default inline-edit"
            >
            </ProseP>

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
  min-width: 0;   /* важно, если внутри flex/grid — иначе не сработает */
}
</style>
