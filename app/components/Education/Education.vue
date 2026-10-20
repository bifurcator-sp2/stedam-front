<!-- app/components/Constructor/Education.vue -->
<script setup lang="ts">
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'

// Заголовки панелей (можно менять динамически)
const leftTitle = 'Разделы обучения'
const centerTitle = 'Обучение'
const rightTitle = 'Информация'
</script>

<template>

      <div class="flex flex-col items-center justify-center min-h-[500px] p-8 text-center text-gray-500">
        <div class="flex items-center justify-center w-20 h-20 mb-6 rounded-full bg-primary/10">
          <UIcon name="i-lucide-graduation-cap" class="w-10 h-10 text-primary" />
        </div>
        <h2 class="text-xl font-semibold text-gray-800">Добро пожаловать в раздел обучения!</h2>
        <p class="mt-3 text-sm max-w-md text-gray-500">
          Выберите урок в левой панели, чтобы начать просмотр. Здесь будет отображаться контент урока, видео или интерактивные задания.
        </p>
      </div>

</template>
