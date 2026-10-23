<!-- components/Constructor/ContentTypes/text3.vue -->
<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import TextNode from '../TextNode.vue'
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

// ==================== Режим урока ====================

const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))

// Разрешаем редактирование только в режиме edit
const canEdit = computed(() => props.editable && lessonMode.value === 'edit')

// ==================== Хелперы ====================

const titleNode = computed(() => props.node.children?.find(c => c.key === 'title'))
const summaryNode = computed(() => props.node.children?.find(c => c.key === 'summary'))
const textNode = computed(() => props.node.children?.find(c => c.key === 'text'))

// ==================== Стили группы ====================

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

const textBlockPaddingStyle = computed(() => {
  const padding = props.node.children?.find(c => c.key === 'padding')
  if (!padding) return {}
  const s: Record<string, string> = {}
  const map = { left: 'paddingLeft', right: 'paddingRight', top: 'paddingTop', bottom: 'paddingBottom' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = toPx(padding.children?.find(c => c.key === side)?.default)
    if (px) s[cssKey] = px
  }
  return s
})

const textBlockMarginStyle = computed(() => {
  const margin = props.node.children?.find(c => c.key === 'margin')
  if (!margin) return {}
  const s: Record<string, string> = {}
  const map = { left: 'marginLeft', right: 'marginRight', top: 'marginTop', bottom: 'marginBottom' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = toPx(margin.children?.find(c => c.key === side)?.default)
    if (px) s[cssKey] = px
  }
  return s
})

const textBlockBcgStyle = computed(() => {
  const bg = props.node.children?.find(c => c.key === 'background-color')?.default
  const name = typeof bg === 'string' ? bg.replace(/^bg-/, '') : ''
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})

const textBlockBorderStyle = computed(() => {
  const border = props.node.children?.find(c => c.key === 'border')
  if (!border) return {}
  const s: Record<string, string> = {}
  const bg = props.node.children?.find(c => c.key === 'background-color')?.default
  const bgName = typeof bg === 'string' ? bg.replace(/^bg-/, '') : ''
  const bgVar = bgName ? `--bg-${bgName}` : null

  const colorNode = border.children?.find(c => c.key === 'color')
  if (colorNode?.default) {
    const name = colorNode.default.replace(/^border-/, '')
    if (name === 'inherit') {
      s.borderColor = bgVar ? `var(${bgVar})` : 'transparent'
    } else if (name) {
      s.borderColor = `var(--border-${name})`
    }
    if (s.borderColor) s.borderStyle = 'solid'
  }

  const map = { left: 'borderLeftWidth', right: 'borderRightWidth', top: 'borderTopWidth', bottom: 'borderBottomWidth' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = toPxBorder(border.children?.find(c => c.key === side)?.default)
    if (px) s[cssKey] = px
  }

  const radius = border.children?.find(c => c.key === 'radius')
  if (radius) {
    const rMap = { 'top-left': 'borderTopLeftRadius', 'top-right': 'borderTopRightRadius', 'bottom-right': 'borderBottomRightRadius', 'bottom-left': 'borderBottomLeftRadius' } as const
    for (const [corner, cssKey] of Object.entries(rMap)) {
      const px = toPxRadius(radius.children?.find(c => c.key === corner)?.default)
      if (px) s[cssKey] = px
    }
  }
  return s
})

const textBlockStyle = computed(() => ({
  ...textBlockPaddingStyle.value,
  ...textBlockMarginStyle.value,
}))

// ==================== Обновление ====================

function onUpdateTextNode(updatedNode: SettingNode) {
  if (!canEdit.value) return // Страховка для режима learn

  const nextChildren = props.node.children?.map((c) =>
    c.key === updatedNode.key ? updatedNode : c
  ) ?? []

  emit('update', { ...props.node, children: nextChildren })
}
</script>

<template>
  <div :style="[textBlockStyle, textBlockBcgStyle, textBlockBorderStyle]" class="w-full">
    <TextNode
      v-if="titleNode"
      :node="titleNode"
      :settings="settings"
      :style-path="`${stylePath}.title.settings`"
      :editable="canEdit"
      @update="onUpdateTextNode"
    />

    <TextNode
      v-if="summaryNode"
      :node="summaryNode"
      :settings="settings"
      :style-path="`${stylePath}.summary.settings`"
      :editable="canEdit"
      @update="onUpdateTextNode"
    />

    <TextNode
      v-if="textNode"
      :node="textNode"
      :settings="settings"
      :style-path="`${stylePath}.text.settings`"
      :editable="canEdit"
      @update="onUpdateTextNode"
    />
  </div>
</template>
