<!-- components/Constructor/TextNode.vue -->
<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { useFormula } from '~/composables/useFormula'
import { useVideoEmbed } from '~/composables/useVideoEmbed'
import type { InlineEditBinding } from '~/directives/inlineEdit'
import type { SettingNode } from '~/utils/constructors'

const props = withDefaults(defineProps<{
  node: SettingNode
  settings?: SettingNode | null
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

const { renderFormulas } = useFormula()
const { renderVideos } = useVideoEmbed()

// ==================== Режим урока ====================

const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))

// Разрешаем редактирование только в режиме edit
const canEdit = computed(() => props.editable && lessonMode.value === 'edit')

// ==================== Резолв пути ====================

function resolvePath(root: any, path: string): any {
  if (root == null || !path) return undefined

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

function styleGet(key: string) {
  if (!props.stylePath) return undefined
  return resolvePath(props.settings, `${props.stylePath}.${key}`)
}

// ==================== Вычисляемые стили ====================

const container = computed(() => styleGet('container') || 'ProseP')
const sizeClass = computed(() => {
  const size = styleGet('text-size')
  return size ? ` ${size} ` : ' '
})
const alignClass = computed(() => {
  const align = styleGet('text-block-align')
  return align ? `text-${align}` : ''
})
const colsValue = computed(() => {
  const raw = styleGet('text-cols')
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 1), 4) : 1
})

// ==================== Значение и Inline Edit ====================

const textValue = computed(() => typeof props.node.default === 'string' ? props.node.default : '')

const binding = computed<InlineEditBinding>(() => ({
  get: () => textValue.value,
  set: (v: string) => {
    if (v === textValue.value) return
    emit('update', { ...props.node, default: v })
  },
  renderFormulas: (html: string) => renderVideos(renderFormulas(html)),
}))

const isEmpty = computed(() => !textValue.value.trim())

// Для режима чтения рендерим HTML вручную
const renderedText = computed(() => renderVideos(renderFormulas(textValue.value)))
</script>

<template>
  <!-- Режим редактирования -->
  <component
    :is="container"
    v-if="canEdit"
    :style="{ columnCount: colsValue }"
    :class="[sizeClass, alignClass, 'block-title-break']"
    v-inline-edit="binding"
  ></component>

  <!-- Режим обучения (или если редактирование запрещено пропсом) -->
  <component
    :is="container"
    v-else-if="!isEmpty"
    :style="{ columnCount: colsValue }"
    :class="[sizeClass, alignClass, 'block-title-break']"
    v-html="renderedText"
  ></component>
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
</style>
