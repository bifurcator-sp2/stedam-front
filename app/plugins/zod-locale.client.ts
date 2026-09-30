/*
import * as z from 'zod'

export default defineNuxtPlugin(() => {
  const { locale } = useI18n()

  const zodLocales: Record<string, any> = {
    ru: z.locales.ru,
    en: z.locales.en,
  }

  function applyLocale(lang: string) {
    const zodLocale = zodLocales[lang]
    if (!zodLocale) return

    const originalLocale = zodLocale().localeError

    z.config({
      localeError: (issue: any) => {
        if (
          issue.code === 'invalid_type' &&
          issue.expected === 'string' &&
          issue.input === undefined
        ) {
          return lang === 'ru' ? 'Обязательное поле' : 'Required field'
        }
        return originalLocale(issue)
      },
    })
  }

  applyLocale(locale.value)
  watch(locale, applyLocale)
})
*/

import * as z from 'zod'

export default defineNuxtPlugin((nuxtApp) => {
  // Получаем i18n из nuxtApp, а не через useI18n()
  const i18n = nuxtApp.$i18n as any

  const zodLocales: Record<string, any> = {
    ru: z.locales.ru,
    en: z.locales.en,
  }

  function applyLocale(lang: string) {
    const zodLocale = zodLocales[lang]
    if (!zodLocale) return

    const originalLocale = zodLocale().localeError

    z.config({
      localeError: (issue: any) => {
        if (
          issue.code === 'invalid_type' &&
          issue.expected === 'string' &&
          issue.input === undefined
        ) {
          return lang === 'ru' ? 'Обязательное поле' : 'Required field'
        }
        return originalLocale(issue)
      },
    })
  }

  applyLocale(i18n.locale.value)

  // watch тоже через i18n
  watch(i18n.locale, (newLang) => {
    applyLocale(newLang)
  })
})
