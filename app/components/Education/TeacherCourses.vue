<!-- app/components/Constructor/TeacherLessons.vue -->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import type { CourseListItem } from '~/types/course'

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
const selectedCourse = ref<CourseListItem | null>(null)

function onCourseSelected(course: CourseListItem) {
  selectedCourse.value = course
}

function onCourseUnselected() {
  selectedCourse.value = null
}

// Двойной клик — явное открытие конструктора курса
function onOpenCourse(course: CourseListItem) {
  router.push({ path: '/construct-course', query: { id: String(course.id) } })
}
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
        :data="taxonomyData ?? undefined"
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
      <div class="left-panel-content" @click.self="onCourseUnselected">
        <EducationCoursesSearch
          :selected-taxonomy-id="selectedTaxonomyId"
          :taxonomy-data="taxonomyData ?? undefined"
          :autoRefresh = "true"
          @open-taxonomy="onBreadcrumbOpen"
          @course-selected="onCourseSelected"
          @course-unselected="onCourseUnselected"
          @open-course="onOpenCourse"
        />
      </div>
    </template>

    <template #right>
      <div v-if="!selectedCourse" class="right-panel-content flex flex-col items-center justify-center h-full p-6 text-center text-slate-400">
        <UIcon name="i-lucide-book-open" class="w-10 h-10 mb-3 opacity-20" />
        <p class="text-sm">Выберите курс для просмотра</p>
      </div>

      <EducationCoursePropsPanel
        v-else
        :key="selectedCourse.id"
        :course="selectedCourse"
        :taxonomy-tree="taxonomyData ?? []"
      />
    </template>
  </ConstructPanels>
</template>
