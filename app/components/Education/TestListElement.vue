<!-- app/components/Education/TestListElement.vue -->
<script setup lang="ts">
import { provide, ref, onMounted, onBeforeUnmount } from 'vue'
import BlockRenderer from '~/components/Constructor/BlockRenderer.vue'
import type { SettingNode } from '~/utils/constructors'

const props = defineProps<{
  test: any
}>()

// Включаем режим "обучения"
provide('lesson-mode', ref('learn'))

const localSettings = ref<SettingNode[]>(
  props.test.settings ? [props.test.settings] : []
)

// ==================== Логика масштабирования ====================

const VIRTUAL_WIDTH = 800
const containerRef = ref<HTMLElement | null>(null)
const zoomFactor = ref(1)
let resizeObserver: ResizeObserver | null = null
let domObserver: MutationObserver | null = null

// ==================== Полное удаление Whiteboard ====================

function processElement(root: HTMLElement) {
  root.querySelectorAll('canvas').forEach(canvas => {
    // 1. Ищем контейнер, который создает жесткую высоту (в test.vue это .answer-container)
    const answerContainer = canvas.closest('.answer-container')
    if (answerContainer) {
      answerContainer.remove()
      return
    }

    // 2. Если это просто Whiteboard (например, в text_image), удаляем его корневой div
    // В Whiteboard.vue корневой div имеет классы 'relative w-full h-full'
    const whiteboardRoot = canvas.closest('.relative.w-full.h-full') || canvas.parentElement
    if (whiteboardRoot) {
      whiteboardRoot.remove()
    }
  })

  // На всякий случай удаляем отдельно стоящий тулбар
  root.querySelectorAll('.wb-toolbar').forEach(toolbar => {
    const rootEl = toolbar.closest('.relative.w-full.h-full') || toolbar.parentElement
    if (rootEl) rootEl.remove()
  })
}

onMounted(() => {
  if (!containerRef.value) return

  // 1. Инициализируем зум
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width
      if (width > 0) {
        zoomFactor.value = width / VIRTUAL_WIDTH
      }
    }
  })
  resizeObserver.observe(containerRef.value)

  // 2. Первичная очистка
  processElement(containerRef.value)

  // 3. Отслеживаем появление новых элементов
  domObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.tagName === 'CANVAS') {
              // Если добавился canvas
              const answerContainer = node.closest('.answer-container')
              if (answerContainer) {
                answerContainer.remove()
              } else {
                const whiteboardRoot = node.closest('.relative.w-full.h-full') || node.parentElement
                if (whiteboardRoot) whiteboardRoot.remove()
              }
            } else if (node.querySelector) {
              // Если добавился контейнер с canvas внутри
              processElement(node)
            }
          }
        })
      }
    }
  })

  domObserver.observe(containerRef.value, { childList: true, subtree: true })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  domObserver?.disconnect()
})
</script>

<template>
  <!-- Убраны bg-elevated/30, rounded-md и border border-default -->
  <div ref="containerRef" class="relative w-full overflow-hidden">
    <div
      class="pointer-events-none origin-top-left"
      :style="{
        zoom: zoomFactor,
        width: `${VIRTUAL_WIDTH}px`
      }"
    >
      <BlockRenderer
        :code="test.block_type_code"
        :id="test.id"
        :is-test="true"
        mode="body"
        v-model:settings="localSettings"
        :allow-drag-and-drop="false"
        :show-to-delete-images="false"
      />
    </div>
  </div>
</template>
