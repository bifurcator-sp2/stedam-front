<!-- components/Constructor/Components/text.vue -->
<script setup lang="ts">
import { ref, computed, inject, type Ref } from 'vue'
import { useFormula } from '~/composables/useFormula'
import { useVideoEmbed } from '~/composables/useVideoEmbed'

const value = defineModel<string>({ default: '' })

const props = defineProps<{
  mode?: 'form' | 'body'
}>()

// ==================== Режим урока ====================

const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))
const canEdit = computed(() => lessonMode.value === 'edit')

// ==================== Рендер для чтения ====================

const { renderFormulas } = useFormula()
const { renderVideos } = useVideoEmbed()
const renderedText = computed(() => renderVideos(renderFormulas(value.value)))

// ==================== Высота textarea для режима form ====================

const MIN_HEIGHT = 80
const DEFAULT_HEIGHT = 120

const textareaHeight = ref(DEFAULT_HEIGHT)
const isResizing = ref(false)

function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true

  const startY = e.clientY
  const startHeight = textareaHeight.value

  function onMove(ev: MouseEvent) {
    const delta = ev.clientY - startY
    const next = startHeight + delta
    textareaHeight.value = next < MIN_HEIGHT ? MIN_HEIGHT : next
  }

  function onUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
}
</script>

<template>
  <!-- Режим формы (для палитры) -->
  <div v-if="props.mode === 'form'" class="relative w-full">
    <UTextarea
      v-model="value"
      :rows="4"
      :style="{ height: textareaHeight + 'px', resize: 'none' }"
      class="w-full"
      autoresize
      maxrows="500"
    />

    <div
      class="absolute bottom-0 right-0 w-4 h-4 cursor-ns-resize flex items-end justify-end p-0.5"
      @mousedown="startResize"
    >
      <div class="w-2 h-2 border-r border-b border-default opacity-60" />
    </div>
  </div>

  <!-- Режим просмотра (body) -->
  <div v-else>
    <!-- Если можно редактировать -->
    <div
      v-if="canEdit"
      v-inline-edit="{
        get: () => value,
        set: (v: string) => (value = v),
        renderFormulas: true,
      }"
      class="text-default inline-edit"
    ></div>

    <!-- Если режим обучения -->
    <div
      v-else
      class="text-default inline-edit"
      v-html="renderedText"
    ></div>
  </div>
</template>

<style scoped>
:deep(.inline-edit) {
  outline: none;
  border-radius: 4px;
  padding: 2px 4px;
}
</style>
