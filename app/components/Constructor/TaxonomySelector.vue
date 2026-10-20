<!-- app/components/Constructor/TaxonomySelector.vue -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

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

    // Открываем поповер ТОЛЬКО после загрузки данных,
    // если урок еще не привязан к разделу
    if (!model.value || model.value.length === 0) {
      internalOpen.value = true
    }
  } catch (e: any) {
    error.value = e?.data?.message ?? e?.message ?? 'Ошибка загрузки'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Если выбор сбросили через крестик — принудительно открываем
watch(model, (val) => {
  if (!val || val.length === 0) {
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
const selectedNode = computed(() => selectedIds.value.length ? byId.value.get(selectedIds.value[0]) : null)

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

function select(id: number) {
  model.value = [id]
  internalOpen.value = false
}

function clear() {
  model.value = null
}
</script>

<template>
  <UPopover v-model:open="isOpen" :content="{ side: 'bottom', align: 'end', sideOffset: 8 }">
    <!-- Триггер (бейдж) -->
    <template #default>
      <!-- Если раздел выбран: обычный бейдж -->
      <div
        v-if="selectedNode"
        class="flex items-center gap-1.5 rounded-md border border-default bg-elevated px-2 py-1 text-[12px] font-medium text-highlighted cursor-pointer hover:bg-elevated/80 transition-colors"
        title="Изменить раздел"
      >
        <UIcon name="i-lucide-folder-tree" class="size-3.5 text-primary/70" />
        <span class="max-w-[150px] truncate">{{ selectedNode.title || 'Без названия' }}</span>
        <button
          type="button"
          class="text-muted hover:text-error ml-0.5 transition-colors"
          @click.stop="clear"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>

      <!-- Если раздел не выбран: красный пульсирующий бейдж -->
      <div
        v-else
        class="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[12px] font-medium text-red-600 cursor-pointer animate-pulse"
        title="Необходимо выбрать раздел"
      >
        <UIcon name="i-lucide-alert-circle" class="size-3.5" />
        <span>Выберите раздел</span>
      </div>
    </template>

    <!-- Выпадающий список -->
    <template #content>
      <div class="flex max-h-[320px] w-[320px] flex-col">
        <!-- Поиск -->
        <div class="shrink-0 border-b border-default p-2">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            size="xs"
            placeholder="Поиск раздела..."
            autofocus
          />
        </div>

        <!-- Список -->
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
              class="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-elevated"
              :class="{ 'bg-primary/5': selectedIds.includes(node.id) }"
              @click="select(node.id)"
            >
              <UIcon
                :name="selectedIds.includes(node.id) ? 'i-lucide-check-square' : 'i-lucide-square'"
                class="mt-0.5 size-3.5 shrink-0"
                :class="selectedIds.includes(node.id) ? 'text-primary' : 'text-muted'"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-[12px] font-medium text-highlighted">
                  {{ node.title || '—' }}
                </div>
                <div class="truncate font-mono text-[10px] text-muted/70">
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
