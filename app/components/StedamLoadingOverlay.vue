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

// Индикатор центрируется чистым CSS-флексом внутри слоя на всю высоту вьюпорта
// (см. шаблон). JS-замеров здесь нет намеренно: слой несёт backdrop-filter,
// который сам создаёт containing block для fixed-потомков, поэтому вложенный
// `position: fixed` терял привязку к экрану и прятался за краем документа.
</script>

<template>
  <div class="relative">
    <slot />

    <!--
      Слой перекрытия — fixed относительно вьюпорта. Используем top: 0 + height вьюпорта
      вместо inset: 0 намеренно: inset растягивается по containing block, а он ломается,
      если у любого предка есть transform/filter/backdrop-filter — тогда оверлей
      уезжает вслед за проскролленной страницей.
    -->
    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-350"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <!--
        Один слой на весь вьюпорт: top-0 + h-dvh вместо inset-0 (containing block
        от предков), z-[1000] поверх шапок приложения. Индикатор центрируется
        флексом именно в этом слое — вложенный fixed зависел бы от backdrop-filter
        этого же слоя и уезжал за пределы экрана.
      -->
      <div
        v-if="loading"
        class="fixed inset-x-0 top-0 h-dvh z-[1000] bg-default/60 backdrop-blur-sm overflow-hidden flex items-center justify-center px-4"
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
  </div>
</template>

<style scoped>
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
