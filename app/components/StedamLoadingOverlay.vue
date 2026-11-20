<!-- app/components/StedamLoadingOverlay.vue -->
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  loading?: boolean
  /** Постоянная подпись шага: «Обработка данных», «Загрузка урока» */
  actionText?: string
  /** Меняющаяся строка под логотипом (фразы загрузчика) */
  statusText?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  actionText: '',
  statusText: ''
})

// statusText меняется часто (фразы загрузчика), поэтому в шаблоне читаем
// именно computed: он кэширует результат и при неизменном тексте не дёргает
// рендер. Само значение из директивы приходит reactive-объектом —
// в строку приводим здесь, иначе в интерполяции получится «[object Object]».
const statusText = computed(() => {
  const raw = props.statusText as unknown
  if (raw == null || raw === '') return ''
  return typeof raw === 'string' ? raw : String(raw)
})

const actionText = computed(() => {
  const raw = props.actionText as unknown
  if (raw == null || raw === '') return ''
  return typeof raw === 'string' ? raw : String(raw)
})

// Индикатор центрируется CSS-флексом внутри слоя (см. шаблон). JS-замеров
// здесь нет намеренно: слой несёт backdrop-filter, который сам создаёт
// containing block для fixed-потомков, поэтому вложенный `position: fixed`
// терял привязку к экрану.
</script>

<template>
  <div class="relative">
    <slot />

    <!--
      Телепорт в <body> обязателен. Если оставить слой внутри дерева приложения,
      то любой предок с transform/filter/backdrop-filter/opacity/contain делает
      z-index слоя локальным — и всё, что рендерится в <body> с высоким z-index
      (порталы Nuxt UI, тосты, тултипы, image-viewer в ImageWrapper, меню
      аватарки), оказывается ВЫШЕ загрузчика. То же с transform у предков:
      fixed теряет привязку к вьюпорту и уезжает при скролле.
      В <body> таких предков нет — слой гарантированно перекрывает экран.

      Вложенные элементы z-index не получают: они красятся внутри своего
      stacking context (isolation у слоя), поэтому «выше» оверлея изнутри
      подняться не может.
    -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-150"
        leave-active-class="transition-opacity duration-350"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <!-- Младший брат корня приложения: при равном z-index рисуется поверх. -->
        <div
          v-if="loading"
          class="stedam-loading-layer fixed inset-0 z-[2147483647] bg-default/100 backdrop-blur-sm overflow-hidden flex items-center justify-center px-4"
        >
          <div class="flex flex-col items-center gap-3 min-w-0 max-w-full">
            <div class="stedam-loader flex items-center justify-center">
              <div class="stedam-spinner" />

              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" fill="none" class="stedam-logo">
                <circle cx="200" cy="90" r="40" fill="#2B9BE0" />
                <circle cx="130" cy="140" r="35" fill="#1E7BC0" />
                <circle cx="270" cy="140" r="35" fill="#F58220" />
                <path d="M 80 280 Q 80 200 130 180 Q 180 200 180 280 Z" fill="#1E7BC0" />
                <path d="M 220 280 Q 220 200 270 180 Q 320 200 320 280 Z" fill="#F58220" />
                <path d="M 195 180 L 205 180 L 205 220 L 200 240 L 195 220 Z" fill="#F58220" />
              </svg>
            </div>

            <!-- Порядок: логотип → статус (мелкий, меняется) → действие (обычный текст) -->
            <div class="flex flex-col items-center gap-1 min-w-0 max-w-full">
              <!-- Строка статуса: Transition с mode="out-in" и :key —
                   каждая новая фраза коротко проступает, строка не прыгает -->
              <Transition
                enter-active-class="transition-opacity duration-25"
                leave-active-class="transition-opacity duration-25"
                enter-from-class="opacity-0"
                leave-to-class="opacity-0"
                mode="out-in"
              >
                <p
                  v-if="statusText"
                  :key="statusText"
                  class="max-w-full text-center text-xs text-[var(--ui-text-muted,#6b7280)]"
                >
                  {{ statusText }}
                </p>
              </Transition>

              <!-- Постоянная подпись шага: «Обработка данных» / «Загрузка урока» -->
              <p
                v-if="actionText"
                class="max-w-full text-center text-base text-[var(--ui-text,#0f172a)]"
              >
                {{ actionText }}
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
  /* Собственный stacking context слоя + страховка от transform/filter у <body>. */
  .stedam-loading-layer {
    isolation: isolate;
  }

  /* Контейнер: кольцо + логотип по центру.
     Строго квадратный — иначе кольцо с border-radius: 50% превращается в овал. */
  .stedam-loader {
    position: relative;
    flex: 0 0 auto;
    width: 130px;
    height: 130px;
  }

  /* Кольцо-спиннер */
  .stedam-spinner {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 3px solid rgba(43, 155, 224, 0.15);
    border-top-color: #2B9BE0;
    border-right-color: #2B9BE0;
    box-sizing: border-box;
    animation: stedam-spin 1.2s linear infinite;
  }

  /* Логотип по центру */
  .stedam-logo {
    position: relative;
    z-index: 1;
    width: 120px;
    height: 120px;
    animation: stedam-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes stedam-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes stedam-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: .6; }
  }
</style>
