<!-- app/components/Constructor/TaxonomySelector.vue -->
<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch, type Ref } from 'vue'

// ============================================================
// Режим урока (из Lesson.vue)
// ============================================================
const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))

// ============================================================
// Типы
// ============================================================

interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

interface FlatNode extends TaxonomyNode {
  path: string
  depth: number
}

// ============================================================
// Модель
// ============================================================

const model = defineModel<number[] | null>({ default: null })

// ============================================================
// Состояние
// ============================================================

const api = useApi()
const loading = ref(false)
const error = ref<string | null>(null)
const tree = ref<TaxonomyNode[]>([])
const loaded = ref(false)
const search = ref('')

// Принудительное открытие, если пусто
const internalOpen = ref(false)
const isOpen = computed({
  get: () => internalOpen.value,
  set: (val) => {
    // Блокируем закрытие, если ничего не выбрано
    if (!val && (!model.value || model.value.length === 0)) return
    internalOpen.value = val
  }
})

// ============================================================
// Загрузка дерева
// ============================================================

async function load() {
  if (loading.value || loaded.value) return
  loading.value = true
  error.value = null

  try {
    const res = await api.get<{ data: TaxonomyNode[] }>('/taxonomies/tree', { silent: true })
    tree.value = res.data ?? []
    loaded.value = true
  } catch (e: any) {
    error.value = e?.data?.message ?? e?.message ?? 'Ошибка загрузки'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  await nextTick()
  if (lessonMode.value === 'edit' && !model.value?.length) {
    internalOpen.value = true
  }
})

// Если выбор сбросили через крестик — принудительно открываем
watch(model, (val) => {
  if (lessonMode.value === 'edit' && (!val || val.length === 0)) {
    internalOpen.value = true
  }
})

// ============================================================
// Вычисляемые данные (Дерево)
// ============================================================

const flatNodes = computed<FlatNode[]>(() => {
  const result: FlatNode[] = []
  const walk = (nodes: TaxonomyNode[], path: string[], depth: number) => {
    for (const n of nodes) {
      const nextPath = [...path, n.title || '—']
      result.push({ ...n, path: nextPath.join(' / '), depth })
      if (n.children?.length) walk(n.children, nextPath, depth + 1)
    }
  }
  walk(tree.value, [], 0)
  return result
})

const byId = computed(() => new Map(flatNodes.value.map((n) => [n.id, n])))
const selectedIds = computed(() => model.value ?? [])

// Возвращаем массив выбранных узлов (на будущее, если будет мультивыбор)
const selectedNodes = computed(() => {
  return selectedIds.value
    .map(id => byId.value.get(id))
    .filter((n): n is FlatNode => Boolean(n))
})

const filteredNodes = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return flatNodes.value
  return flatNodes.value.filter(
    (n) => (n.title ?? '').toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
  )
})

// ============================================================
// Действия
// ============================================================

function isLeaf(node: TaxonomyNode): boolean {
  return !node.children || node.children.length === 0
}

function select(node: TaxonomyNode) {
  if (!isLeaf(node)) return
  model.value = [node.id]
  internalOpen.value = false
}

function clear() {
  model.value = null
}
</script>

<template>
  <!-- В режиме learn (ученик) -->
  <div
    v-if="lessonMode === 'learn'"
    class="flex items-start gap-1.5 rounded-md border border-default bg-elevated px-2 py-1 text-[12px] font-medium text-highlighted w-full"
  >
    <UIcon name="i-lucide-folder-tree" class="size-3.5 shrink-0 text-primary/70 mt-[2px]" />
    <div v-if="selectedNodes.length" class="flex-1 min-w-0 flex flex-col gap-0.5">
      <span v-for="node in selectedNodes" :key="node.id" class="break-words leading-tight">{{ node.title || 'Без раздела' }}</span>
    </div>
    <span v-else class="flex-1 min-w-0">Без раздела</span>
  </div>

  <!-- В режиме edit (редактор) -->
  <UPopover
    v-else
    v-model:open="isOpen"
    class="w-full"
    :content="{ side: 'bottom', align: 'end', sideOffset: 8 }"
  >
    <!-- Триггер (бейдж) -->
    <template #default>
      <!-- Если раздел выбран -->
      <div
        v-if="selectedNodes.length"
        class="flex items-start gap-1.5 rounded-md border border-default bg-elevated px-2 py-1 text-[12px] font-medium text-highlighted cursor-pointer hover:bg-elevated/80 transition-colors w-full"
        title="Изменить раздел"
      >
        <UIcon name="i-lucide-folder-tree" class="size-3.5 shrink-0 text-primary/70 mt-[2px]" />
        <div class="flex-1 min-w-0 flex flex-col gap-0.5">
          <span v-for="node in selectedNodes" :key="node.id" class="break-words leading-tight">{{ node.title || 'Без названия' }}</span>
        </div>
        <button
          type="button"
          class="shrink-0 mt-[2px] text-muted hover:text-error transition-colors"
          @click.stop="clear"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>

      <!-- Если раздел не выбран: красный пульсирующий бейдж -->
      <div
        v-else
        class="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[12px] font-medium text-red-600 cursor-pointer animate-pulse w-full"
        title="Необходимо выбрать раздел"
      >
        <UIcon name="i-lucide-alert-circle" class="size-3.5 shrink-0" />
        <span>Выберите раздел</span>
      </div>
    </template>

    <!-- Выпадающий список -->
    <template #content>
      <div class="flex max-h-[320px] w-[320px] flex-col">
        <div class="shrink-0 border-b border-default p-2">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            size="xs"
            placeholder="Поиск раздела..."
            autofocus
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-1">
          <LoadingOverlay :loading="loading">
            <div v-if="error" class="p-3 text-center text-[11px] text-error">
              {{ error }}
            </div>
            <div v-else-if="!filteredNodes.length" class="p-3 text-center text-[11px] text-muted">
              Ничего не найдено
            </div>

            <button
              v-for="node in filteredNodes"
              :key="node.id"
              type="button"
              class="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors"
              :class="{
                'hover:bg-elevated cursor-pointer': isLeaf(node),
                'cursor-default opacity-80': !isLeaf(node),
                'bg-primary/5': selectedIds.includes(node.id)
              }"
              @click="select(node)"
            >
              <UIcon
                v-if="isLeaf(node)"
                :name="selectedIds.includes(node.id) ? 'i-lucide-check-square' : 'i-lucide-square'"
                class="mt-0.5 size-3.5 shrink-0"
                :class="selectedIds.includes(node.id) ? 'text-primary' : 'text-muted'"
              />
              <UIcon
                v-else
                name="i-lucide-folder"
                class="mt-0.5 size-3.5 shrink-0 text-muted/50"
              />

              <div class="min-w-0 flex-1">
                <div
                  class="text-[12px] font-medium leading-tight break-words"
                  :class="isLeaf(node) ? 'text-highlighted' : 'text-muted'"
                >
                  {{ node.title || '—' }}
                </div>
                <div class="font-mono text-[10px] text-muted/70 break-words leading-tight mt-0.5">
                  {{ node.path }}
                </div>
              </div>
            </button>
          </LoadingOverlay>
        </div>
      </div>
    </template>
  </UPopover>
</template>
