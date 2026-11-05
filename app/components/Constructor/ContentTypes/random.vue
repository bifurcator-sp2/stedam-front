<!-- components/Constructor/ContentTypes/random.vue -->
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { SettingNode } from '~/utils/constructors'
import Htmltext from './htmltext.vue'
import TextNode from '../TextNode.vue'

const props = withDefaults(
  defineProps<{
    node: SettingNode
    settings?: SettingNode[] | null
    stylePath?: string
    editable?: boolean
    id?: number
    isTest?: boolean
    mode?: 'form' | 'body'
  }>(),
  {
    editable: true,
    settings: null,
    stylePath: '',
    id: 0,
    isTest: false,
    mode: 'body',
  },
)

const emit = defineEmits<{
  (e: 'update', value: SettingNode): void
}>()

const route = useRoute()

// ─── Режим редактирования ───────────────────────────────────────────────
const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))
const canEdit = computed(() => props.editable && lessonMode.value === 'edit')

// ─── Проброс контекста ──────────────────────────────────────────────────
const lessonTaxonomyIds = inject<Ref<number[]>>('lesson-taxonomy-ids', ref([]))
const taskComplexity = inject<Ref<number | null>>('task-complexity', ref(null))

// ─── Shared: solution для sibling-блока test.vue ────────────────────────
const randomTaskSolution = inject<Ref<string | null>>('random-task-solution', ref(null))

const api = useApi()

// ═══════════════════════════════════════════════════════════════════════
// БЕРЕМ ДЕРЕВО ИЗ КЕША NUXT
// ═══════════════════════════════════════════════════════════════════════

const { data: taxonomyTreeData } = await useAsyncData<any[]>(
  'taxonomy-tree',
  async () => {
    const res = await api.get<{ data: any[] }>('/taxonomies/tree', { silent: true })
    return res.data
  },
  { lazy: true }
)

const flatTaxonomyMap = computed(() => {
  const map = new Map<number, any>()
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      map.set(n.id, n)
      if (n.children?.length) walk(n.children)
    }
  }
  if (taxonomyTreeData.value) walk(taxonomyTreeData.value)
  return map
})

// ═══════════════════════════════════════════════════════════════════════
// КОНФИГ
// ═══════════════════════════════════════════════════════════════════════

const config = computed(() => {
  const params = (props.node.params as Record<string, any>) || {}
  return {
    subject: typeof params.subject === 'string' ? params.subject : 'math',
    testResolver: typeof params.test_resolver === 'string' ? params.test_resolver : null,
    difficulty: typeof params.difficulty === 'number' ? params.difficulty : null,
    taxonomyId: typeof params.taxonomy_id === 'number' ? params.taxonomy_id : null,
  }
})

const effectiveTaxonomyId = computed(() => {
  if (lessonTaxonomyIds.value?.length) return lessonTaxonomyIds.value[0]
  if (route.query.tax) {
    const n = Number(route.query.tax)
    if (Number.isFinite(n) && n > 0) return n
  }
  return config.value.taxonomyId
})

const contextTestResolver = computed(() => {
  const id = effectiveTaxonomyId.value
  if (!id) return null

  let current = flatTaxonomyMap.value.get(id)
  while (current) {
    if (current.test_resolver) return current.test_resolver
    if (current.parent_id === null || current.parent_id < 0) break
    current = flatTaxonomyMap.value.get(current.parent_id)
  }
  return null
})

// ═══════════════════════════════════════════════════════════════════════
// СЛОЖНОСТЬ
// ═══════════════════════════════════════════════════════════════════════

const isDifficultyLocked = computed(() => taskComplexity.value !== null)

const effectiveDifficulty = computed(() => {
  if (isDifficultyLocked.value) return taskComplexity.value!
  return config.value.difficulty ?? 0.5
})

const difficultyInfo = computed(() => {
  const d = effectiveDifficulty.value
  if (d < 0.3) return { label: 'Базовый', icon: 'i-lucide-book-open', color: '#10b981', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' }
  if (d < 0.6) return { label: 'Продвинутый', icon: 'i-lucide-zap', color: '#f59e0b', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' }
  return { label: 'Сложный', icon: 'i-lucide-trophy', color: '#f43f5e', cls: 'bg-rose-500/10 text-rose-600 border-rose-500/20' }
})

const sliderStyle = computed(() => {
  const p = Math.max(0, Math.min(1, effectiveDifficulty.value))
  return {
    '--_slider-color': difficultyInfo.value.color,
    background: `linear-gradient(to right, ${difficultyInfo.value.color} 0%, ${difficultyInfo.value.color} ${p * 100}%, var(--ui-bg-elevated, #f1f5f9) ${p * 100}%, var(--ui-bg-elevated, #f1f5f9) 100%)`
  }
})

function onDifficultyInput(e: Event) {
  if (isDifficultyLocked.value) return
  const target = e.target as HTMLInputElement
  const val = Number(target.value)
  if (Number.isFinite(val) && val >= 0 && val <= 1) {
    updateParams({ difficulty: val, task: null })
  }
}

function resetDifficulty() {
  if (isDifficultyLocked.value) return
  updateParams({ difficulty: null, task: null })
}

// ═══════════════════════════════════════════════════════════════════════
// СПИСОК ТЕМ (РЕЗОЛВЕРОВ)
// ═══════════════════════════════════════════════════════════════════════

const resolvers = ref<any[]>([])
const resolversLoading = ref(false)

async function fetchResolvers() {
  if (resolversLoading.value) return
  resolversLoading.value = true
  try {
    const res = await api.get<any>('/tasks/resolvers', {
      params: { subject: config.value.subject },
      silent: true,
    })
    const payload = res?.data ?? res
    if (Array.isArray(payload?.resolvers)) {
      resolvers.value = payload.resolvers.filter((r: any) => r.available && !r.is_container)
    }
  } finally {
    resolversLoading.value = false
  }
}

const resolverItems = computed(() => [
  { label: 'Случайная тема', value: '' },
  ...resolvers.value.map((r) => ({
    label: r.label_full,
    value: r.value,
  })),
])

const selectedResolver = computed(() => config.value.testResolver ?? '')

function onResolverChange(v: any) {
  updateParams({ test_resolver: String(v || '').trim() || null, task: null })
}

// ═══════════════════════════════════════════════════════════════════════
// ЛОГИКА ГЕНЕРАЦИИ
// ═══════════════════════════════════════════════════════════════════════

const task = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

function updateParams(patch: Record<string, any>) {
  if (!canEdit.value) return
  const newParams = { ...(props.node.params as object || {}), ...patch }
  for (const k of Object.keys(newParams)) {
    if (newParams[k] == null || newParams[k] === '') delete newParams[k]
  }
  emit('update', { ...props.node, params: newParams })
}

async function generateTask() {
  loading.value = true
  error.value = null
  task.value = null

  try {
    const params: Record<string, any> = {
      subject: config.value.subject,
      test_resolver: contextTestResolver.value || config.value.testResolver || undefined,
      difficulty: effectiveDifficulty.value,
    }

    const res = await api.get<any>('/tasks/random', { params, silent: true })
    const payload = res?.data ?? res

    if (payload && typeof payload.question === 'string') {
      task.value = payload
      if (canEdit.value) updateParams({ task: payload })
    } else {
      error.value = 'Сервер вернул пустое задание'
    }
  } catch (e: any) {
    error.value = e?.data?.message ?? e?.message ?? 'Ошибка при генерации'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (props.node.params?.task) task.value = props.node.params.task

  // Только в редакторе — в уроке (`lesson-mode: 'learn'`) запрос не нужен
  if (canEdit.value) fetchResolvers()
})

watch(effectiveDifficulty, (newVal, oldVal) => {
  if (!canEdit.value) return
  if (newVal !== oldVal) {
    task.value = null
    error.value = null
    updateParams({ task: null })
  }
})

watch(contextTestResolver, (newVal, oldVal) => {
  if (!canEdit.value) return
  if (newVal !== oldVal) {
    task.value = null
    error.value = null
    updateParams({ task: null })
  }
})

// ═══════════════════════════════════════════════════════════════════════
// ПОДГОТОВКА ДАННЫХ ДЛЯ HTMLTEXT (KaTeX + Markdown)
// ═══════════════════════════════════════════════════════════════════════

function prepareTextForHtmltext(text: string): string {
  if (!text) return ''
  let result = text

  // 1. Конвертируем Markdown **bold** в HTML
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 2. Конвертируем LaTeX-разметку бэкенда в формат, который понимает useFormula
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')

  return result
}

// Вычисляемое свойство: берем из task (если открыто в редакторе),
// иначе из default (если это просмотр или список)
const effectiveQuestion = computed(() => {
  if (task.value?.question) return task.value.question
  if (typeof props.node.default === 'string' && props.node.default.trim() !== '') {
    return props.node.default
  }
  return ''
})

const questionNode = computed<SettingNode>(() => ({
  key: 'random_question',
  label: 'Условие',
  type: 'string',
  default: prepareTextForHtmltext(effectiveQuestion.value)
}))

// ═══════════════════════════════════════════════════════════════════════
// ПРОБРОС РЕШЕНИЯ В test.vue (через shared-состояние text_image.vue)
// ═══════════════════════════════════════════════════════════════════════

watch(
  () => task.value?.solution,
  (solution) => {
    const prepared = solution ? prepareTextForHtmltext(solution) : ''
    randomTaskSolution.value = prepared || null
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  randomTaskSolution.value = null
})

// ═══════════════════════════════════════════════════════════════════════
// ЗАГОЛОВОК УСЛОВИЯ ЗАДАЧИ (testLabel)
// ═══════════════════════════════════════════════════════════════════════

const testLabelNode = computed<SettingNode | undefined>(() =>
  props.node.children?.find((c) => c.key === 'testLabel'),
)

function onUpdateTestLabelNode(updatedNode: SettingNode) {
  if (!canEdit.value) return
  const nextChildren = props.node.children?.map((c) =>
    c.key === updatedNode.key ? updatedNode : c
  ) ?? []
  emit('update', { ...props.node, children: nextChildren })
}

// ═══════════════════════════════════════════════════════════════════════
// УПРАВЛЕНИЕ СТИЛЯМИ БЛОКА УСЛОВИЯ (contentbox)
// ═══════════════════════════════════════════════════════════════════════

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

const contentBoxNode = computed(() => {
  return props.node.children?.find((c) => c.key === 'contentbox')
})

const contentSettingsNode = computed(() => {
  return contentBoxNode.value?.children?.find((c) => c.key === 'settings')
})

const contentContainer = computed(() => {
  const val = contentSettingsNode.value?.children?.find(c => c.key === 'container')?.default
  return typeof val === 'string' && val ? val : 'div'
})

const contentAlignClass = computed(() => {
  const align = contentSettingsNode.value?.children?.find(c => c.key === 'text-block-align')?.default
  return align && align !== 'left' ? `text-${align}` : ''
})

const contentSizeClass = computed(() => {
  return contentSettingsNode.value?.children?.find(c => c.key === 'text-size')?.default || ''
})

const contentCols = computed(() => {
  const cols = Number(contentSettingsNode.value?.children?.find(c => c.key === 'text-cols')?.default)
  return Number.isFinite(cols) ? Math.max(1, cols) : 1
})

const contentMarginStyle = computed(() => {
  const box = contentBoxNode.value
  if (!box) return {}

  const s: Record<string, string> = {}
  const margin = box.children?.find(c => c.key === 'margin')

  if (margin?.children) {
    const map = { left: 'marginLeft', right: 'marginRight', top: 'marginTop', bottom: 'marginBottom' }
    for (const [side, css] of Object.entries(map)) {
      const px = toPx(margin.children.find(c => c.key === side)?.default)
      if (px) s[css] = px
    }
  }
  return s
})

const contentBcgStyle = computed(() => {
  const bg = contentBoxNode.value?.children?.find(c => c.key === 'background-color')?.default
  if (!bg) return {}
  const name = String(bg).replace(/^bg-/, '')
  return name && name !== 'inherit' ? { backgroundColor: `var(--bg-${name})` } : {}
})

const contentPaddingStyle = computed(() => {
  const box = contentBoxNode.value
  if (!box) return {}
  const s: Record<string, string> = {}
  const padding = box.children?.find(c => c.key === 'padding')

  if (padding?.children) {
    const map = { left: 'paddingLeft', right: 'paddingRight', top: 'paddingTop', bottom: 'paddingBottom' }
    for (const [side, css] of Object.entries(map)) {
      const px = toPx(padding.children.find(c => c.key === side)?.default)
      if (px) s[css] = px
    }
  }
  return s
})

const contentBorderStyle = computed(() => {
  const box = contentBoxNode.value
  if (!box) return {}
  const s: Record<string, string> = {}
  const border = box.children?.find(c => c.key === 'border')
  if (!border?.children) return s

  const bg = box.children?.find(c => c.key === 'background-color')?.default
  const bgName = typeof bg === 'string' ? bg.replace(/^bg-/, '') : ''
  const bgVar = bgName ? `--bg-${bgName}` : null

  const colorNode = border.children.find(c => c.key === 'color')
  if (colorNode?.default) {
    const name = String(colorNode.default).replace(/^border-/, '')
    if (name === 'inherit') {
      s.borderColor = bgVar ? `var(${bgVar})` : 'transparent'
    } else if (name) {
      s.borderColor = `var(--border-${name})`
    }
    if (s.borderColor) s.borderStyle = 'solid'
  }

  const widthMap = { left: 'borderLeftWidth', right: 'borderRightWidth', top: 'borderTopWidth', bottom: 'borderBottomWidth' }
  for (const [side, css] of Object.entries(widthMap)) {
    const px = toPxBorder(border.children.find(c => c.key === side)?.default)
    if (px) s[css] = px
  }

  const radius = border.children.find(c => c.key === 'radius')
  if (radius?.children) {
    const rMap = { 'top-left': 'borderTopLeftRadius', 'top-right': 'borderTopRightRadius', 'bottom-right': 'borderBottomRightRadius', 'bottom-left': 'borderBottomLeftRadius' }
    for (const [corner, css] of Object.entries(rMap)) {
      const px = toPxRadius(radius.children.find(c => c.key === corner)?.default)
      if (px) s[css] = px
    }
  }

  return s
})
</script>

<template>
  <div class="flex w-full flex-col">

    <!-- ═══════════════ НАСТРОЙКИ (только в редакторах) ═══════════════ -->
    <div
      v-if="canEdit"
      class="flex flex-col gap-4  border-2 border-dashed border-primary/25 bg-primary/[0.02] p-4 mb-4"
    >

      <div
        v-if="contextTestResolver"
        class="flex items-center gap-2  bg-blue-50 border border-blue-100 px-3 py-2 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
      >
        <UIcon name="i-lucide-folder-tree" class="size-4 shrink-0" />
        <span class="text-xs font-semibold">Резолвер таксономии: {{ contextTestResolver }}</span>
      </div>

      <template v-if="!contextTestResolver">
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-semibold uppercase tracking-wider text-muted">Тема</label>
            <span v-if="!config.testResolver" class="text-[10px] italic text-muted">случайная</span>
          </div>
          <USelect
            :model-value="selectedResolver"
            :items="resolverItems"
            size="sm"
            class="w-full bg-default"
            :loading="resolversLoading"
            @update:model-value="onResolverChange"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-semibold uppercase tracking-wider text-muted">Сложность</label>
            <div class="flex items-center gap-2">
              <span :class="['inline-flex items-center gap-1  border px-2 py-0.5 text-[10px] font-semibold', difficultyInfo.cls]">
                <UIcon :name="difficultyInfo.icon" class="size-3" />
                {{ difficultyInfo.label }}
              </span>
              <span class="font-mono text-[10px] text-muted">{{ effectiveDifficulty.toFixed(2) }}</span>
              <button
                v-if="!isDifficultyLocked && config.difficulty !== null"
                type="button"
                class="text-muted hover:text-error transition-colors"
                @click="resetDifficulty"
              >
                <UIcon name="i-lucide-x" class="size-3.5" />
              </button>
            </div>
          </div>
          <input
            v-if="!isDifficultyLocked"
            type="range" min="0" max="1" step="0.05"
            :value="effectiveDifficulty"
            :style="sliderStyle"
            class="w-full h-1.5 appearance-none  outline-none cursor-pointer mt-1
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--ui-bg,#fff)] [&::-webkit-slider-thumb]:bg-[var(--_slider-color)] [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab
                   [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--ui-bg,#fff)] [&::-moz-range-thumb]:bg-[var(--_slider-color)] [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:cursor-grab"
            @input="onDifficultyInput"
          />
          <div v-else class="text-[10px] text-muted mt-1 italic">
            Управляется настройками задания
          </div>
        </div>
      </template>

      <UButton
        icon="i-lucide-wand-2"
        block
        color="primary"
        :loading="loading"
        @click="generateTask"
      >
        Сгенерировать
      </UButton>
    </div>

    <!-- ═══════════════ ОШИБКА ═══════════════ -->
    <div v-if="error" class=" border border-error/30 bg-error/5 p-4 text-center text-sm text-error">
      {{ error }}
    </div>

    <!-- ═══════════════ ЗАДАНИЕ ═══════════════ -->
    <div v-else-if="effectiveQuestion" class="flex flex-col">

      <!-- Заголовок условия задачи (testLabel) -->
      <TextNode
        v-if="testLabelNode"
        :node="testLabelNode"
        :settings="settings"
        :style-path="`${stylePath}.testLabel.settings`"
        :editable="canEdit"
        @update="onUpdateTestLabelNode"
      />

      <!-- 1. Внешняя обертка (только Margin) -->
      <div :style="contentMarginStyle">

        <!-- 2. Визуальная коробка (Background, Border, Padding) -->
        <div :style="[contentBcgStyle, contentBorderStyle, contentPaddingStyle]">

          <!-- 3. Контейнер с колонками и самим текстом -->
          <component
            :is="contentContainer"
            :class="[contentAlignClass, contentSizeClass]"
            :style="{ columnCount: contentCols }"
          >
            <Htmltext :node="questionNode" :editable="false" />
          </component>

        </div>
      </div>

    </div>
  </div>
</template>
