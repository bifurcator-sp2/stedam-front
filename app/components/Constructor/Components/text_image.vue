<script setup lang="ts">
import { computed } from 'vue'

const value = defineModel<[]>({ default: () => [] })

const props = defineProps<{
  mode?: 'form' | 'body'
}>()

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

function paddingStyle(settings: Record<string, any>) {
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

const previewImage = 'https://img.magnific.com/premium-photo/trees-park-autumn_1048944-1833622.jpg?semt=ais_hybrid&w=740&q=80'

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

// ==================== Текст ====================
const previewTitle = computed(() => getDefault(value.value, 'text.title'))
const previewText = computed(() => getDefault(value.value, 'text.text'))
const tag = computed(() => `Prose${getDefault(value.value, 'text.header-type').toUpperCase()}`)
const textSize = computed(() => ' ' + getDefault(value.value, 'text.text-size') + ' ')
const textBcgClass = computed(() => ' ' + getDefault(value.value, 'text.background-color') + ' ')

const paddings = computed(() => ({
  'padding-top': getDefault(value.value, 'text.padding-top'),
  'padding-right': getDefault(value.value, 'text.padding-right'),
  'padding-bottom': getDefault(value.value, 'text.padding-bottom'),
  'padding-left': getDefault(value.value, 'text.padding-left'),
}))

const paddingStyles = computed(() => paddingStyle(paddings.value ?? {}))

// ==================== Layout ====================
const layout = computed(() => getDefault(value.value, 'layout'))
const needDisplayImage = computed(() => layout.value !== 'text')
const needDisplayText = computed(() => layout.value !== 'image')

const layoutClass = computed(() => ({
  'text': ' ',
  'image': ' ',
  'text-right': 'flex-row',           // текст справа, картинка слева
  'text-left': 'flex-row-reverse',    // текст слева, картинка справа
  'text-top': 'flex-col-reverse',     // текст сверху, картинка снизу
  'text-bottom': 'flex-col',          // текст снизу, картинка сверху
}[layout.value ?? 'text-left']))

// ==================== Пропорции текст / картинки ====================
const cols = 12
const textPercent = computed(() => Number(getDefault(value.value, 'text.cols')) / cols)
const imagesPercent = computed(() => clamp(1 - textPercent.value, 0, 1))

const textBlockStyle = computed(() => ({
  flex: `0 0 ${textPercent.value * 100}%`,
  ...paddingStyles.value,
}))

// ==================== Картинки ====================
const imagesBcgClass = computed(() => ' ' + getDefault(value.value, 'images.background-color') + ' ')

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

const imagesPadding = computed(() =>
  clampInt(getDefault(value.value, 'images.padding'), 0, 12, 0)
)

const distancePx = computed(() => {
  const v = Number(getDefault(value.value, 'images.distance'))
  if (!Number.isFinite(v) || v < 0) return 16
  return v * 4
})

const imagesPaddingPx = computed(() => `${imagesPadding.value * 4}px`)

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
  return ({
    'fill': 'object-fill',
    'contain': 'object-contain',
    'cover': 'object-cover',
    'none': 'object-none',
    'scale-down': 'object-scale-down',
  } as Record<string, string>)[v] ?? 'object-contain'
})

// Контейнер картинок
const imagesContainerClass = computed(() => {
  if (isMasonry.value) return ''
  if (imagesFlexDirection.value === 'column') return ''
  return 'flex flex-row flex-wrap'
})

const imagesContainerStyle = computed(() => {
  const base: Record<string, string> = {
    flex: `0 0 ${imagesPercent.value * 100}%`,
    padding: imagesPaddingPx.value,
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

// Класс картинки
const imageItemClass = computed(() => {
  if (isMasonry.value) {
    return 'w-full h-auto block'
  }
  if (imagesFlexDirection.value === 'column') {
    return 'w-full h-auto break-inside-avoid'
  }
  return `w-auto ${imageFitClass.value}`
})

// Inline-стиль картинки
const imageItemStyle = computed(() => {
  if (isMasonry.value) {
    return {}
  }
  if (imagesFlexDirection.value === 'column') {
    return { marginBottom: `${distancePx.value}px` }
  }
  return { height: `${imageHeightPx.value}px`, width: 'auto' }
})

// ==================== Колонки текста ====================
const textCols = computed(() =>
  clampInt(getDefault(value.value, 'text.text-cols'), 1, 4, 1)
)
</script>

<template>
  <ConstructorBlockLayout :mode="props.mode ?? 'body'">
    <template #form>
      <div>Тут ничего нет еще</div>
    </template>

    <template #body>
      <div>
        <div :class="'flex items-start justify-center ' + layoutClass">
          <div
            v-if="needDisplayImage"
            :class="[imagesContainerClass, imagesBcgClass]"
            :style="imagesContainerStyle"
          >
            <img
              v-for="i in imagesCount"
              :key="'img' + i"
              :src="previewImages[(i - 1) % previewImages.length]"
              :class="imageItemClass"
              :style="imageItemStyle"
            />
          </div>

          <div v-if="needDisplayText" :class="textBcgClass" :style="textBlockStyle">
            <component :is="tag" class="mt-0">{{ previewTitle }}</component>
            <ProseP :style="{ columnCount: textCols }" :class="textSize">
              {{ previewText }}
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
</style>
