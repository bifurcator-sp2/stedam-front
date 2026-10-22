<!-- app/components/Constructor/Education.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'

const api = useApi()
const route = useRoute()
const router = useRouter()

// ==================== Загрузка дерева (Один раз) ====================
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
    query: newTax ? { tax: newTax } : {}
  })
}

function onBreadcrumbOpen(id: number) {
  router.push({ query: { tax: id } })
}

// ==================== Выбранный урок ====================
const selectedLessonId = ref<number | null>(null)

function onSelectLesson(id: number) {
  if (selectedLessonId.value === id) {
    selectedLessonId.value = null
  } else {
    selectedLessonId.value = id
  }
}

// ==================== Клик вне правой панели ====================
function handleGlobalClick(event: MouseEvent) {
  if (selectedLessonId.value === null) return

  const target = event.target as HTMLElement
  if (!target || !target.closest) return

  if (target.closest('.right-panel-content')) return
  if (target.closest('.lesson-card')) return

  selectedLessonId.value = null
}

onMounted(() => {
  document.addEventListener('pointerdown', handleGlobalClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleGlobalClick)
})
</script>

<template>
  <ConstructPanels
    left-title="Программы обучения"
    main-title="Ваши уроки"
    right-title="Просмотр урока"
    defaultLeftWidth="400"
    maxLeftWidth="800"
    minLeftWidth="300"

    defaultRightWidth="400"
    maxRightWidth="600"
    minRightWidth="300"

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

    <template #main>
      <!-- Передаем только существующие переменные -->
      <EducationLessonsSearch
        :selected-taxonomy-id="selectedTaxonomyId"
        :taxonomy-data="taxonomyData"
        @open-taxonomy="onBreadcrumbOpen"
        @select-lesson="onSelectLesson"
      />
    </template>

    <template #right>
      <div v-if="!selectedLessonId" class="flex flex-col items-center justify-center h-full p-6 text-center text-slate-400">
        <UIcon name="i-lucide-book-open" class="w-10 h-10 mb-3 opacity-20" />
        <p class="text-sm">Выберите урок для просмотра</p>
      </div>

      <EducationLessonDetailPanel
        v-else
        :lesson-id="selectedLessonId"
      />
    </template>
  </ConstructPanels>
</template>
