<!-- components/Constructor/ContentTypes/test.vue -->
<script setup lang="ts">
import { computed, inject, ref, onBeforeUnmount, watch, type Ref } from 'vue'
import TextNode from '../TextNode.vue'
import Whiteboard from '~/components/Education/Whiteboard/Whiteboard.vue'
import type { InlineEditBinding } from '~/directives/inlineEdit'
import type { SettingNode } from '~/utils/constructors'

const props = withDefaults(defineProps<{
  node: SettingNode
  settings?: SettingNode[] | null
  stylePath?: string
  editable?: boolean
}>(), {
  editable: true,
  settings: null,
  stylePath: '',
})

const emit = defineEmits<{
  (e: 'update', value: SettingNode): void
}>()

const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))
const canEdit = computed(() => props.editable && lessonMode.value === 'edit')

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

watch(
  () => child(answerNode.value, 'answerHeight')?.default,
  (val) => {
    if (val !== undefined && !isResizing.value) {
      localHeight.value = Number(val) || 250
    }
  },
  { immediate: true }
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
  localHeight.value = Math.max(80, startHeight + delta)
}

function stopResize() {
  if (!isResizing.value) return
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''

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

  emit('update', { ...props.node, children: newChildren })
}

onBeforeUnmount(() => stopResize())

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

      <!-- Эталон -->
      <div v-if="canEdit && ethalonNode" class="ethalon-wrapper flex flex-col gap-2">
        <div class="flex items-center gap-2 pl-1">
          <div class="w-1.5 h-1.5 rounded-full bg-success"></div>
          <span class="text-[12px] font-bold uppercase tracking-widest text-success">Эталонный ответ</span>
        </div>

        <!-- Убрали обертку с border/bg, перенесли всё на TextNode -->
        <TextNode
          :node="ethalonNode"
          :settings="settings"
          :style-path="undefined"
          :editable="canEdit"
          class="border-2 border-success/30 bg-success/5 rounded-lg shadow-sm p-3 min-h-[16rem] focus:outline-none"
          @update="onUpdateChildNode"
        />
      </div>

      <!-- Ответ ученика -->
      <div class="flex flex-col gap-2">


        <!-- Заголовок -->
        <div v-if="answerTitleNode" >
          <!-- Режим редактирования -->
          <component
            v-if="canEdit"
            :is="answerTitleContainer"
            :style="answerTitleStyle"
            v-inline-edit="titleBinding"
          ></component>

          <!-- Режим обучения (или редактирование запрещено) -->
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
            class="answer-container relative w-full transition-all duration-150 flex flex-col group overflow-hidden"
            :class="[
              { 'ring-2 ring-primary/50': isResizing },
            ]"
            :style="{ ...answerBoxStyle, height: `${localHeight}px` }"
          >
            <!-- Холст для рисования -->
            <div class="flex-1 relative overflow-hidden">
              <Whiteboard
                :pen-size="3"
                :eraser-size="40"
                color="#000000"
                mode="pen"
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
