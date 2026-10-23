<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { useFormula } from '~/composables/useFormula'
import { useVideoEmbed } from '~/composables/useVideoEmbed'

// Модель — строка
const value = defineModel<string>({ default: '' })

// mode приходит из Palette
const props = defineProps<{
  mode?: 'form' | 'body'
}>()

// ==================== Режим урока ====================

const lessonMode = inject<Ref<'edit' | 'learn'>>('lesson-mode', ref('edit'))

// Разрешаем редактирование только в режиме edit
const canEdit = computed(() => lessonMode.value === 'edit')

// ==================== Рендер для режима чтения ====================

const { renderFormulas } = useFormula()
const { renderVideos } = useVideoEmbed()

const renderedValue = computed(() => {
  const raw = value.value || ''
  return renderVideos(renderFormulas(raw))
})
</script>

<template>
  <!-- Режим формы (для палитры) -->
  <div v-if="props.mode === 'form'" class="relative w-full">
    <UInput v-model="value" class="w-full"/>
  </div>

  <!-- Режим просмотра (body) -->
  <template v-else>
    <!-- Если можно редактировать — используем директиву -->
    <h1
      v-if="canEdit"
      v-inline-edit="{
        get: () => value,
        set: (v: string) => (value = v),
      }"
      class="inline-edit text-3xl sm:text-4xl text-pretty font-bold text-highlighted"
    ></h1>

    <!-- Если режим learn — просто выводим отрендеренный HTML -->
    <h1
      v-else
      class="text-3xl sm:text-4xl text-pretty font-bold text-highlighted"
      v-html="renderedValue"
    ></h1>
  </template>
</template>
