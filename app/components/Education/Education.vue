<!-- app/components/Constructor/Education.vue -->
<script setup lang="ts">
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'

// Заголовки панелей (можно менять динамически)
const leftTitle = 'Разделы обучения'
const centerTitle = 'Обучение'
const rightTitle = 'Информация'
</script>

<template>
  <ConstructPanels
    left-title="Программы обучения"
    main-title=""
    right-title="Свойства"
    defaultLeftWidth="500"
    maxLeftWidth="800"
    minLeftWidth="300"
    :displayRight="false"
    :displayViewportSelector="false"
  >
    <template #left>
        <EducationTaxonomy />
    </template>
    <template #main-header></template>
    <template #main>

    </template>
    <template #right-header></template>
    <template #right></template>

  </ConstructPanels>

</template>
