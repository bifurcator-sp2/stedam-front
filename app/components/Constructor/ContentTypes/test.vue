<!-- components/Constructor/ContentTypes/test.vue -->
<script setup lang="ts">
import { computed, inject, ref, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import TextNode from '../TextNode.vue'
import Whiteboard from '~/components/Education/Whiteboard/Whiteboard.vue'
import type { InlineEditBinding } from '~/directives/inlineEdit'
import type { SettingNode } from '~/utils/constructors'
import { useLessonWhiteboard, type WhiteboardHandle, type WhiteboardVisualHeight } from '~/composables/useLessonWhiteboards'

const props = withDefaults(defineProps<{
  node: SettingNode
  settings?: SettingNode[] | null
  stylePath?: string
  editable?: boolean
  /** localId блока в уроке — для реестра белых досок (порядок штрихов) */
  blockLocalId?: string | null
  /** Сохранённая высота доски ответа (px) из прохождения; null — брать из настроек. */
  whiteboardHeight?: number | null
}>(), {
  editable: true,
  settings: null,
  stylePath: '',
  blockLocalId: null,
  whiteboardHeight: null,
})

const emit = defineEmits<{
  (e: 'update', value: SettingNode): void
  /** Доска ответа изменила высоту — тот же контракт, что и 'update' (v-model:settings). */
  (e: 'update:settings', value: SettingNode[]): void
}>()

const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))
const canEdit = computed(() => props.editable && lessonMode.value === 'edit')
// Режим прохождения: доску ответа можно растянуть по высоте (ручка Whiteboard).
const isLearner = computed(() => lessonMode.value === 'learn')

// ==================== Реестр белых досок ====================
// Доска регистрируется в реестре урока, чтобы LearnProcessor мог собрать
// штрихи всех досок в порядке блоков.
const whiteboardRef = ref<InstanceType<typeof Whiteboard> | null>(null)
const {
  registry: whiteboards,
  register: registerWhiteboard,
  unregister: unregisterWhiteboard,
  saveHeight: registrySaveHeight,
} = useLessonWhiteboard(() => props.blockLocalId)

// ==================== Высота доски из прохождения ====================
// Экземпляр доски в реестре: через него высота из сохранённого прохождения
// ставится доске напрямую (setHeight, без эмита 'resize').
// Пол высоты (whiteboard_height документа) и последняя высота, оставленная
// пользователем, живут в реестре и переживают перезагрузку ответов.
// Контейнер читает их и ставит свою высоту (см. applyVisualHeight).
function heightOf(wb: InstanceType<typeof Whiteboard>): WhiteboardVisualHeight {
  const handle = wb as unknown as WhiteboardHandle
  return (handle.visualHeight ??= {})
}

// Штрих доски завершён — сообщаем реестру (LearnProcessor тихо сохраняет ответы).
function onStrokeComplete() {
  whiteboards?.notifyStrokeComplete()
}

// Регистрация доски в реестре урока: доска видна Lesson, и он читает у неё
// штрихи и реальную высоту (getHeight) при сохранении. blockLocalId может
// прийти уже после монтирования, поэтому регистрацию повторяем на его смене.
let registeredWb: InstanceType<typeof Whiteboard> | null = null
function registerCurrentWhiteboard() {
  const wb = whiteboardRef.value
  if (!wb || !props.blockLocalId) return
  // Колбэк высоты — на том же объекте, что реестр запоминает при регистрации,
  // и до registerWhiteboard: он сразу применяет высоту и вызовет колбэк.
  ;(wb as unknown as WhiteboardHandle).onHeightChange = onHeightChange
  registeredWb = wb
  registerWhiteboard(wb)
}
watch(() => props.blockLocalId, registerCurrentWhiteboard)

onBeforeUnmount(() => {
  if (whiteboardRef.value) unregisterWhiteboard(whiteboardRef.value)
})

// ==================== Shared: solution из random.vue ====================

const randomTaskSolution = inject<Ref<string | null>>('random-task-solution', ref(null))

const hasRandomSolution = computed(() =>
  !!randomTaskSolution.value && randomTaskSolution.value.trim().length > 0,
)

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

const ethalonNode = computed(() => child(props.node, 'ethalon'))
const answerNode = computed(() => child(props.node, 'answer'))
const answerTitleNode = computed(() => child(answerNode.value, 'answer-tilte'))

// ==================== Эффективный «Эталонный ответ» ====================
// Если random.vue сгенерировал задачу — показываем его solution.
// Иначе — оригинальный ethalon из настроек блока.
const effectiveEthalonNode = computed<SettingNode | null>(() => {
  if (!ethalonNode.value) return null
  if (!hasRandomSolution.value) return ethalonNode.value
  return {
    ...ethalonNode.value,
    default: randomTaskSolution.value as string,
  }
})

// ==================== Layout (Корневой уровень) ====================

const blockWidth = computed(() => {
  const colsVal = child(props.node, 'block-cols')?.default ?? 24
  const cols = Number(colsVal)
  const pct = Math.min(Math.max(cols / 24, 0), 1)
  return `${pct * 100}%`
})

const blockPosition = computed(() => {
  const pos = child(props.node, 'block-position')?.default
  if (pos === 'flex-start' || pos === 'center' || pos === 'flex-end') return pos
  return 'center'
})

// ==================== Стили заголовка ответа ====================

const answerTitleContainer = computed(() => {
  const settingsNode = child(answerTitleNode.value, 'settings')
  return child(settingsNode, 'container')?.default || 'div'
})

const answerTitleStyle = computed(() => {
  const style: Record<string, string> = {}

  const textColorNode = child(answerNode.value, 'text-color')
  if (textColorNode?.default) {
    style.color = `var(--accent-${String(textColorNode.default).replace(/^accent-/, '')})`
  }

  const settingsNode = child(answerTitleNode.value, 'settings')
  if (!settingsNode?.children) return style

  const align = child(settingsNode, 'text-block-align')?.default
  const size = child(settingsNode, 'text-size')?.default

  if (align && align !== 'left') {
    style.textAlign = align
  }
  if (size) {
    const sizeMap: Record<string, string> = {
      'text-xs': '0.75rem', 'text-sm': '0.875rem', 'text-base': '1rem', 'text-lg': '1.125rem',
      'text-xl': '1.25rem', 'text-2xl': '1.5rem', 'text-3xl': '1.875rem', 'text-4xl': '2.25rem',
      'text-5xl': '3rem', 'text-6xl': '3.75rem', 'text-7xl': '4.5rem', 'text-8xl': '6rem', 'text-9xl': '8rem'
    }
    if (sizeMap[size]) {
      style.fontSize = sizeMap[size]
    }
  }
  return style
})

const titleBinding = computed<InlineEditBinding>(() => ({
  get: () => {
    const v = answerTitleNode.value?.default
    return typeof v === 'string' ? v : ''
  },
  set: (v: string) => {
    if (!canEdit.value || !answerTitleNode.value) return
    if (v === answerTitleNode.value.default) return

    const hIdx = answerNode.value?.children?.findIndex(c => c.key === 'answer-tilte') ?? -1
    if (hIdx === -1) return

    const ansIdx = props.node.children?.findIndex(c => c.key === 'answer') ?? -1
    if (ansIdx === -1) return

    const newAnswerNode = { ...answerNode.value! }
    newAnswerNode.children = [...answerNode.value!.children]
    newAnswerNode.children[hIdx] = { ...answerTitleNode.value, default: v }

    const newChildren = [...props.node.children]
    newChildren[ansIdx] = newAnswerNode
    emit('update', { ...props.node, children: newChildren })
  },
  renderFormulas: (html) => html,
}))

// ==================== Стили контейнера ответа ====================

const answerMarginStyle = computed(() => {
  const node = child(answerNode.value, 'margin')
  if (!node) return {}
  const s: Record<string, string> = {}
  const map = { left: 'marginLeft', right: 'marginRight', top: 'marginTop', bottom: 'marginBottom' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = toPx(node.children?.find((c) => c.key === side)?.default)
    if (px) s[cssKey] = px
  }
  return s
})

const answerBoxStyle = computed(() => {
  const s: Record<string, string> = {}
  if (!answerNode.value) return s

  const bg = child(answerNode.value, 'background-color')?.default
  if (bg) s.backgroundColor = `var(--bg-${bg.replace(/^bg-/, '')})`

  const paddingNode = child(answerNode.value, 'padding')
  if (paddingNode?.children) {
    const map = { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom' }
    for (const [side, css] of Object.entries(map)) {
      const val = paddingNode.children.find(c => c.key === side)?.default
      if (val) s[`padding${css}`] = `${val * 4}px`
    }
  }

  const border = child(answerNode.value, 'border')
  if (border?.children) {
    const color = border.children.find(c => c.key === 'color')?.default
    if (color) {
      const name = color.replace(/^border-/, '')
      s.borderColor = name === 'inherit' ? 'var(--ui-border)' : `var(--border-${name})`
      s.borderStyle = 'solid'
    }
    const mapBorder = { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom' }
    for (const [side, css] of Object.entries(mapBorder)) {
      const val = border.children.find(c => c.key === side)?.default
      if (val) s[`border${css}Width`] = `${val}px`
    }
    const radius = border.children.find(c => c.key === 'radius')
    if (radius?.children) {
      const mapR = { 'top-left': 'TopLeft', 'top-right': 'TopRight', 'bottom-right': 'BottomRight', 'bottom-left': 'BottomLeft' }
      for (const [corner, css] of Object.entries(mapR)) {
        const val = radius.children.find(c => c.key === corner)?.default
        if (val) s[`border${css}Radius`] = `${val * 4}px`
      }
    }
  }

  return s
})

// ==================== Ресайз ====================

const localHeight = ref<number>(250)
const isResizing = ref(false)
let startY = 0
let startHeight = 0
// Минимум контейнера — как у доски (minHeight 120), иначе Whiteboard
// отрисуется выше своего бокса и уедет под ручку. Это же значение — нижний
// предел ресайза: раньше в :min-height доски уходила текущая высота, и
// уменьшить доску было нельзя.
const MIN_BOARD_HEIGHT = 120

// Высота из прохождения. Ставится доске LearnProcessor'ом (applyWhiteboardHeights →
// Whiteboard.setHeight) и живёт в реестре визуальной высоты — она приоритетнее answerHeight:
// это высота, которую ученик оставил сам. Правка в режиме редактора ответ
// не трогает — там высота берётся из настройки.
const appliedHeight = ref<number | null>(null)

// Высота, оставленная пользователем в этом сеансе: приоритетнее настройки,
// чтобы перестройка настроек урока её не откатила.
const userHeight = ref<number | null>(null)

// Текущая визуальная высота доски: высота пользователя, иначе высота из
// прохождения (пол из документа ответа ставит реестр — он переживает
// перезагрузку ответов), иначе null — брать из настройки answerHeight.
function visualHeight(): number | null {
  const wb = whiteboardRef.value
  const visual = wb ? heightOf(wb) : {}
  return userHeight.value
    ?? visual.saved
    ?? appliedHeight.value
    ?? visual.floor
    ?? null
}

// Программная установка высоты: доска и контейнер получают её напрямую, без
// эмитов. Это не жест пользователя — подписчики ресайза не срабатывают.
function applyVisualHeight() {
  const wb = whiteboardRef.value
  const height = visualHeight()
  if (!wb || height == null || !wb.setHeight?.(height)) return
  localHeight.value = Math.max(MIN_BOARD_HEIGHT, height)
}

// Реестр высот: он ставит высоту доске и уведомляет колбэком. Присваивание
// visualHeight на экземпляре компонента не реактивно, поэтому контейнер
// узнаёт о новой высоте только отсюда — и растёт вместе с доской
// (иначе overflow-hidden обрежёт холст). Колбэк регистрируется в
// registerCurrentWhiteboard на том же объекте, что хранит реестр.
function onHeightChange(height: number) {
  if (isResizing.value) return
  localHeight.value = Math.max(MIN_BOARD_HEIGHT, height)
}

watch(
  () => child(answerNode.value, 'answerHeight')?.default,
  (val) => {
    if (isResizing.value) return
    const fixed = visualHeight()
    if (fixed !== null) {
      localHeight.value = Math.max(MIN_BOARD_HEIGHT, fixed)
      return
    }
    if (val !== undefined) localHeight.value = Number(val) || 250
  },
  { immediate: true }
)

// Высота может прийти после монтирования (ответы грузятся async).
watch(
  () => props.whiteboardHeight,
  (val) => {
    if (val == null || isResizing.value) return
    appliedHeight.value = Math.max(80, val)
    applyVisualHeight()
  },
)

function startResize(e: MouseEvent) {
  if (!canEdit.value) return
  e.preventDefault()
  isResizing.value = true
  startY = e.clientY
  startHeight = localHeight.value
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
}

function onResize(e: MouseEvent) {
  if (!isResizing.value) return
  const delta = e.clientY - startY
  localHeight.value = Math.max(MIN_BOARD_HEIGHT, startHeight + delta)
}

// force — ресайз вызван ручкой доски: она живёт в режиме прохождения, где
// isResizing (ручка контейнера, только в редакторе) не выставляется.
// skipEmit — высота выставлена программно (из прохождения): запоминаем её без
// эмита настроек, чтобы не гонять update/update:settings на инициализации.
function stopResize(force = false, skipEmit = false) {
  if (!isResizing.value && !force) return
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  if (!force) {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  // Высота, оставленная пользователем: держим её поверх настройки и запоминаем
  // в реестре (переживёт перезагрузку ответов). Программную высоту не трогаем.
  if (!skipEmit) {
    userHeight.value = localHeight.value
    // saveHeight дополнительно запоминает высоту в реестре визуальной высоты —
    // она приоритетнее настройки при следующих перестройках урока.
    if (whiteboardRef.value) registrySaveHeight(whiteboardRef.value, localHeight.value)
  }

  if (skipEmit) return
  if (!answerNode.value?.children) return
  const hIdx = answerNode.value.children.findIndex(c => c.key === 'answerHeight')
  if (hIdx === -1) return

  const ansIdx = props.node.children?.findIndex(c => c.key === 'answer') ?? -1
  if (ansIdx === -1) return

  const newAnswerNode = { ...answerNode.value }
  newAnswerNode.children = [...answerNode.value.children]
  newAnswerNode.children[hIdx] = { ...newAnswerNode.children[hIdx], default: localHeight.value }

  const newChildren = [...(props.node.children || [])]
  newChildren[ansIdx] = newAnswerNode

  const next = { ...props.node, children: newChildren }
  emit('update', next)
  emit('update:settings', [next])
}

onBeforeUnmount(() => stopResize())

// ==================== Высота доски (Whiteboard) ====================
// Режим прохождения: ручка доски меняет её высоту и пишет её в настройку
// answerHeight (тем же путём, что и родная ручка контейнера), чтобы настройка
// уходила в сохранение ответов вместе с уроком.
// stopResize() сам эмитит настройки — canEdit в нём проверять не нужно:
// изменение уже произошло жестом пользователя.
// Доска — источник высоты: при ресайзе она отдаёт реальную отрисованную высоту.
// Сохранение высоту собирает у самой доски (getHeight), событие наружу не нужно —
// только фиксируем её в настройке answerHeight (update/update:settings).
function onWhiteboardResize(height: number) {
  localHeight.value = Math.max(MIN_BOARD_HEIGHT, height)
  stopResize(true, true)
}

// Высота меняется прямо во время жеста: контейнер с фиксированной высотой и
// overflow-hidden без этого обрезал бы растущую доску до отпускания ручки.
// Настройки здесь не эмитятся — сохранение делает onWhiteboardResize на отпускании.
function onWhiteboardResizeMove(height: number) {
  localHeight.value = Math.max(MIN_BOARD_HEIGHT, height)
}

// Доска регистрируется, чтобы Lesson мог прочитать её штрихи и высоту.
onMounted(registerCurrentWhiteboard)

// ==================== Обновление ====================

function onUpdateChildNode(updatedNode: SettingNode) {
  if (!canEdit.value) return
  const idx = props.node.children?.findIndex(c => c.key === updatedNode.key)
  if (idx === -1 || idx === undefined) return

  const newChildren = [...props.node.children]
  newChildren[idx] = updatedNode
  emit('update', { ...props.node, children: newChildren })
}
</script>

<template>
  <!-- Обертка для позиционирования (block-position) -->
  <div class="flex w-full" :style="{ justifyContent: blockPosition }">

    <!-- Контейнер с шириной (block-cols) -->
    <div class="min-w-0 flex flex-col gap-6" :style="{ width: blockWidth }">

      <!-- Эталонный ответ -->
      <div v-if="canEdit && effectiveEthalonNode" class="ethalon-wrapper flex flex-col gap-2">
        <div class="flex items-center gap-2 pl-1">
          <div class="w-1.5 h-1.5 rounded-full bg-success"></div>
          <span class="text-[12px] font-bold uppercase tracking-widest text-success">Эталонный ответ</span>

          <!-- Индикатор, что ответ сгенерирован random.vue -->
          <span
            v-if="hasRandomSolution"
            class="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary"
            title="Ответ сгенерирован автоматически. Перегенерируйте задание, чтобы обновить."
          >
            <UIcon name="i-lucide-wand-2" class="size-3" />
            авто
          </span>
        </div>

        <TextNode
          :node="effectiveEthalonNode"
          :settings="settings"
          :style-path="undefined"
          :editable="canEdit && !hasRandomSolution"
          class="border-2 border-success/30 bg-success/5 rounded-lg shadow-sm p-3 min-h-[16rem] focus:outline-none"
          @update="onUpdateChildNode"
        />
      </div>

      <!-- Ответ ученика -->
      <div class="flex flex-col gap-2">

        <!-- Заголовок -->
        <div v-if="answerTitleNode" >
          <component
            v-if="canEdit"
            :is="answerTitleContainer"
            :style="answerTitleStyle"
            v-inline-edit="titleBinding"
          ></component>

          <component
            v-else
            :is="answerTitleContainer"
            :style="answerTitleStyle"
            v-html="titleBinding.get()"
          ></component>
        </div>
        <div v-else class="pl-1">
          <span class="text-[12px] font-bold uppercase tracking-widest text-primary">Ответ</span>
        </div>

        <!-- Контейнер ответа (Whiteboard) -->
        <div :style="answerMarginStyle">
          <div
            class="answer-container relative w-full flex flex-col group overflow-hidden"
            :class="[
              { 'ring-2 ring-primary/50': isResizing },
            ]"
            :style="{ ...answerBoxStyle, height: `${localHeight}px` }"
          >
            <!-- Холст для рисования -->
            <div class="flex-1 relative overflow-hidden">
              <Whiteboard
                ref="whiteboardRef"
                :pen-size="3"
                :eraser-size="40"
                color="#000000"
                mode="pen"
                :resizable="isLearner"
                :min-height="MIN_BOARD_HEIGHT"
                answer-zone
                @stroke-complete="onStrokeComplete"
                @resize="onWhiteboardResize"
                @resize-move="onWhiteboardResizeMove"
              />
            </div>

            <!-- Ручка ресайза -->
            <div
              v-if="canEdit"
              class="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center cursor-ns-resize z-20"
              @mousedown="startResize"
            >
              <div
                class="w-16 h-1.5 bg-primary/40 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                :class="{ 'bg-primary opacity-100': isResizing }"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.ethalon-wrapper .prose) {
  column-count: 1 !important;
  height: 100%;
}
</style>
