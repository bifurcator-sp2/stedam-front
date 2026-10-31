<!-- app/components/Constructor/TestTemplatesList.vue -->
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import TestListElement from '~/components/Education/TestListElement.vue'

const api = useApi()

// Добавлен эмит
const emit = defineEmits<{
  (e: 'select-template', template: any): void
}>()

// ==================== Управление количеством колонок ====================
const columnsCount = 1

// ==================== Состояние ====================
const templates = ref<any[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const page = ref(1)
const hasMore = ref(false)
const perPage = 10

// ==================== Загрузка шаблонов ====================
async function fetchTemplates() {
  loading.value = true
  error.value = null

  try {
    const res = await api.get<any>('/teacher-tests/templates', {
      params: {
        page: page.value,
        per_page: perPage,
      },
    })

    templates.value = (res.data ?? []).map((item: any) => ({
      id: item.id,
      block_type_code: item.code,
      settings: item.settings,
      title: item.title,
      description: item.description,
      created_at: item.created_at,
      usages: item.usages ?? 0, // <--- ДОБАВЛЕНО
    }))

    hasMore.value = res.meta?.has_more_pages ?? false
  } catch (e: any) {
    console.error('[fetchTemplates] failed', e)
    error.value = e?.data?.message || 'Не удалось загрузить шаблоны'
  } finally {
    loading.value = false
  }
}

// ==================== Пагинация ====================
function goToPage(p: number) {
  if (p < 1) return
  page.value = p
}

watch(page, () => {
  fetchTemplates()
})

onMounted(() => {
  fetchTemplates()
})
</script>

<template>
  <div class="flex flex-col gap-5 w-full min-w-0 p-3">

    <!-- Заглушка / Ошибка / Загрузка -->
    <div v-if="loading && templates.length === 0" class="flex items-center justify-center h-40 text-muted text-sm gap-2">
      <UIcon name="i-lucide-loader-2" class="animate-spin size-5" />
      Загрузка шаблонов...
    </div>

    <div v-else-if="error" class="flex flex-col items-center justify-center h-40 text-error text-sm gap-2">
      <UIcon name="i-lucide-triangle-alert" class="size-6" />
      {{ error }}
      <UButton variant="soft" color="neutral" size="xs" @click="fetchTemplates">Повторить</UButton>
    </div>

    <div v-else-if="templates.length === 0" class="flex flex-col items-center justify-center h-40 text-muted text-sm gap-2">
      <UIcon name="i-lucide-package-open" class="size-6 opacity-50" />
      Шаблоны не найдены
    </div>

    <!-- Сетка -->
    <div
      v-else
      class="grid gap-4 items-start w-full min-w-0"
      :style="{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }"
    >
      <div
        v-for="test in templates"
        :key="test.id"
        class="w-full min-w-0 flex flex-col text-left rounded-xl border transition-all duration-200 overflow-hidden border-default bg-default cursor-pointer hover:border-primary/50 hover:shadow-md group"
        @click="emit('select-template', test)"
      >
        <!-- Шапка карточки -->
        <div class="p-3 border-b border-default/50 flex items-center justify-between gap-2 bg-elevated/30">
          <div class="flex items-center gap-2 min-w-0">
            <div class="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
              <UIcon name="i-lucide-clipboard-check" class="size-4" />
            </div>
            <div class="min-w-0 flex flex-col w-full">
              <span class="text-[13px] font-semibold text-highlighted block truncate">
                {{ test.title || `Шаблон #${test.id}` }}
              </span>
              <span v-if="test.description" class="text-[11px] text-muted block truncate max-w-full">
                {{ test.description }}
              </span>
              <span class="text-[10px] text-muted block mt-0.5">
                {{ new Date(test.created_at).toLocaleDateString('ru-RU') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Превью -->
        <div class="p-2 bg-muted/10 relative flex-1 w-full min-w-0 overflow-hidden">
          <TestListElement :test="test" :key="test.id" class="pointer-events-none" />
        </div>

        <!-- Футер карточки -->
        <div class="p-2.5 border-t border-default/50 bg-elevated/10 flex items-center justify-between shrink-0">
          <span class="text-[11px] font-medium text-muted flex items-center gap-1.5">
            <UIcon name="i-lucide-activity" class="size-3.5" />
            Использований: {{ test.usages }}
          </span>
        </div>
      </div>
    </div>

    <!-- Пагинация -->
    <div v-if="!loading && (page > 1 || hasMore)" class="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 w-full">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="outline"
        size="xs"
        :disabled="page <= 1"
        @click="goToPage(page - 1)"
      >
        Назад
      </UButton>

      <span class="text-[10px] font-medium text-slate-500 font-mono">
        Стр. {{ page }}
      </span>

      <UButton
        icon="i-lucide-chevron-right"
        trailing
        color="neutral"
        variant="outline"
        size="xs"
        :disabled="!hasMore"
        @click="goToPage(page + 1)"
      >
        Вперед
      </UButton>
    </div>

  </div>
</template>
