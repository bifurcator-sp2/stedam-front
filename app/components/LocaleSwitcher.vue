<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { locale, locales, setLocale } = useI18n()

// Приводим список локалей к формату, который понимает UDropdownMenu
const availableLocales = computed(() =>
  locales.value.map((loc) => ({
    code: loc.code,
    name: loc.name,
    flag: getFlagEmoji(loc.code),
  }))
)

// Текущая локаль (для отображения в кнопке)
const currentLocale = computed(() =>
  availableLocales.value.find((l) => l.code === locale.value)
)

// Формируем items для выпадающего меню
const items = computed<DropdownMenuItem[][]>(() => [
  availableLocales.value.map((loc) => ({
    label: `${loc.flag}  ${loc.name}`,
    // Галочка у активного языка
    icon: loc.code === locale.value ? 'i-lucide-check' : undefined,
    onSelect: () => setLocale(loc.code),
  })),
])

// Простой маппинг кода языка в эмодзи-флаг.
// Для не-страновых кодов (en, ru) используем заглушку.
function getFlagEmoji(code: string): string {
  const flags: Record<string, string> = {
    ru: '🇷🇺',
    en: '🇬🇧',
  }
  return flags[code] ?? '🌐'
}
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      :icon="'i-lucide-languages'"
      :label="currentLocale?.flag"
      :trailing-icon="'i-lucide-chevron-down'"
      :aria-label="`Текущий язык: ${currentLocale?.name}`"
    />
  </UDropdownMenu>
</template>
