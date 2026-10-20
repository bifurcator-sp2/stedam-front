<!-- app/components/Constructor/BlockIndexSelector.vue -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

// ============================================================
// Типы (локальные — без внешних импортов)
// ============================================================

interface BlockNode {
  id: number
  parent_id: number | null
  order: number
  title: string | null
  description: string | null
  blocks_count?: number
  blocks_count_total?: number
  children: BlockNode[]
}

interface FlatNode extends BlockNode {
  path: string
  depth: number
}

// ============================================================
// Props / Model
// ============================================================

const props = withDefaults(
  defineProps<{
    label?: string
    /** Максимум выбираемых узлов. null — без ограничения. */
    max?: number | null
  }>(),
  {
    label: 'Позиции в дереве',
    max: null,
  },
)

/** null = не привязан; массив id = выбранные узлы. */
const model = defineModel<number[] | null>({ default: null })

// ============================================================
// Состояние
// ============================================================

const api = useApi()

const loading = ref(false)
const error = ref<string | null>(null)
const tree = ref<BlockNode[]>([])
const loaded = ref(false)

const isOpen = ref(false)
const search = ref('')

// ============================================================
// Загрузка дерева
// ============================================================

async function load() {
  if (loading.value || loaded.value) return

  loading.value = true
  error.value = null

  try {
    const res = await api.get<{ data: BlockNode[] }>('/blocks-index', { silent: true })
    tree.value = res.data ?? []
    loaded.value = true
  } catch (e: any) {
    error.value =
      e?.data?.message ?? e?.message ?? 'Не удалось загрузить дерево'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(isOpen, (v) => { if (v) load() })

// ============================================================
// Плоский список + пути
// ============================================================

const flatNodes = computed<FlatNode[]>(() => {
  const result: FlatNode[] = []
  const walk = (nodes: BlockNode[], path: string[], depth: number) => {
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
const selectedSet = computed(() => new Set(selectedIds.value))
const selectedNodes = computed(
  () =>
    selectedIds.value
      .map((id) => byId.value.get(id))
      .filter((n): n is FlatNode => Boolean(n)),
)

const filteredNodes = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return flatNodes.value
  return flatNodes.value.filter(
    (n) =>
      (n.title ?? '').toLowerCase().includes(q) ||
      (n.description ?? '').toLowerCase().includes(q) ||
      n.path.toLowerCase().includes(q),
  )
})

// ============================================================
// Действия
// ============================================================

function isAtMax(): boolean {
  return props.max !== null && selectedIds.value.length >= props.max
}

function toggle(id: number) {
  const current = new Set(selectedIds.value)

  if (current.has(id)) {
    current.delete(id)
  } else {
    if (isAtMax()) return
    current.add(id)
  }

  model.value = current.size ? Array.from(current) : null
}

function remove(id: number) {
  const current = new Set(selectedIds.value)
  current.delete(id)
  model.value = current.size ? Array.from(current) : null
}

function clearAll() {
  model.value = null
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- ==================== Header ==================== -->
    <div class="flex items-center justify-between gap-2">
      <span
        class="inline-flex h-[16px] min-w-[20px] items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-1.5 text-[10px] font-bold leading-none text-primary"
        :class="{ 'opacity-40': !selectedIds.length }"
      >
        {{ selectedIds.length }}<template v-if="max !== null">/{{ max }}</template>
      </span>
    </div>

    <!-- ==================== Выбранные чипы ==================== -->
    <div v-if="selectedNodes.length" class="flex flex-wrap gap-1">
      <div
        v-for="node in selectedNodes"
        :key="node.id"
        class="inline-flex max-w-full items-center gap-1 rounded-md border border-default bg-elevated px-1.5 py-0.5 text-[11px] text-highlighted"
        :title="node.path"
      >
        <UIcon name="i-lucide-folder-tree" class="size-3 shrink-0 text-primary/70" />
        <span class="max-w-[140px] truncate">{{ node.title || '—' }}</span>
        <button
          type="button"
          class="shrink-0 text-muted transition-colors hover:text-error"
          title="Убрать"
          @click="remove(node.id)"
        >
          <UIcon name="i-lucide-x" class="size-3" />
        </button>
      </div>
    </div>

    <!-- ==================== Empty hint ==================== -->
    <div
      v-else-if="loaded && !error"
      class="flex items-center gap-1.5 rounded-md border border-dashed border-default bg-elevated/50 px-2 py-1.5 text-[11px] text-muted"
    >
      <UIcon name="i-lucide-unlink" class="size-3 shrink-0" />
      <span>Не привязан ни к одному узлу</span>
    </div>

    <!-- ==================== Picker ==================== -->
    <UPopover v-model:open="isOpen">
      <UButton
        icon="i-lucide-plus"
        size="xs"
        color="neutral"
        variant="soft"
        block
        :loading="loading"
      >
        {{ selectedIds.length ? 'Изменить выбор' : 'Выбрать узлы' }}
      </UButton>

      <template #content>
        <div class="flex max-h-[420px] w-[360px] max-w-[90vw] flex-col">
          <!-- Search -->
          <div class="shrink-0 border-b border-default p-2">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              size="xs"
              placeholder="Поиск узла..."
              autofocus
            />
          </div>

          <!-- List -->
          <div class="min-h-0 flex-1 overflow-y-auto p-1">
            <LoadingOverlay :loading="loading">
              <div
                v-if="error"
                class="flex flex-col items-center gap-1 px-3 py-6 text-center"
              >
                <UIcon name="i-lucide-triangle-alert" class="size-5 text-error" />
                <span class="text-[11px] text-muted">{{ error }}</span>
              </div>

              <div
                v-else-if="!filteredNodes.length"
                class="px-3 py-6 text-center text-[11px] text-muted"
              >
                {{ search ? 'Ничего не найдено' : 'Нет ни одного узла' }}
              </div>

              <button
                v-for="node in filteredNodes"
                :key="node.id"
                type="button"
                class="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-elevated"
                :class="{
                  'bg-primary/5': selectedSet.has(node.id),
                  'opacity-60': !selectedSet.has(node.id) && isAtMax(),
                }"
                :disabled="!selectedSet.has(node.id) && isAtMax()"
                @click="toggle(node.id)"
              >
                <UIcon
                  :name="selectedSet.has(node.id)
                    ? 'i-lucide-check-square'
                    : 'i-lucide-square'"
                  class="mt-0.5 size-3.5 shrink-0"
                  :class="selectedSet.has(node.id) ? 'text-primary' : 'text-muted'"
                />

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="truncate text-[12px] font-medium text-highlighted">
                      {{ node.title || '—' }}
                    </span>
                    <span
                      v-if="node.blocks_count"
                      class="shrink-0 rounded-full bg-elevated px-1.5 py-px text-[9.5px] font-medium text-muted"
                      :title="`Блоков в узле: ${node.blocks_count}`"
                    >
                      {{ node.blocks_count }}
                    </span>
                  </div>

                  <p
                    v-if="node.description"
                    class="truncate text-[10.5px] text-muted"
                  >
                    {{ node.description }}
                  </p>

                  <div class="truncate font-mono text-[10px] text-muted/70">
                    {{ node.path }}
                  </div>
                </div>
              </button>
            </LoadingOverlay>
          </div>

          <!-- Footer -->
          <div class="flex shrink-0 items-center justify-between gap-2 border-t border-default p-2">
            <span class="text-[11px] text-muted">
              Выбрано: <b class="text-highlighted">{{ selectedIds.length }}</b>
            </span>
            <div class="flex items-center gap-1">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :disabled="!selectedIds.length"
                @click="clearAll"
              >
                Очистить
              </UButton>
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                @click="isOpen = false"
              >
                Готово
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>
