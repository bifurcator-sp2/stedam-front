<!-- components/Constructor/ContentTypes/htmltext.vue -->
<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from 'vue'
import type { EditorToolbarItem } from '@nuxt/ui'
import type { SettingNode } from '~/utils/constructors'
import { useFormula } from '~/composables/useFormula'
import { useVideoEmbed } from '~/composables/useVideoEmbed' // <-- ИМПОРТ

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

const { renderFormulas } = useFormula()
const { renderVideos } = useVideoEmbed() // <-- ИНИЦИАЛИЗАЦИЯ

// ==================== Данные ====================

const htmlValue = computed({
  get: () => {
    const val = props.node.default
    return typeof val === 'string' ? val : ''
  },
  set: (val: string) => {
    const current = typeof props.node.default === 'string' ? props.node.default : ''
    if (val === current) return
    emit('update', { ...props.node, default: val })
  },
})

// Сначала рендерим формулы, затем видео
const renderedHtml = computed(() => renderVideos(renderFormulas(htmlValue.value)))

// ==================== Активный редактор (один на страницу) ====================

const activeId = useState<string | null>('htmltext-active-id', () => null)
const myId = ref<string>('')

const showEditor = computed(() => props.editable && activeId.value === myId.value)

// ==================== Refs ====================

const rootRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)

// Начальный стиль — «за кадром», чтобы до первого замера тулбар не мигнул в неправильной позиции
const toolbarStyle = ref<Record<string, string>>({
  position: 'fixed',
  top: '-9999px',
  left: '-9999px',
  zIndex: '9999',
  visibility: 'hidden',
})

// ==================== Показ по клику ====================

function onRootClick(e: MouseEvent) {
  if (!props.editable) return
  if (!myId.value) return

  const target = e.target as Element | null
  if (!target) return

  // Клик по тулбару или его поповерам — не активируем
  if (target.closest(
    '[data-htmltext-toolbar], [role="menu"], [role="dialog"], [role="listbox"], [role="tooltip"]',
  )) return

  // Уже активен — повторный клик внутри редактора не меняет состояние
  if (activeId.value === myId.value) return

  activeId.value = myId.value
}

// ==================== Скрытие по клику снаружи ====================

function onDocPointerDown(e: PointerEvent) {
  // реагирует только активный экземпляр
  if (activeId.value !== myId.value) return

  const target = e.target as Element | null
  if (!target) return

  // клик внутри самого блока (editor content, ссылки, выделение) — не закрываем
  if (rootRef.value?.contains(target)) return

  // клик в тулбаре или его поповерах — не закрываем
  if (target.closest(
    '[data-htmltext-toolbar], [role="menu"], [role="dialog"], [role="listbox"], [role="tooltip"]',
  )) return

  activeId.value = null
}

// ==================== Позиционирование тулбара ====================

function updateToolbarPosition() {
  if (!rootRef.value || !toolbarRef.value) return

  const rect = rootRef.value.getBoundingClientRect()
  const tRect = toolbarRef.value.getBoundingClientRect()

  const gap = 8
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  // По умолчанию — сверху от блока
  let top = rect.top - gap - tRect.height
  // Не влез по высоте — пробуем снизу
  if (top < 8) top = rect.bottom + gap
  // И снизу не влез — прижимаем к низу вьюпорта
  if (top + tRect.height > viewportH - 8) top = viewportH - tRect.height - 8

  let left = rect.left
  if (left + tRect.width > viewportW - 8) left = viewportW - tRect.width - 8
  if (left < 8) left = 8

  toolbarStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    zIndex: '9999',
  }
}

watch(showEditor, async (visible) => {
  if (!visible) return
  await nextTick()
  updateToolbarPosition()
})

// ==================== Lifecycle ====================

onMounted(() => {
  myId.value = crypto.randomUUID()
  document.addEventListener('pointerdown', onDocPointerDown, true)
  window.addEventListener('scroll', updateToolbarPosition, true)
  window.addEventListener('resize', updateToolbarPosition)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('scroll', updateToolbarPosition, true)
  window.removeEventListener('resize', updateToolbarPosition)
})

// ==================== Хелперы для стилей ====================

function findChild(key: string): SettingNode | undefined {
  return props.node.children?.find(c => c.key === key)
}

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

// ==================== Стили группы ====================

const textBlockPaddingStyle = computed(() => {
  const padding = findChild('padding')
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
  const margin = findChild('margin')
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
  const bg = findChild('background-color')?.default
  const name = typeof bg === 'string' ? bg.replace(/^bg-/, '') : ''
  return name ? { backgroundColor: `var(--bg-${name})` } : {}
})

const textBlockBorderStyle = computed(() => {
  const border = findChild('border')
  if (!border) return {}
  const s: Record<string, string> = {}

  const bgRaw = findChild('background-color')?.default
  const bgName = typeof bgRaw === 'string' ? bgRaw.replace(/^bg-/, '') : ''
  const bgVar = bgName ? `--bg-${bgName}` : null

  const colorNode = border.children?.find(c => c.key === 'color')
  if (colorNode?.default) {
    const name = String(colorNode.default).replace(/^border-/, '')
    if (name === 'inherit') {
      s.borderColor = bgVar ? `var(${bgVar})` : 'transparent'
    } else if (name) {
      s.borderColor = `var(--border-${name})`
    }
    if (s.borderColor) s.borderStyle = 'solid'
  }

  const widthMap = { left: 'borderLeftWidth', right: 'borderRightWidth', top: 'borderTopWidth', bottom: 'borderBottomWidth' } as const
  for (const [side, cssKey] of Object.entries(widthMap)) {
    const px = toPxBorder(border.children?.find(c => c.key === side)?.default)
    if (px) s[cssKey] = px
  }

  const radius = border.children?.find(c => c.key === 'radius')
  if (radius) {
    const rMap = {
      'top-left': 'borderTopLeftRadius',
      'top-right': 'borderTopRightRadius',
      'bottom-right': 'borderBottomRightRadius',
      'bottom-left': 'borderBottomLeftRadius',
    } as const
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

// ==================== Панель инструментов ====================

const toolbarItems: EditorToolbarItem[][] = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Жирный' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Курсив' } },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: 'Подчеркнутый' } },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: 'Зачеркнутый' } },
  ],
  [
    { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', tooltip: { text: 'Заголовок 1' } },
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'Заголовок 2' } },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', tooltip: { text: 'Заголовок 3' } },
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Маркированный список' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Нумерованный список' } },
    { kind: 'blockquote', icon: 'i-lucide-quote', tooltip: { text: 'Цитата' } },
    { kind: 'codeBlock', icon: 'i-lucide-code', tooltip: { text: 'Блок кода' } },
  ],
  [
    { kind: 'link', icon: 'i-lucide-link', tooltip: { text: 'Ссылка' } },
  ],
]
</script>

<template>
  <div
    ref="rootRef"
    :style="[textBlockStyle, textBlockBcgStyle, textBlockBorderStyle]"
    class="htmltext-root w-full"
    @click.stop="onRootClick"
  >
    <ClientOnly>
      <!-- Редактор: появляется по клику -->
      <UEditor
        v-if="showEditor"
        v-slot="{ editor }"
        v-model="htmlValue"
        content-type="html"
        class="w-full min-h-[200px]"
      >
        <!-- Тулбар телепортирован в body: не клипается, поверх любых элементов -->
        <Teleport to="body">
          <div
            ref="toolbarRef"
            data-htmltext-toolbar
            class="htmltext-toolbar-surface"
            :style="toolbarStyle"
          >
            <UEditorToolbar :editor="editor" :items="toolbarItems" layout="fixed" />
          </div>
        </Teleport>
      </UEditor>

      <!-- Просмотр: v-html + KaTeX-формулы + видео, когда редактор не активен -->
      <div
        v-else
        v-html="renderedHtml"
        class="htmltext-preview prose dark:prose-invert max-w-none min-h-[200px]"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
.htmltext-toolbar-surface {
  display: inline-block;
  padding: 4px 6px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  white-space: nowrap;
}

/* Гасим sticky/fixed внутри UEditorToolbar — наша обёртка сама задаёт позицию */
.htmltext-toolbar-surface :deep([data-slot='toolbar']),
.htmltext-toolbar-surface :deep(.editor-toolbar) {
  position: static !important;
  box-shadow: none !important;
  border: none !important;
  background: transparent !important;
}
</style>
