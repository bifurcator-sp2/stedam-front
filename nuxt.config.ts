// https://nuxt.com/docs/api/configuration/nuxt-config
import { resolve } from 'node:path'
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    '@vueuse/nuxt',
    'nuxt-og-image',
    'nuxt-auth-sanctum',
    '@nuxtjs/i18n',
    '@nuxt/icon',
    '@xiaobailong/web-update-notice-plugin/nuxt',
  ],

  icon: {
    mode: 'svg',
    serverBundle: {
      collections: ['lucide'],
    },
  },

  runtimeConfig: {
    public: {
      apiBase: '/api',
    },
  },

  devtools: {
    enabled: true
  },

  css: [
    '~/assets/css/main.css',
    'katex/dist/katex.min.css',
    'cropperjs/dist/cropper.css'
  ],
  experimental: {
    emitRouteChunkError: 'automatic-immediate'
  },
  content: {
    experimental: {
      sqliteConnector: 'native',
    }
  },

  compatibilityDate: '2026-06-30',

  app: {
    baseURL: '/app/',
    head: {
      link: [
        { rel: 'stylesheet', href: '/_tokens.css' }
      ],
    },
  },
  webUpdateNotice: {
    checkInterval: 5 * 60 * 1000, // Проверять каждые 5 минут
    base: '/app/', // ❗ Важно: путь, по которому доступно приложение
    autoRefresh: false, // Автоматически перезагружать страницу
    showButtons: true, // Показывать кнопки "Позже" и "Обновить"
    text: {
      title: 'Доступно обновление',
      desc: 'Вышла новая версия приложения. Пожалуйста, обновите страницу.',
      cancel: 'Позже',
      confirm: 'Обновить сейчас',
    },
  },
  /*render: {
    crossorigin: 'use-credentials'
  },*/

  vite: {
    build: {
      target: ['safari11', 'ios11'],
      rolldownOptions: {
        output: {
          codeSplitting: false, // Отключает разделение кода на чанки
        },
      },
    },
    define: {
      __VUE_PROD_DEVTOOLS__: 'true'
    }
  },

  ssr: false,
  spaLoadingTemplate: resolve(__dirname, 'app/spa-loading-template.html'),
  nitro: {
    debug: true,
    preset: 'static',
    output: {
      publicDir: '/home/stedam/public/app',
    },
    prerender: {
      routes: [],
      crawlLinks: false
    },
    minify: true,
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  ogImage: {
    zeroRuntime: true
  },

  sanctum: {
    baseUrl: '/',
    mode: 'cookie',
    endpoints: {
      csrf: '/sanctum/csrf-cookie',
      login: '/api/login',
      logout: '/api/logout',
      user: '/api/user',
      register: '/api/register',
      forgotPassword: '/api/forgot-password',
      resetPassword: '/api/reset-password',
    },
    globalMiddleware: {
      enabled: true,
      prepend: false,
      allow404WithoutAuth: true,
    },

    redirect: {
      onLogin: '/',
      onLogout: '/login',
      onAuthOnly: '/login',
      onGuestOnly: '/',
      keepRequestedRoute: true,
    },
    client: {
      initialRequest: true,
    },
  },

  i18n: {
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'ru', name: 'Русский', file: 'ru.json' }
    ],
    defaultLocale: 'ru',
    strategy: 'no_prefix',
    lazy: true,
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    }
  },
})
