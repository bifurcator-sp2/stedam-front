<script setup lang="ts">
const props = defineProps<{
  mode?: 'form' | 'body'
}>()
</script>

<template>
  <ConstructorBlockLayout :mode="props.mode ?? 'body'">
    <template #form>
      <div class="py-2">
        <USeparator color="primary" type="solid" />
      </div>
    </template>

    <template #body>
      <div class="py-2">
        <USeparator color="primary" type="solid" />
      </div>
    </template>

  </ConstructorBlockLayout>
</template>

