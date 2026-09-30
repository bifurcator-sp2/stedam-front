// https://nuxt.com/docs/api/configuration/nuxt-config
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
    '@nuxt/icon'
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
  ],

  content: {
    experimental: {
      sqliteConnector: 'native'
    }
  },



  compatibilityDate: '2026-06-30',

  app: {
    baseURL: '/app/',
    head: {
      link: [

      ],
    },
  },


  ssr: false,


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
    mode: 'cookie', // Используем аутентификацию на основе куки
    endpoints: {
      csrf: '/sanctum/csrf-cookie',       // остаётся как есть
      login: '/api/login',
      logout: '/api/logout',
      user: '/api/user',                  // user — это API-маршрут
      register: '/api/register',
      forgotPassword: '/api/forgot-password',
      resetPassword: '/api/reset-password',
    },
    globalMiddleware: {
      enabled: true,
      prepend: false,
      // Если false — неавторизованные пользователи не увидят даже 404, их кинет на логин
      allow404WithoutAuth: true,
    },

    // Настройки редиректов
    redirect: {
      onLogin: '/',            // Куда идти после успешного входа
      onLogout: '/login',      // Куда идти после выхода
      onAuthOnly: '/login',    // Куда перенаправлять неавторизованных (это и есть ваша задача)
      onGuestOnly: '/',        // Куда перенаправлять УЖЕ авторизованных с гостевых страниц (например, с /login)
      keepRequestedRoute: true, // Запомнить исходный URL, чтобы вернуться туда после входа
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
    strategy: 'no_prefix', // Или 'prefix' — зависит от того, хотите ли вы /ru/... в URL
    lazy: true, // Загружать файлы переводов по мере необходимости
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    }
  },


})
