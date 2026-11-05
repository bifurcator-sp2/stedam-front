<!-- app/components/Constructor/MakeTest.vue -->
<script setup lang="ts">
import { ref, computed, watch, provide } from 'vue'
import { toRaw } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import TestTemplatesList from '~/components/Constructor/TestTemplatesList.vue'
import BlockRenderer from '~/components/Constructor/BlockRenderer.vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import TaxonomySelector from '~/components/Constructor/TaxonomySelector.vue'
import ComplexitySelector from '~/components/Constructor/ComplexitySelector.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import type { SettingNode } from '~/utils/constructors'

const route = useRoute()
const router = useRouter()
const api = useApi()
const toast = useToast()

const { userData } = useProfile()

// ==================== Заголовок ====================
const isEditMode = computed(() => !!route.query.id)
const pageTitle = computed(() => isEditMode.value ? 'Редактирование задания' : 'Создание задания')

// ==================== Состояние ====================
const editingBlock = ref<any | null>(null)
const initialSnapshot = ref<string>('')
const saving = ref(false)
const loading = ref(false)

const isDirty = computed(() => {
  if (!editingBlock.value || !initialSnapshot.value) return false
  return JSON.stringify(editingBlock.value) !== initialSnapshot.value
})

const canSave = computed(() => {
  if (!isDirty.value) return false
  if (editingBlock.value?.isProc) return true
  return editingBlock.value?.taxonomy_ids?.length > 0
})

// ==================== ПРОБРОС ТАКСОНОМИИ В БЛОКИ ====================
const contextTaxonomyIds = ref<number[]>([])

watch(
  () => editingBlock.value?.taxonomy_ids,
  (newVal) => {
    contextTaxonomyIds.value = newVal || []
  },
  { immediate: true, deep: true }
)

provide('lesson-taxonomy-ids', contextTaxonomyIds)

const contextComplexity = computed(() => editingBlock.value?.complexity ?? null)
provide('task-complexity', contextComplexity)

// ==================== Загрузка при наличии ?id ====================
async function loadTest(id: number) {
  loading.value = true
  try {
    const res = await api.get<any>(`/teacher-test/${id}`)
    const data = res.data ?? res

    const currentUserId = userData.value?.user_id
    if (data.user_id !== currentUserId) {
      toast.add({
        title: 'Доступ запрещен',
        description: 'Вы можете редактировать только свои задания.',
        color: 'error',
        icon: 'i-lucide-shield-alert',
      })
      router.replace('/teacher-tests')
      return
    }

    editingBlock.value = {
      id: data.id,
      blockId: data.block_id,
      blockTypeCode: data.block_type_code,
      settings: deepClone(data.settings) as SettingNode,
      published: data.published ?? false,
      isTest: true,
      isProc: Boolean(data.is_proc),
      taxonomy_ids: data.taxonomy_ids ?? [],
      complexity: data.complexity ?? null,
    }

    initialSnapshot.value = JSON.stringify(editingBlock.value)
  } catch (e: any) {
    console.error('[loadTest] failed', e)
    toast.add({
      title: 'Ошибка',
      description: e?.data?.message || 'Не удалось загрузить задание',
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  } finally {
    loading.value = false
  }
}

watch(
  () => route.query.id,
  (newId) => {
    if (newId) {
      loadTest(Number(newId))
    }
  },
  { immediate: true }
)

// ==================== Модалка несохраненных изменений ====================
const isDiscardModalOpen = ref(false)
const pendingTemplate = ref<any | null>(null)

function handleSelectTemplate(template: any) {
  if (isDirty.value) {
    pendingTemplate.value = template
    isDiscardModalOpen.value = true
  } else {
    applyTemplate(template)
  }
}

function confirmDiscard() {
  if (pendingTemplate.value) {
    applyTemplate(pendingTemplate.value)
  }
  isDiscardModalOpen.value = false
  pendingTemplate.value = null
}

function cancelDiscard() {
  isDiscardModalOpen.value = false
  pendingTemplate.value = null
}

// ==================== Применение шаблона ====================

function deepClone<T>(v: T): T {
  if (v === null || v === undefined) return v
  return JSON.parse(JSON.stringify(toRaw(v))) as T
}

function applyTemplate(template: any) {
  if (route.query.id) {
    router.replace({ query: { ...route.query, id: undefined } })
  }

  const taxFromQuery = route.query.tax ? Number(route.query.tax) : null

  editingBlock.value = {
    id: 0,
    blockId: template.id,
    blockTypeCode: template.block_type_code,
    settings: deepClone(template.settings) as SettingNode,
    published: false,
    isTest: true,
    isProc: Boolean(template.is_proc),
    taxonomy_ids: (taxFromQuery && Number.isFinite(taxFromQuery) && taxFromQuery > 0)
      ? [taxFromQuery]
      : [],
    complexity: null,
  }

  initialSnapshot.value = JSON.stringify(editingBlock.value)
}

// ==================== Сохранение ====================
async function save() {
  if (!editingBlock.value || !canSave.value || saving.value) return

  saving.value = true

  try {
    const payload: any = {
      block_id: editingBlock.value.blockId,
      settings: editingBlock.value.settings,
      complexity: editingBlock.value.complexity,
      is_proc: editingBlock.value.isProc,
    }

    if (!editingBlock.value.isProc) {
      payload.taxonomy_ids = editingBlock.value.taxonomy_ids
    }

    let res
    if (isEditMode.value) {
      // Добавляем { silent: true }, чтобы useApi не дублировал тост
      res = await api.patch<any>(`/teacher-test/${route.query.id}`, payload, { silent: true })
    } else {
      res = await api.post<any>('/teacher-test', payload, { silent: true })
    }

    const data = res.data ?? res

    // Обновляем состояние данными от сервера
    editingBlock.value.id = data.id
    if (data.settings) {
      editingBlock.value.settings = data.settings
    }
    if (data.taxonomy_ids !== undefined && data.taxonomy_ids !== null) {
      editingBlock.value.taxonomy_ids = data.taxonomy_ids
    }
    if (data.complexity !== undefined) {
      editingBlock.value.complexity = data.complexity
    }
    if (data.is_proc !== undefined && data.is_proc !== null) {
      editingBlock.value.isProc = Boolean(data.is_proc)
    }

    if (!isEditMode.value && data.id) {
      await router.replace({ query: { ...route.query, id: String(data.id) } })
    }

    initialSnapshot.value = JSON.stringify(editingBlock.value)

    toast.add({
      title: 'Успешно',
      description: 'Задание сохранено',
      color: 'success',
      icon: 'i-lucide-check-circle',
    })
  } catch (e: any) {
    console.error('[save] failed', e)
    toast.add({
      title: 'Ошибка',
      description: e?.data?.message || 'Не удалось сохранить задание',
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ConstructPanels
    left-title="Шаблоны заданий"
    :main-title="pageTitle"
    right-title="Свойства"
    :defaultLeftWidth="450"
    :maxLeftWidth="800"
    :minLeftWidth="350"
    :defaultRightWidth="400"
    :maxRightWidth="600"
    :minRightWidth="300"
    :displayLeft="true"
    :displayRight="true"
    :displayViewportSelector="true"
  >
    <!-- ЛЕВАЯ ПАНЕЛЬ -->
    <template #left>
      <TestTemplatesList @select-template="handleSelectTemplate" />
    </template>

    <!-- ЦЕНТР -->
    <template #main>
      <div class="w-full max-w-5xl h-full flex flex-col">

        <LoadingOverlay :loading="loading" class="h-full flex-1 min-h-[500px] w-full">

          <div v-if="!editingBlock" class="flex flex-col items-center justify-center text-center">
            <div class="size-14 bg-primary/10 flex items-center justify-center">
              <UIcon name="i-lucide-layout-template" class="size-7 text-primary" />
            </div>
            <h2 class="text-xl font-bold text-highlighted">Слева выберите шаблон для создания задания</h2>
            <p class="text-sm text-muted max-w-md leading-relaxed">
              На основе выбранного шаблона будет создано новое уникальное задание, которое вы сможете настроить под свои цели.
            </p>
          </div>

          <div v-else class="flex flex-col gap-4">

            <!-- Убраны серые рамки, фон сделан дефолтным -->
            <div
              v-if="!editingBlock.isProc"
              class="flex items-start w-full px-2"
            >
              <span class="text-sm font-semibold text-muted shrink-0">Раздел:</span>
              <div class="flex-1 min-w-0">
                <TaxonomySelector v-model="editingBlock.taxonomy_ids" />
              </div>
            </div>

            <!-- Убраны серые рамки -->
            <div class="w-full px-2">
              <ComplexitySelector v-model="editingBlock.complexity" />
            </div>

            <!-- Убрана серая рамка -->
            <div class="w-full">
              <BlockRenderer
                :code="editingBlock.blockTypeCode"
                :id="editingBlock.id"
                :is-test="editingBlock.isTest"
                mode="body"
                v-model:settings="editingBlock.settings"
              />
            </div>
          </div>

        </LoadingOverlay>

      </div>
    </template>

    <!-- ПРАВАЯ ПАНЕЛЬ (ШАПКА) -->
    <template #right-header>
      <div class="flex w-full items-center justify-between">
        <span>Свойства</span>
        <UButton
          icon="i-lucide-save"
          size="xs"
          color="primary"
          variant="soft"
          :loading="saving"
          :disabled="!canSave || saving || loading"
          @click="save"
        >
          Сохранить
        </UButton>
      </div>
    </template>

    <!-- ПРАВАЯ ПАНЕЛЬ (КОНТЕНТ) -->
    <template #right>
      <div v-if="loading" class="text-sm text-muted text-center">
        Загрузка...
      </div>

      <div v-else-if="!editingBlock" class="text-sm text-muted text-center">
        Выберите шаблон задания
      </div>

      <BlocksSettingsPanel
        v-else
        model-name="lesson_blocks"
        mode="public"
        v-model:id="editingBlock.id"
        v-model:is-test="editingBlock.isTest"
        v-model:is-proc="editingBlock.isProc"
        v-model:settings="editingBlock.settings"
        v-model:published="editingBlock.published"
      />
    </template>
  </ConstructPanels>

  <!-- Модалка подтверждения сброса изменений -->
  <UModal
    v-model:open="isDiscardModalOpen"
    title="Несохраненные изменения"
    :ui="{ body: '', content: 'sm:max-w-md' }"
  >
    <template #body>
      <div class="flex flex-col">
        <div class="flex items-center">
          <div class="flex size-10 shrink-0 items-center justify-center bg-warning/10">
            <UIcon name="i-lucide-triangle-alert" class="size-5 text-warning" />
          </div>
          <h3 class="text-lg font-semibold text-highlighted">Внимание</h3>
        </div>

        <p class="text-sm text-muted">
          Текущее задание содержит несохраненные изменения. Вы уверены, что хотите переключиться на другой шаблон? Все введенные данные будут потеряны.
        </p>

        <div class="flex justify-end">
          <UButton color="neutral" variant="ghost" @click="cancelDiscard">
            Отмена
          </UButton>
          <UButton color="error" @click="confirmDiscard">
            Забыть изменения
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
