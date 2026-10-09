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
    '@nuxt/icon',
    // ✅ legacy-сборка для старых Safari / iPad
    '@teages/nuxt-legacy',
  ],

  // ✅ Настройки legacy-сборки
  legacy: {
    vite: {
      targets: ['chrome 49', 'safari 11'],
      renderLegacyChunks: true,
    },
    customPolyfills: {
      scanDirs: ['polyfills'],
    },
  },

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
        { rel: 'stylesheet', href: '/_tokens.css' }
      ],
    },
  },

  render: {
    crossorigin: 'use-credentials'
  },

  vite: {
    // ❗ terser обязателен для plugin-legacy 8.x при Chrome < 80
    build: {
      minify: 'terser',
      target: ['es2015', 'safari11'],
    },
    define: {
      __VUE_PROD_DEVTOOLS__: 'true'
    }
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
