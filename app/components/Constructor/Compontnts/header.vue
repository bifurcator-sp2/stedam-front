<script setup lang="ts">
const { sanitizeHtml } = useSanitize()

// Модель — строка
const value = defineModel<string>({ default: '' })

// mode приходит из Palette
const props = defineProps<{
  mode?: 'form' | 'body'
}>()

// Реактивный объект-обёртка для директивы.
// НЕ computed — геттер читает актуальное value.value каждый раз.
const modelRef = {
  get value() {
    return value.value ?? ''
  },
  set value(v: string) {
    value.value = v
  },
}

</script>

<template>
  <ConstructorBlockLayout :mode="props.mode ?? 'body'">
    <template #form>
      <div class="relative w-full">
        <UInput v-model="value" class="w-full"/>
      </div>
    </template>

    <template #body>
      <h1
        v-inline-edit="{
      get: () => value,
      set: (v: string) => (value = v),
    }"
        class="inline-edit text-3xl sm:text-4xl text-pretty font-bold text-highlighted"
      ></h1>
    </template>

  </ConstructorBlockLayout>
</template>

