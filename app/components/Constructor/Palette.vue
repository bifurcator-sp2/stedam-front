<script lang="ts">
export interface PaletteItem {
  type: string
  label: string
  icon: string
}
</script>

<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'

const model = defineModel<any[]>({ default: () => [] })
const screen = useState<'desktop' | 'tablet' | 'mobile'>('constructor.screen', () => 'desktop')
const mode = useState<'body' | 'form'>('constructor.mode', () => 'body')

// --- Определение тач-устройства ---
const isTouchDevice = ref(false)

// --- Ref на контейнер списка (для поиска блоков) ---
const listRef = ref<HTMLElement | null>(null)

// --- Встроенный список компонентов ---
const items: PaletteItem[] = [
  { type: 'header', label: 'Заголовок', icon: 'i-lucide-heading' },
  { type: 'long', label: 'Компонент с очень длинным названием', icon: 'i-lucide-square' },
  { type: 'text', label: 'Текст', icon: 'i-lucide-type' },
  { type: 'image', label: 'Картинка', icon: 'i-lucide-image' },
  { type: 'button', label: 'Кнопка', icon: 'i-lucide-square' },
  { type: 'divider', label: 'Разделитель', icon: 'i-lucide-minus' },
  { type: 'video', label: 'Видео', icon: 'i-lucide-video' },
]

let uid = 0
function nextId() {
  return `block-${Date.now()}-${uid++}`
}

// --- Загрузка компонентов из папки Components ---
const blockComponents = import.meta.glob(
  '~/components/Constructor/Components/*.vue',
  { eager: true },
)

const componentMap = computed<Record<string, any>>(() => {
  const map: Record<string, any> = {}
  for (const path in blockComponents) {
    const name = path.split('/').pop()?.replace('.vue', '') ?? ''
    map[name.toLowerCase()] = (blockComponents[path] as any).default
  }
  return map
})

const fallbackComponent = computed(() => componentMap.value['text'] ?? null)

function getBlockComponent(type: string) {
  const own = componentMap.value[type.toLowerCase()]
  if (own) return own
  if (import.meta.dev) {
    console.warn(`[Palette] Нет компонента для type="${type}", использую Text.vue`)
  }
  return fallbackComponent.value
}

function getTemplate(type: string): PaletteItem | undefined {
  return items.find((i) => i.type === type)
}
function getBlockLabel(type: string): string {
  return getTemplate(type)?.label ?? type
}
function getBlockIcon(type: string): string {
  return getTemplate(type)?.icon ?? 'i-lucide-square'
}

function getDefaultValue(type: string): any {
  switch (type) {
    case 'header': return 'Новый заголовок'
    case 'text':
    case 'long': return 'Привет, <strong>мир</strong>!'
    case 'button': return { text: 'Кнопка', variant: 'primary' }
    case 'image': return { src: '', alt: '' }
    case 'video': return { src: '' }
    case 'divider': return undefined
    default: return ''
  }
}

/**
 * Вставляет блок после того блока, который сейчас ближе всего к центру viewport.
 * Затем плавно прокручивает страницу так, чтобы ВЕРХ нового блока встал
 * по центру экрана.
 */
async function insertAtVisiblePosition(item: PaletteItem) {
  const newBlock = {
    id: nextId(),
    type: item.type,
    value: getDefaultValue(item.type),
  }

  const container = listRef.value

  // Список пуст или не найден — добавляем в начало
  if (!container || model.value.length === 0) {
    model.value.push(newBlock)
    await nextTick()
    requestAnimationFrame(() => scrollToBlockTopCenter(newBlock.id))
    return
  }

  const viewportCenterY = window.innerHeight / 2

  const blockEls = container.querySelectorAll<HTMLElement>('[data-block-wrapper]')

  let closestIndex = -1
  let closestDistance = Infinity

  blockEls.forEach((el, i) => {
    const rect = el.getBoundingClientRect()
    const blockCenterY = rect.top + rect.height / 2
    const distance = Math.abs(blockCenterY - viewportCenterY)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = i
    }
  })

  const insertIndex = closestIndex >= 0 ? closestIndex + 1 : model.value.length
  model.value.splice(insertIndex, 0, newBlock)

  await nextTick()
  requestAnimationFrame(() => scrollToBlockTopCenter(newBlock.id))
}

/**
 * Прокручивает страницу (window) так, чтобы ВЕРХ блока оказался
 * по центру viewport.
 */
function scrollToBlockTopCenter(blockId: string) {
  const container = listRef.value
  if (!container) return

  const el = container.querySelector<HTMLElement>(
    `[data-block-wrapper="${blockId}"]`,
  )
  if (!el) return

  const rect = el.getBoundingClientRect()
  const viewportCenterY = window.innerHeight / 2

  const delta = rect.top - viewportCenterY

  window.scrollBy({
    top: delta,
    behavior: 'smooth',
  })
}

function onPaletteItemClick(item: PaletteItem, e: MouseEvent) {
  if (!isTouchDevice.value) return
  e.preventDefault()
  insertAtVisiblePosition(item)
}

// --- Ширина палитры ---
const MIN_WIDTH = 140
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 176

const paletteWidth = useState<number>('constructor.paletteWidth', () => DEFAULT_WIDTH)
const isResizing = ref(false)

function startResize(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  isResizing.value = true

  const startX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
  const startWidth = paletteWidth.value

  function onMove(ev: MouseEvent | TouchEvent) {
    const x = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX
    const delta = x - startX
    let next = startWidth + delta
    if (next < MIN_WIDTH) next = MIN_WIDTH
    if (next > MAX_WIDTH) next = MAX_WIDTH
    paletteWidth.value = next
  }

  function onUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// --- Проверка переполнения текста в палитре ---
const containerRefs: Record<string, HTMLElement> = {}
const labelRefs: Record<string, HTMLElement> = {}
const overflowing = ref<Record<string, boolean>>({})
const hovered = ref<string | null>(null)
const offsets = ref<Record<string, number>>({})

function setContainerRef(type: string) {
  return (el: any) => {
    if (el instanceof HTMLElement) containerRefs[type] = el
  }
}
function setLabelRef(type: string) {
  return (el: any) => {
    if (el instanceof HTMLElement) labelRefs[type] = el
  }
}

function measureAll() {
  for (const type in containerRefs) {
    const container = containerRefs[type]
    const label = labelRefs[type]
    if (!container || !label) continue
    const firstSpan = label.querySelector('span') as HTMLElement | null
    if (!firstSpan) continue
    const overflow = firstSpan.scrollWidth > container.clientWidth
    overflowing.value[type] = overflow
    if (overflow) {
      offsets.value[type] = firstSpan.scrollWidth - container.clientWidth + 32
    } else {
      offsets.value[type] = 0
    }
  }
}

let ro: ResizeObserver | null = null

onMounted(() => {
  isTouchDevice.value =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches

  nextTick(() => {
    measureAll()
    ro = new ResizeObserver(() => measureAll())
    for (const type in containerRefs) {
      if (containerRefs[type]) ro.observe(containerRefs[type])
    }
  })
})

onBeforeUnmount(() => {
  ro?.disconnect()
})

watch(paletteWidth, () => nextTick(measureAll))

function onItemMouseEnter(type: string) {
  if (overflowing.value[type]) hovered.value = type
}
function onItemMouseLeave() {
  hovered.value = null
}

function labelStyle(type: string) {
  const isHovered = hovered.value === type && overflowing.value[type]
  const offset = offsets.value[type] ?? 0
  return {
    transform: isHovered ? `translateX(-${offset}px)` : 'translateX(0)',
    transition: isHovered ? 'transform 6s linear' : 'transform 0.4s ease-out',
  }
}

// --- Клонирование элемента палитры в блок ---
function cloneItem(item: PaletteItem) {
  return {
    id: nextId(),
    type: item.type,
    value: getDefaultValue(item.type),
  }
}

function removeAt(index: number) {
  model.value.splice(index, 1)
}

function moveUp(index: number) {
  if (index === 0) return
  const arr = [...model.value]
  ;[arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]
  model.value = arr
}

function moveDown(index: number) {
  if (index >= model.value.length - 1) return
  const arr = [...model.value]
  ;[arr[index + 1], arr[index]] = [arr[index], arr[index + 1]]
  model.value = arr
}

// --- Статистика ---
function extractText(input: unknown): { plain: string; formulaChars: number } {
  if (input == null) return { plain: '', formulaChars: 0 }
  let text: string

  if (typeof input === 'object') {
    const parts = Object.values(input as Record<string, unknown>)
      .map((v) => {
        const r = extractText(v)
        return r.plain
      })
      .join(' ')
    text = parts
  } else if (typeof input === 'string') {
    text = input
  } else {
    return { plain: '', formulaChars: 0 }
  }

  let formulaChars = 0
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    formulaChars += latex.replace(/\s+/g, '').length
    return ' '
  })
  text = text.replace(/\$([^\$\n]+?)\$/g, (_, latex) => {
    formulaChars += latex.replace(/\s+/g, '').length
    return ' '
  })

  const plain = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return { plain, formulaChars }
}

const stats = computed(() => {
  let plainText = ''
  let formulaChars = 0
  for (const block of model.value) {
    const { plain, formulaChars: fc } = extractText(block?.value)
    plainText += ' ' + plain
    formulaChars += fc
  }
  plainText = plainText.replace(/\s+/g, ' ').trim()
  const plainChars = plainText.replace(/\s+/g, '').length
  const words = plainText.split(/\s+/).filter(Boolean).length
  return { plainText, plainChars, formulaChars, words }
})

const totalChars = computed(
  () => stats.value.plainChars + stats.value.formulaChars,
)

const CHARS_PER_MINUTE = 1000
const FORMULA_WEIGHT = 2

const readingTimeMinutes = computed(() => {
  const effectiveChars =
    stats.value.plainChars + stats.value.formulaChars * FORMULA_WEIGHT
  if (effectiveChars === 0) return 0
  return effectiveChars / CHARS_PER_MINUTE
})

const readingTimeText = computed(() => {
  const minutes = readingTimeMinutes.value
  if (minutes === 0) return '0 сек'
  if (minutes < 1) return `${Math.round(minutes * 60)} сек`
  const wholeMinutes = Math.floor(minutes)
  const seconds = Math.round((minutes - wholeMinutes) * 60)
  if (seconds === 0) return `${wholeMinutes} мин`
  return `${wholeMinutes} мин ${seconds} сек`
})
</script>

<template>
  <div class="flex items-start min-h-[400px]">
    <!-- Палитра слева — sticky, со скроллом внутри -->
    <aside
      class="shrink-0 sticky top-4 rounded-lg bg-default
             flex flex-col
             max-h-[calc(100vh-2rem)]
             border border-default overflow-hidden"
      :style="{ width: `${paletteWidth}px` }"
    >
      <!-- Заголовок — фиксирован -->
      <div class="px-3 pt-3 pb-2 border-b border-default shrink-0">
        <h3 class="text-xs font-medium text-muted uppercase tracking-wide">
          Компоненты
        </h3>
      </div>

      <!-- Список компонентов — скроллится -->
      <div class="flex-1 overflow-y-auto px-3 py-2 min-h-0">
        <VueDraggable
          :model-value="items"
          :group="{ name: 'constructor-blocks', pull: 'clone', put: false }"
          :sort="false"
          :clone="cloneItem"
          :animation="150"
          :disabled="isTouchDevice"
          class="flex flex-col gap-1.5"
        >
          <button
            v-for="item in items"
            :key="item.type"
            type="button"
            :draggable="!isTouchDevice"
            class="flex items-center gap-2 px-2 py-1.5 rounded-md
                   border border-default bg-elevated
                   transition text-left select-none touch-none"
            :class="
              isTouchDevice
                ? 'cursor-pointer active:bg-primary/10'
                : 'cursor-grab active:cursor-grabbing hover:border-primary hover:bg-primary/5'
            "
            :title="item.label"
            @click="onPaletteItemClick(item, $event)"
            @mouseenter="onItemMouseEnter(item.type)"
            @mouseleave="onItemMouseLeave"
          >
            <UIcon :name="item.icon" class="w-4 h-4 text-primary shrink-0" />

            <div
              class="flex-1 min-w-0 overflow-hidden"
              :ref="setContainerRef(item.type)"
            >
              <div
                class="palette-label text-xs text-default"
                :style="labelStyle(item.type)"
                :ref="setLabelRef(item.type)"
              >
                <span>{{ item.label }}</span>
                <span
                  v-if="overflowing[item.type]"
                  aria-hidden="true"
                >{{ item.label }}</span>
              </div>
            </div>
          </button>
        </VueDraggable>
      </div>
    </aside>

    <!-- Resizer -->
    <div
      class="group relative w-2 shrink-0 cursor-col-resize
             flex items-center justify-center touch-none"
      :class="{ 'select-none': isResizing }"
      @mousedown="startResize"
      @touchstart.passive="startResize"
    >
      <div
        class="w-0.5 h-8 rounded-full bg-default transition-colors
               group-hover:bg-primary"
        :class="{ 'bg-primary': isResizing }"
      />
    </div>

    <!-- Правая часть -->
    <div
      class="flex-1 min-w-0 border border-default rounded-lg bg-default p-3
             flex flex-col gap-2"
    >
      <!-- Верхняя панель -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap">
          <div class="inline-flex rounded-md border border-default overflow-hidden">
            <button
              type="button"
              class="px-2.5 py-1 text-xs transition-colors flex items-center gap-1"
              :class="mode === 'body' ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
              @click="mode = 'body'"
            >
              <UIcon name="i-lucide-eye" class="w-3.5 h-3.5" />
              <span>Просмотр</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1 text-xs transition-colors flex items-center gap-1
                     border-l border-default"
              :class="mode === 'form' ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
              @click="mode = 'form'"
            >
              <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5" />
              <span>Редактирование</span>
            </button>
          </div>

          <div class="inline-flex rounded-md border border-default overflow-hidden">
            <button
              type="button"
              class="px-2 py-1 text-xs transition-colors flex items-center justify-center"
              :class="screen === 'desktop' ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
              @click="screen = 'desktop'"
            >
              <UIcon name="i-lucide-monitor" class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="px-2 py-1 text-xs transition-colors flex items-center justify-center
                     border-l border-default"
              :class="screen === 'tablet' ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
              @click="screen = 'tablet'"
            >
              <UIcon name="i-lucide-tablet" class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="px-2 py-1 text-xs transition-colors flex items-center justify-center
                     border-l border-default"
              :class="screen === 'mobile' ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
              @click="screen = 'mobile'"
            >
              <UIcon name="i-lucide-smartphone" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="flex items-center gap-3 text-xs text-muted ml-auto shrink-0">
          <div>
            <UIcon name="i-lucide-type" class="w-3 h-3 inline -mt-0.5" />
            {{ totalChars }}
          </div>
          <div>
            <UIcon name="i-lucide-clock" class="w-3 h-3 inline -mt-0.5" />
            {{ readingTimeText }}
          </div>
        </div>
      </div>

      <!-- ======= ОБЛАСТЬ СПИСКА БЛОКОВ ======= -->
      <div ref="listRef" class="relative flex-1 min-h-[200px]">
        <div
          v-if="model.length === 0"
          class="absolute inset-0 flex items-center justify-center
                 border-2 border-dashed border-default rounded-md
                 text-sm text-muted pointer-events-none z-10"
        >
          {{ isTouchDevice ? 'Нажмите на компонент слева' : 'Перетащите компоненты сюда' }}
        </div>

        <VueDraggable
          v-model="model"
          :group="{ name: 'constructor-blocks' }"
          :animation="200"
          :disabled="isTouchDevice"
          handle=".drag-handle"
          ghost-class="drag-ghost"
          chosen-class="drag-chosen"
          drag-class="drag-active"
          class="flex flex-col gap-2 min-h-[200px]"
        >
          <div
            v-for="(block, index) in model"
            :key="block.id"
            :data-block-wrapper="block.id"
            class="group relative flex items-stretch gap-0"
          >
            <!-- ====== РЕЖИМ ФОРМЫ ====== -->
            <template v-if="mode === 'form'">
              <div class="flex flex-col gap-2 px-3 py-2 w-full
                          rounded-md border border-default bg-elevated">
                <div class="flex items-center gap-3">
                  <UIcon
                    name="i-lucide-grip-vertical"
                    class="drag-handle w-4 h-4 text-muted shrink-0 touch-none"
                    :class="isTouchDevice ? 'hidden' : 'cursor-grab active:cursor-grabbing'"
                  />
                  <UIcon
                    :name="getBlockIcon(block.type)"
                    class="w-5 h-5 text-primary shrink-0"
                  />
                  <span class="text-sm text-default flex-1 truncate">
                    {{ getBlockLabel(block.type) }}
                  </span>

                  <div
                    class="flex items-center gap-1 transition"
                    :class="isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
                  >
                    <UButton
                      icon="i-lucide-chevron-up"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :disabled="index === 0"
                      @click.stop="moveUp(index)"
                    />
                    <UButton
                      icon="i-lucide-chevron-down"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :disabled="index === model.length - 1"
                      @click.stop="moveDown(index)"
                    />
                    <UButton
                      icon="i-lucide-x"
                      size="xs"
                      color="error"
                      variant="ghost"
                      @click.stop="removeAt(index)"
                    />
                  </div>
                </div>

                <div
                  class="block-render min-h-[40px] rounded-md
                         border border-dashed border-default bg-default/50 p-2"
                >
                  <component
                    v-if="getBlockComponent(block.type)"
                    :is="getBlockComponent(block.type)"
                    v-model="block.value"
                    :mode="'form'"
                  />
                  <div
                    v-else
                    class="flex items-center justify-center h-full text-xs text-muted"
                  >
                    Компонент «{{ block.type }}» недоступен
                  </div>
                </div>
              </div>
            </template>

            <!-- ====== РЕЖИМ ПРОСМОТРА ====== -->
            <template v-else>
              <div
                class="flex items-center gap-0.5 px-1 shrink-0 transition-opacity"
                :class="[
                  isTouchDevice
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100',
                ]"
              >
                <UIcon
                  name="i-lucide-grip-vertical"
                  class="drag-handle w-4 h-4 text-muted shrink-0 touch-none"
                  :class="isTouchDevice ? 'hidden' : 'cursor-grab active:cursor-grabbing'"
                />

                <UButton
                  icon="i-lucide-chevron-up"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="index === 0"
                  @click.stop="moveUp(index)"
                />
                <UButton
                  icon="i-lucide-chevron-down"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="index === model.length - 1"
                  @click.stop="moveDown(index)"
                />
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  color="error"
                  variant="ghost"
                  @click.stop="removeAt(index)"
                />
              </div>

              <div class="flex-1 min-w-0">
                <component
                  v-if="getBlockComponent(block.type)"
                  :is="getBlockComponent(block.type)"
                  v-model="block.value"
                  :mode="'body'"
                  :screen="screen"
                />
                <div
                  v-else
                  class="flex items-center justify-center h-full text-xs text-muted"
                >
                  Компонент «{{ block.type }}» недоступен
                </div>
              </div>
            </template>
          </div>
        </VueDraggable>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drag-ghost {
  opacity: 0.4;
  background: var(--ui-bg-elevated);
  border: 1px dashed var(--ui-primary);
}

.drag-chosen {
  cursor: grabbing;
}

.drag-active {
  cursor: grabbing;
}

.palette-label {
  display: inline-block;
  white-space: nowrap;
}

.palette-label > span {
  display: inline-block;
  padding-right: 2rem;
}

:deep(.inline-edit) {
  outline: none;
  border-radius: 4px;
  padding: 2px 4px;
}
</style>
