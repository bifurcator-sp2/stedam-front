<!-- app/components/Constructor/TeacherTests.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import TestsSearch from '~/components/Education/TestsSearch.vue'
import TestListElement from '~/components/Education/TestListElement.vue'

const api = useApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()

// Берем данные пользователя из профиля
const { userData } = useProfile()

// ==================== Загрузка дерева ====================
const { data: taxonomyData, pending: taxonomyPending, error: taxonomyError, refresh: taxonomyRefresh } = await useAsyncData<any[]>(
  'taxonomy-tree',
  async () => {
    const res = await api.get<{ data: any[] }>('/taxonomies/tree', { silent: true })
    return res.data
  }
)

// ==================== Таксономия ====================
const selectedTaxonomyId = computed<number | null>(() => {
  const tax = route.query.tax
  return tax ? Number(tax) : null
})

function onTaxonomySelect(id: number) {
  const newTax = selectedTaxonomyId.value === id ? undefined : id
  router.push({
    query: {
      ...route.query,
      tax: newTax,
      page: undefined
    }
  })
}

function onBreadcrumbOpen(id: number) {
  router.push({
    query: {
      ...route.query,
      tax: id,
      page: undefined
    }
  })
}

// ==================== Проверка на "лист" ====================
function findNodeById(nodes: any[], id: number): any | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children?.length) {
      const found = findNodeById(n.children, id)
      if (found) return found
    }
  }
  return null
}

const isSelectedTaxLeaf = computed<boolean>(() => {
  const id = selectedTaxonomyId.value
  if (id === null || !Number.isFinite(id) || id <= 0) return false
  if (!taxonomyData.value?.length) return false
  const node = findNodeById(taxonomyData.value, id)
  if (!node) return false
  return !node.children || node.children.length === 0
})

// ==================== Выбранное задание ====================
const selectedTest = ref<any | null>(null)

function onSelectTest(test: any) {
  if (selectedTest.value?.id === test.id) {
    selectedTest.value = null
  } else {
    selectedTest.value = test
  }
}

// Обработка двойного клика (переход на редактирование)
function onEditTest(test: any) {
  const currentUserId = userData.value?.user_id

  // Если задание не принадлежит текущему пользователю - блокируем
  if (test.user_id !== currentUserId) {
    toast.add({
      title: 'Доступ запрещен',
      description: 'Вы можете редактировать только свои задания.',
      color: 'error',
      icon: 'i-lucide-shield-alert',
    })
    return
  }

  router.push({ path: '/make-test', query: { id: String(test.id) } })
}

// ==================== Клик вне правой панели ====================
function handleGlobalClick(event: MouseEvent) {
  if (selectedTest.value === null) return

  const target = event.target as HTMLElement
  if (!target || !target.closest) return

  // ИГНОРИРУЕМ КЛИКИ ПО РЕСАЙЗЕРУ (разделителю панелей)
  if (target.closest('.cursor-col-resize')) return

  if (target.closest('.right-panel-content')) return
  if (target.closest('.test-card')) return

  selectedTest.value = null
}

onMounted(() => {
  document.addEventListener('pointerdown', handleGlobalClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleGlobalClick)
})

// ==================== Создание задания ====================
function createTest() {
  const query: Record<string, string> = {}

  if (isSelectedTaxLeaf.value && selectedTaxonomyId.value !== null) {
    query.tax = String(selectedTaxonomyId.value)
  }

  router.push({ path: '/make-test', query })
}
</script>

<template>
  <ConstructPanels
    left-title="Программы обучения"
    main-title="Мои задания"
    right-title="Просмотр задания"
    :defaultLeftWidth="450"
    :maxLeftWidth="800"
    :minLeftWidth="350"
    :defaultRightWidth="500"
    :maxRightWidth="800"
    :minRightWidth="300"
    :displayRight="true"
    :displayViewportSelector="false"
  >
    <template #left>
      <EducationTaxonomy
        :data="taxonomyData"
        :pending="taxonomyPending"
        :error="taxonomyError"
        :refresh="taxonomyRefresh"
        @select="onTaxonomySelect"
      />
    </template>

    <template #main-header-right>
      <UButton
        icon="i-lucide-plus"
        size="sm"
        color="primary"
        variant="solid"
        class="normal-case tracking-normal font-semibold shadow-sm hover:shadow-md transition-all duration-200"
        @click="createTest"
      >
        Добавить задание
      </UButton>
    </template>

    <template #main>
      <div class="flex flex-col h-full bg-default">
        <div class="flex-1 overflow-y-auto">
          <TestsSearch
            :selected-taxonomy-id="selectedTaxonomyId"
            :taxonomy-data="taxonomyData"
            @open-taxonomy="onBreadcrumbOpen"
            @select-test="onSelectTest"
            @open-test="onEditTest"
          />
        </div>
      </div>
    </template>

    <template #right>
      <div v-if="!selectedTest" class="flex flex-col items-center justify-center h-full p-6 text-center text-slate-400">
        <UIcon name="i-lucide-book-open" class="w-10 h-10 mb-3 opacity-20" />
        <p class="text-sm">Выберите задание для просмотра</p>
      </div>

      <div v-else class="right-panel-content flex flex-col h-full bg-default overflow-y-auto">
        <!-- Обновленная шапка правой панели -->
        <div class="p-4 border-b border-default bg-elevated/30 flex items-center gap-3 shrink-0">

          <!-- Иконка задания (слева) -->
          <div class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-clipboard-check" class="size-5" />
          </div>

          <div class="min-w-0 flex-1">
            <h3 class="text-base font-bold text-highlighted truncate">Задание #{{ selectedTest.id }}</h3>
            <p class="text-xs text-muted flex items-center gap-1.5 mt-0.5">
              <UIcon name="i-lucide-activity" class="size-3" />
              Использований: {{ selectedTest.usages ?? 0 }}
            </p>
          </div>

          <!-- Иконка владельца задания (справа) — теперь ТОЧНО такого же размера и формы -->
          <div
            v-if="selectedTest.user_id && selectedTest.user_id === userData?.user_id"
            class="shrink-0 flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary"
            title="Мое задание"
          >
            <UIcon name="i-lucide-user" class="size-5" />
          </div>
        </div>

        <div class="p-4 w-full">
          <TestListElement :test="selectedTest" :key="selectedTest.id" />
        </div>
      </div>
    </template>
  </ConstructPanels>
</template>
