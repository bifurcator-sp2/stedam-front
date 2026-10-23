<!-- components/Constructor/Components/text_image.vue -->
<script setup lang="ts">
import { computed, inject, ref, type Component, type Ref } from 'vue'
import type { SettingNode } from '~/utils/constructors'

const value = defineModel<SettingNode | null>({ default: null })

const props = withDefaults(defineProps<{
  mode?: 'form' | 'body'
  id?: number
  allowDragAndDrop?: boolean
  showToDeleteImages?: boolean
  initialImages?: any[]
  modelName?: string | null
}>(), {
  allowDragAndDrop: true,
  showToDeleteImages: false,
  initialImages: () => [],
  modelName: 'blocks',
})

// ==================== Режим урока ====================

const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))

// Разрешаем редактирование только в режиме edit
const isEditable = computed(() => lessonMode.value === 'edit')

// Передаем вниз флаги, учитывая режим
const allowDrag = computed(() => props.allowDragAndDrop && isEditable.value)
const allowDelete = computed(() => props.showToDeleteImages && isEditable.value)

// ==================== Динамический рендеринг компонентов ====================

const contentModules = import.meta.glob('../ContentTypes/*.vue', { eager: true })

function getContentComponent(name: string): Component | null {
  if (!name) return null
  const normalized = name.toLowerCase().trim()

  // 1. Пытаемся найти точное совпадение файла
  const exactPath = `../ContentTypes/${normalized}.vue`
  if (contentModules[exactPath]) {
    return (contentModules[exactPath] as any).default
  }

  // 2. Если точного нет, ищем по префиксу (например, 'text' найдет 'text3.vue')
  for (const key of Object.keys(contentModules)) {
    const basename = key.split('/').pop()?.replace('.vue', '')
    if (basename && basename.startsWith(normalized)) {
      return (contentModules[key] as any).default
    }
  }

  return null
}

// ==================== Layout ====================

const layoutNode = computed(() => {
  const v = value.value as any
  if (Array.isArray(v)) {
    return v.find((b: any) => b.type === 'layout' || b.key === 'type') ?? null
  }
  if (v && typeof v === 'object' && (v.type === 'layout' || v.key === 'type')) {
    return v
  }
  return null
})

const layoutChildren = computed(() => layoutNode.value?.children || [])

function getLayoutProp(key: string): any {
  return layoutChildren.value.find((c: any) => c.key === key)?.default
}

const layoutType = computed(() => layoutNode.value?.default ?? 'single')

const contentBlocksNode = computed(() => {
  return layoutChildren.value.find((c: any) => c.key === 'content-blocks')
})

const visibleBlocks = computed(() => {
  if (!contentBlocksNode.value?.children || !Array.isArray(contentBlocksNode.value.children)) return []
  if (layoutType.value === 'single') {
    return contentBlocksNode.value.children.slice(0, 1)
  }
  return contentBlocksNode.value.children.slice(0, 2)
})

const firstBlockPercent = computed(() => {
  const cols = Number(getLayoutProp('first-block-cols') ?? 12)
  return Math.min(Math.max(cols / 24, 0), 1)
})

const secondBlockPercent = computed(() => 1 - firstBlockPercent.value)

const singlePosition = computed(() => {
  const pos = getLayoutProp('first-block-position')
  if (pos === 'flex-start' || pos === 'center' || pos === 'flex-end') return pos
  return 'center'
})

const layoutClass = computed(() => {
  if (layoutType.value === 'row') return 'flex flex-row items-start w-full'
  if (layoutType.value === 'col') return 'flex flex-col items-start w-full'
  return 'flex flex-row w-full'
})

const layoutContainerStyle = computed(() => {
  if (layoutType.value === 'single') {
    return { justifyContent: singlePosition.value }
  }
  return {}
})

function getBlockStyle(blockIndex: number) {
  if (layoutType.value === 'single') {
    return { width: `${firstBlockPercent.value * 100}%` }
  }
  if (layoutType.value === 'row') {
    const percent = blockIndex === 0 ? firstBlockPercent.value : secondBlockPercent.value
    return { flex: `0 0 ${percent * 100}%` }
  }
  return { width: '100%' }
}

// ==================== Стили корневого контейнера ====================

const layoutBcgStyle = computed(() => {
  const style: Record<string, string> = {}
  const bgColor = getLayoutProp('background-color')
  const name = typeof bgColor === 'string' ? bgColor.replace(/^bg-/, '') : ''
  if (name) style.backgroundColor = `var(--bg-${name})`

  const bgImageNode = layoutChildren.value.find((c: any) => c.key === 'background-image')
  const bgImage = Array.isArray(bgImageNode?.default) ? bgImageNode.default[0] : null
  const bgUrl = bgImage?.url ?? null

  if (bgUrl) {
    style.backgroundImage = `url(${bgUrl})`
    const bgSize = getLayoutProp('background-size')
    const bgPosition = getLayoutProp('background-position')
    if (bgSize) style.backgroundSize = bgSize
    if (bgPosition) style.backgroundPosition = bgPosition
    style.backgroundRepeat = 'no-repeat'
  }
  return style
})

const layoutBorderStyle = computed(() => {
  const border = layoutChildren.value.find((c: any) => c.key === 'border')?.children
  if (!border) return {}

  const s: Record<string, string> = {}
  const colorNode = border.find((b: any) => b.key === 'color')
  const bgColor = getLayoutProp('background-color')
  const bgVarName = typeof bgColor === 'string' ? bgColor.replace(/^bg-/, '') : ''
  const bgVar = bgVarName ? `--bg-${bgVarName}` : null

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
    const px = border.find((b: any) => b.key === side)?.default
    if (px) s[cssKey] = `${px}px`
  }

  const radius = border.find((b: any) => b.key === 'radius')?.children
  if (radius) {
    const rMap = { 'top-left': 'borderTopLeftRadius', 'top-right': 'borderTopRightRadius', 'bottom-right': 'borderBottomRightRadius', 'bottom-left': 'borderBottomLeftRadius' } as const
    for (const [corner, cssKey] of Object.entries(rMap)) {
      const px = radius.find((b: any) => b.key === corner)?.default
      if (px) s[cssKey] = `${px * 4}px`
    }
  }
  return s
})

const layoutMarginStyle = computed(() => {
  const margin = layoutChildren.value.find((c: any) => c.key === 'margin')?.children
  if (!margin) return {}
  const s: Record<string, string> = {}
  const map = { left: 'marginLeft', right: 'marginRight', top: 'marginTop', bottom: 'marginBottom' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = margin.find((b: any) => b.key === side)?.default
    if (px) s[cssKey] = `${px * 4}px`
  }
  return s
})

const layoutPaddingStyle = computed(() => {
  const padding = layoutChildren.value.find((c: any) => c.key === 'padding')?.children
  if (!padding) return {}
  const s: Record<string, string> = {}
  const map = { left: 'paddingLeft', right: 'paddingRight', top: 'paddingTop', bottom: 'paddingBottom' } as const
  for (const [side, cssKey] of Object.entries(map)) {
    const px = padding.find((b: any) => b.key === side)?.default
    if (px) s[cssKey] = `${px * 4}px`
  }
  return s
})

// ==================== Работа с контентом блоков ====================

function getActiveChild(block: any): SettingNode | null {
  if (!block.children) return null
  return block.children.find((c: any) => c.key === block.default || c.key.startsWith(block.default)) ?? null
}

function getGalleryNode(block: any): SettingNode | null {
  const galleryWrapper = block.children?.find((c: any) => c.key === 'gallery')
  return galleryWrapper?.children?.find((c: any) => c.type === 'image') ?? null
}

function getChildPath(block: any, blockIndex: number) {
  if (block.default === 'gallery') {
    const galleryNode = getGalleryNode(block)
    return `type.content-blocks.${block.key}.gallery.${galleryNode?.key}`
  }
  const activeChild = getActiveChild(block)
  return `type.content-blocks.${block.key}.${activeChild?.key}`
}

function onUpdateChild(blockIndex: number, updatedNode: SettingNode) {
  if (!isEditable.value) return // Блокируем обновления в режиме learn

  const root = value.value as any
  if (!root || !root.children) return

  const cbIdx = root.children.findIndex((c: any) => c.key === 'content-blocks')
  if (cbIdx === -1) return

  const newContentBlocks = { ...root.children[cbIdx] }
  if (!newContentBlocks.children) return

  const newBlocks = [...newContentBlocks.children]
  const block = { ...newBlocks[blockIndex] }

  if (block.children) {
    if (block.default === 'gallery') {
      const wrapperIdx = block.children.findIndex((c: any) => c.key === 'gallery')
      if (wrapperIdx !== -1) {
        const newWrapper = { ...block.children[wrapperIdx] }
        if (newWrapper.children) {
          const imgIdx = newWrapper.children.findIndex((c: any) => c.key === updatedNode.key || c.key.startsWith(block.default))
          if (imgIdx !== -1) {
            newWrapper.children = [...newWrapper.children]
            newWrapper.children[imgIdx] = updatedNode
            block.children = [...block.children]
            block.children[wrapperIdx] = newWrapper
          }
        }
      }
    } else {
      const childIdx = block.children.findIndex((c: any) => c.key === updatedNode.key || c.key.startsWith(block.default))
      if (childIdx !== -1) {
        block.children = [...block.children]
        block.children[childIdx] = updatedNode
      }
    }
  }

  newBlocks[blockIndex] = block
  newContentBlocks.children = newBlocks

  value.value = {
    ...root,
    children: [
      ...root.children.slice(0, cbIdx),
      newContentBlocks,
      ...root.children.slice(cbIdx + 1),
    ],
  } as SettingNode
}
</script>

<template>
  <!-- Режим формы (для палитры) -->
  <div v-if="props.mode === 'form'">
    <div>Тут ничего нет еще</div>
  </div>

  <!-- Режим просмотра (body) -->
  <div v-else class="text-image-root min-h-[200px] w-full">
    <div :style="[layoutMarginStyle]">
      <div
        :style="[layoutBcgStyle, layoutBorderStyle, layoutPaddingStyle, layoutContainerStyle]"
        :class="layoutClass"
      >
        <template v-for="(block, index) in visibleBlocks" :key="block.key">
          <div
            v-if="getContentComponent(block.default) && getActiveChild(block)"
            :style="getBlockStyle(index)"
            class="min-w-0"
          >
            <component
              :is="getContentComponent(block.default)!"
              :node="getActiveChild(block)!"
              :gallery="getGalleryNode(block)!"
              :settings="value"
              :style-path="getChildPath(block, index)"
              :allow-drag-and-drop="allowDrag"
              :show-to-delete-images="allowDelete"
              @update="onUpdateChild(index, $event)"
            />
          </div>
          <div v-else class="p-4 text-xs text-red-500 bg-red-50 rounded">
            Блок "{{ block.key }}" (default: {{ block.default }}) не найден или нет активного компонента
          </div>
        </template>

        <div v-if="!visibleBlocks.length" class="p-4 text-xs text-yellow-600 bg-yellow-50 rounded">
          Массив visibleBlocks пуст. Проверьте наличие content-blocks в настройках.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-image-root {
  position: relative;
}
</style>
