<script setup lang="ts">
const { t, locale } = useI18n()
const toast = useToast()

definePageMeta({
  layout: 'main',
})

const title = computed(() => t('privacy.title'))
const description = computed(() => t('privacy.description'))

useSeoMeta({
  titleTemplate: '',
  title,
  ogTitle: title,
  description,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/saas-light.png',
})

const formattedDate = computed(() => {
  const date = new Date()
  return date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})

// --- Логика управления Cookie ---
const allowCookies = ref(false)

// При загрузке страницы проверяем текущий статус
onMounted(() => {
  const consent = localStorage.getItem('cookie_consent')
  allowCookies.value = consent === 'accepted'
})

// Обработчик переключения
function handleCookieToggle(value: boolean) {
  localStorage.setItem('cookie_consent', value ? 'accepted' : 'declined')

  if (value) {
    toast.add({
      title: t('cookies.accepted', 'Аналитика включена'),
      description: t('cookies.acceptedDesc', 'Мы будем использовать файлы cookie для улучшения сайта.'),
      color: 'success',
    })
    // Здесь можно инициализировать Яндекс.Метрику или Google Analytics
    // window.ym(...)
  } else {
    toast.add({
      title: t('cookies.declined', 'Аналитика отключена'),
      description: t('cookies.declinedDesc', 'Мы не будем собирать аналитические данные.'),
      color: 'warning',
    })
    // Здесь можно удалить куки аналитики, если нужно
  }
}
</script>

<template>
  <UContainer class="py-12 md:py-16">
    <div class="max-w-3xl mx-auto">
      <UPageCard variant="subtle" class="p-8 md:p-12">
        <article class="prose prose-zinc dark:prose-invert max-w-none">

          <h1 class="text-2xl font-bold mb-6 text-highlighted">
            {{ t('privacy.title') }}
          </h1>

          <i18n-t keypath="privacy.intro" tag="p" class="text-muted mb-6">
            <template #app>
              <strong>STEDAM</strong>
            </template>
          </i18n-t>

          <h2 class="text-xl font-semibold mt-8 mb-4 text-highlighted">
            {{ t('privacy.data_collection.title') }}
          </h2>
          <p class="text-muted mb-4">
            {{ t('privacy.data_collection.intro') }}
          </p>
          <ul class="list-disc pl-5 text-muted space-y-2 mb-6">
            <li>
              <strong>{{ t('privacy.data_collection.account_title') }}</strong>
              {{ t('privacy.data_collection.account_text') }}
            </li>
            <li>
              <strong>{{ t('privacy.data_collection.profile_title') }}</strong>
              {{ t('privacy.data_collection.profile_text') }}
            </li>
            <li>
              <strong>{{ t('privacy.data_collection.technical_title') }}</strong>
              {{ t('privacy.data_collection.technical_text') }}
            </li>
          </ul>

          <h2 class="text-xl font-semibold mt-8 mb-4 text-highlighted">
            {{ t('privacy.cookies.title') }}
          </h2>
          <p class="text-muted mb-4">
            {{ t('privacy.cookies.intro') }}
          </p>
          <ul class="list-disc pl-5 text-muted space-y-2 mb-6">
            <li>
              <strong>{{ t('privacy.cookies.strict_title') }}</strong>
              {{ t('privacy.cookies.strict_text') }}
            </li>
            <li>
              <strong>{{ t('privacy.cookies.analytics_title') }}</strong>
              {{ t('privacy.cookies.analytics_text') }}
            </li>
          </ul>
          <p class="text-muted mb-6">
            {{ t('privacy.cookies.outro') }}
          </p>

          <h2 class="text-xl font-semibold mt-8 mb-4 text-highlighted">
            {{ t('privacy.manage.title') }}
          </h2>
          <p class="text-muted mb-6">
            {{ t('privacy.manage.text') }}
          </p>

          <!-- Блок с настройками Cookie (добавлен not-prose, чтобы стили статьи не ломали свитч) -->
          <div class="not-prose my-8 p-6 bg-elevated/50 rounded-xl border border-default">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 class="font-semibold text-highlighted">
                  {{ t('privacy.cookie_settings.title', 'Настройки аналитических cookie') }}
                </h3>
                <p class="text-sm text-muted mt-1">
                  {{ t('privacy.cookie_settings.description', 'Вы можете изменить свое решение в любой момент.') }}
                </p>
              </div>

              <div class="flex items-center gap-3 shrink-0">
                <span class="text-sm font-medium" :class="allowCookies ? 'text-primary' : 'text-muted'">
                  {{ allowCookies ? t('cookies.accepted_short', 'Включено') : t('cookies.declined_short', 'Отключено') }}
                </span>
                <USwitch
                  v-model="allowCookies"
                  size="lg"
                  @update:model-value="handleCookieToggle"
                />
              </div>
            </div>
          </div>

          <h2 class="text-xl font-semibold mt-8 mb-4 text-highlighted">
            {{ t('privacy.third_party.title') }}
          </h2>
          <p class="text-muted mb-6">
            {{ t('privacy.third_party.text') }}
          </p>

          <h2 class="text-xl font-semibold mt-8 mb-4 text-highlighted">
            {{ t('privacy.contacts.title') }}
          </h2>
          <p class="text-muted mb-6">
            {{ t('privacy.contacts.text') }}
            <a
              :href="`mailto:${t('privacy.contacts.email')}`"
              class="text-primary hover:underline"
            >{{ t('privacy.contacts.email') }}</a>.
          </p>

          <div class="text-sm text-muted mt-12 pt-6 border-t border-default">
            {{ t('privacy.last_updated') }} {{ formattedDate }}
          </div>

        </article>
      </UPageCard>
    </div>
  </UContainer>
</template>
