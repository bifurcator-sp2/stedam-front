<!-- app/components/Constructor/TeacherLessons.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'

const api = useApi()
const route = useRoute()
const router = useRouter()

// ==================== Загрузка дерева (Один раз) ====================
const taxonomyData = ref<any[] | null>(null)
const taxonomyPending = ref(true)
const taxonomyError = ref<unknown>(null)

async function loadTaxonomy() {
  taxonomyPending.value = true
  taxonomyError.value = null

  try {
    const res = await api.get<{ data: any[] }>('/taxonomies/tree', { silent: true })
    taxonomyData.value = res.data
  } catch (e) {
    taxonomyError.value = e
  } finally {
    taxonomyPending.value = false
  }
}

const taxonomyRefresh = () => loadTaxonomy()

onMounted(() => {
  loadTaxonomy()
})

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

function createCourse() {
  const query: Record<string, string> = {}
  const tax = selectedTaxonomyId.value
  // Если выбран валидный tax, прокидываем его в форму создания курса
  if (tax !== null && Number.isFinite(tax) && tax > 0) {
    query.tax = String(tax)
  }
  router.push({ path: '/make-course', query })
}

// ==================== Выбранный курс ====================
const selectedCourseId = ref<number | null>(null)

function onSelectCourse(id: number) {
  if (selectedCourseId.value === id) {
    selectedCourseId.value = null
  } else {
    selectedCourseId.value = id
  }
}

// ==================== Клик вне правой панели ====================
function handleGlobalClick(event: MouseEvent) {
  if (selectedCourseId.value === null) return

  const target = event.target as HTMLElement
  if (!target || !target.closest) return

  if (target.closest('.cursor-col-resize')) return
  if (target.closest('.right-panel-content')) return
  if (target.closest('.course-card')) return

  selectedCourseId.value = null
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
    main-title="Ваши курсы"
    right-title="Просмотр курса"
    :defaultLeftWidth="450"
    :maxLeftWidth="800"
    :minLeftWidth="350"

    :defaultRightWidth="400"
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
      <!-- Убрали disabled и title, кнопка всегда активна -->
      <UButton
        icon="i-lucide-plus"
        size="sm"
        color="primary"
        variant="solid"
        class="normal-case tracking-normal font-semibold shadow-sm hover:shadow-md transition-all duration-200"
        @click="createCourse"
      >
        Создать курс
      </UButton>
    </template>

    <template #main>
      <EducationCoursesSearch
        :selected-taxonomy-id="selectedTaxonomyId"
        :taxonomy-data="taxonomyData"
        :autoRefresh = "true"
        @open-taxonomy="onBreadcrumbOpen"
        @select-course="onSelectCourse"
      />
    </template>

    <template #right>
      <div v-if="!selectedCourseId" class="flex flex-col items-center justify-center h-full p-6 text-center text-slate-400">
        <UIcon name="i-lucide-book-open" class="w-10 h-10 mb-3 opacity-20" />
        <p class="text-sm">Выберите курс для просмотра</p>
      </div>


    </template>
  </ConstructPanels>
</template>
