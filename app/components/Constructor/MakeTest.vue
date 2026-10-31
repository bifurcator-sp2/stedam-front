<!-- app/components/Constructor/MakeTest.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toRaw } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import TestTemplatesList from '~/components/Constructor/TestTemplatesList.vue'
import BlockRenderer from '~/components/Constructor/BlockRenderer.vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import TaxonomySelector from '~/components/Constructor/TaxonomySelector.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import type { SettingNode } from '~/utils/constructors'

const route = useRoute()
const router = useRouter()
const api = useApi()
const toast = useToast()

// Берем данные пользователя из профиля
const { userData } = useProfile() // <--- ДОБАВЛЕНО

// ==================== Заголовок ====================
const isEditMode = computed(() => !!route.query.id)
const pageTitle = computed(() => isEditMode.value ? 'Редактирование задания' : 'Создание задания')

// ==================== Состояние ====================
const editingBlock = ref<any | null>(null)
const initialSnapshot = ref<string>('')
const saving = ref(false)
const loading = ref(false)

// Проверка на наличие изменений
const isDirty = computed(() => {
  if (!editingBlock.value || !initialSnapshot.value) return false
  return JSON.stringify(editingBlock.value) !== initialSnapshot.value
})

// Проверка на возможность сохранения (есть изменения и выбран раздел)
const canSave = computed(() => {
  return isDirty.value && editingBlock.value?.taxonomy_ids?.length > 0
})

// ==================== Загрузка при наличии ?id ====================
async function loadTest(id: number) {
  loading.value = true
  try {
    const res = await api.get<any>(`/teacher-test/${id}`)
    const data = res.data ?? res

    // ЗАЩИТА: проверяем, принадлежит ли задание текущему пользователю
    const currentUserId = userData.value?.user_id
    if (data.user_id !== currentUserId) {
      toast.add({
        title: 'Доступ запрещен',
        description: 'Вы можете редактировать только свои задания.',
        color: 'error',
        icon: 'i-lucide-shield-alert',
      })

      // Перенаправляем обратно в список заданий
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
      taxonomy_ids: data.taxonomy_ids ?? [],
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

// Следим за ?id в URL
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
  // Очищаем URL от ?id, так как мы создаем новое задание
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
    taxonomy_ids: (taxFromQuery && Number.isFinite(taxFromQuery) && taxFromQuery > 0)
      ? [taxFromQuery]
      : [],
  }

  initialSnapshot.value = JSON.stringify(editingBlock.value)
}

// ==================== Сохранение ====================
async function save() {
  if (!editingBlock.value || !canSave.value || saving.value) return

  saving.value = true

  try {
    const payload = {
      block_id: editingBlock.value.blockId,
      settings: editingBlock.value.settings,
      taxonomy_ids: editingBlock.value.taxonomy_ids
    }

    let res
    if (isEditMode.value) {
      res = await api.patch<any>(`/teacher-test/${route.query.id}`, payload)
    } else {
      res = await api.post<any>('/teacher-test', payload)
    }

    const data = res.data ?? res

    // Обновляем состояние данными от сервера
    editingBlock.value.id = data.id
    if (data.settings) {
      editingBlock.value.settings = data.settings
    }
    if (data.taxonomy_ids) {
      editingBlock.value.taxonomy_ids = data.taxonomy_ids
    }

    // Если это было создание, обновляем URL
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
      <div class="w-full max-w-5xl mx-auto p-6 h-full flex flex-col">

        <LoadingOverlay :loading="loading" class="h-full flex-1 min-h-[500px] w-full">

          <div v-if="!editingBlock" class="flex flex-col items-center justify-center text-center pt-20">
            <div class="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-layout-template" class="size-7 text-primary" />
            </div>
            <h2 class="text-xl font-bold text-highlighted">Слева выберите шаблон для создания задания</h2>
            <p class="text-sm text-muted mt-2 max-w-md leading-relaxed">
              На основе выбранного шаблона будет создано новое уникальное задание, которое вы сможете настроить под свои цели.
            </p>
          </div>

          <div v-else class="flex flex-col gap-4">
            <div class="flex items-start gap-3 bg-default rounded-xl border border-default px-4 py-3 shadow-sm w-full">
              <span class="text-sm font-semibold text-muted shrink-0 mt-[5px]">Раздел:</span>
              <div class="flex-1 min-w-0">
                <TaxonomySelector v-model="editingBlock.taxonomy_ids" />
              </div>
            </div>

            <div class="bg-default rounded-xl border border-default p-4">
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
      <div class="flex w-full items-center justify-between gap-2">
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
      <div v-if="loading" class="p-4 text-sm text-muted text-center mt-10">
        Загрузка...
      </div>

      <div v-else-if="!editingBlock" class="p-4 text-sm text-muted text-center mt-10">
        Выберите шаблон задания
      </div>

      <BlocksSettingsPanel
        v-else
        model-name="lesson_blocks"
        mode="public"
        v-model:id="editingBlock.id"
        v-model:is-test="editingBlock.isTest"
        v-model:settings="editingBlock.settings"
        v-model:published="editingBlock.published"
      />
    </template>
  </ConstructPanels>

  <!-- Модалка подтверждения сброса изменений -->
  <UModal
    v-model:open="isDiscardModalOpen"
    title="Несохраненные изменения"
    :ui="{ body: 'p-6', content: 'sm:max-w-md' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3 mb-2">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/10">
            <UIcon name="i-lucide-triangle-alert" class="size-5 text-warning" />
          </div>
          <h3 class="text-lg font-semibold text-highlighted">Внимание</h3>
        </div>

        <p class="text-sm text-muted">
          Текущее задание содержит несохраненные изменения. Вы уверены, что хотите переключиться на другой шаблон? Все введенные данные будут потеряны.
        </p>

        <div class="flex justify-end gap-2 mt-4">
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
