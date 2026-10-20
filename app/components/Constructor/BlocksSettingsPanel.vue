<script setup lang="ts">
import { computed } from 'vue'
import BlocksSettingField from '~/components/Constructor/BlocksSettingField.vue'
import {
  collectPublicSettingsWithPaths,
  replaceNodeAtPath,
  type PublicSettingRef,
} from '~/utils/constructors'

const id = defineModel<number | null>('id')
const title = defineModel<string | null>('title')
const description = defineModel<string | null>('description')
const settings = defineModel<SettingNode[]>('settings', { default: () => [] })
const parentBlockIndexIds = defineModel<number[] | null>('parent_block_index_ids', {
  default: null,
})

const props = withDefaults(
  defineProps<{
    modelName?: string | null
    mode?: 'admin' | 'public'
  }>(),
  {
    mode: 'admin',
  },
)

/** id блока — прокидываем в FileContainer */
const blockId = computed(() => id.value ?? null)

/** Плоский список public-настроек с путями до них в дереве. */
const publicSettings = computed<PublicSettingRef[]>(() =>
  collectPublicSettingsWithPaths(settings.value),
)

function resolvePath(root: any, path: string): any {
  if (root == null || !path) return undefined
  if (Array.isArray(root)) {
    const [head, ...rest] = path.split('.')
    const found = root.find((it: any) => it?.key === head)
    if (!found) return undefined
    if (rest.length === 0) return found.default
    return resolvePath(found.children ?? found.default ?? found, rest.join('.'))
  }
  return path
    .split('.')
    .reduce((acc, part) => (acc == null ? undefined : acc[part]), root)
}

function computeMaxImages(item: SettingNode): number | null {
  const raw = (item as any)?.params?.count
  if (raw == null) return null

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null
  } else if (typeof raw === 'string') {
    // Если это динамический резолвер (например, parent.count),
    // возвращаем null — BlocksSettingField сам его вычислит.
    if (raw === 'parent.count') {
      return null
    }
    const val = resolvePath(settings.value, raw)
    const num = Number(val)
    return Number.isFinite(num) ? num : null
  }

  return null
}

function updateItem(index: number, updated: SettingNode) {
  const next = settings.value.slice()
  next[index] = updated
  settings.value = next
}

function updatePublicItem(path: number[], updated: SettingNode) {
  settings.value = replaceNodeAtPath(settings.value, path, () => updated)
}

const published = defineModel<boolean>('published', { default: false })

</script>

<template>
  <div class="flex flex-col gap-4 px-3.5 pb-6 pt-3.5 block-settings-panel">
    <template v-if="mode === 'admin'">
      <!-- Шапка с ID и статусом -->
      <div
        class="relative flex items-center justify-between gap-2.5 overflow-hidden rounded-lg border border-default bg-elevated py-2 pl-3 pr-2.5"
      >
        <span
          class="absolute inset-y-0 left-0 w-[3px] rounded-r-sm bg-gradient-to-b from-blue-400 to-blue-500"
        />

        <span class="text-[10px] font-bold uppercase tracking-widest text-muted">
          Блок
        </span>

        <div class="flex items-center gap-3">
          <!-- Свитч статуса -->
          <div
            class="flex items-center gap-2 cursor-pointer select-none"
            @click="published = !published"
          >
            <USwitch
              v-model="published"
              color="success"
              size="xs"
            />
            <span
              class="text-[10px] font-bold uppercase tracking-widest transition-colors"
              :class="published ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'"
            >
              {{ published ? 'Опубликован' : 'Черновик' }}
            </span>
          </div>

          <!-- ID блока -->
          <span
            class="inline-flex items-center gap-1 rounded-full border border-default bg-default px-2.5 py-[3px] font-mono text-[11.5px] font-semibold text-highlighted shadow-sm"
          >
            <UIcon name="i-lucide-hash" class="size-3 text-primary"/>
            {{ id ?? '—' }}
          </span>
        </div>
      </div>

      <!-- Основные поля -->
      <section class="flex flex-col gap-2.5">
        <header class="relative flex items-center gap-1.5 pb-2 pl-2.5">
        <span
          class="absolute left-0 top-px bottom-2 w-0.5 rounded-full bg-gradient-to-b from-primary to-primary/15"
        />
          <span
            class="absolute bottom-0 left-2.5 right-0 h-px bg-gradient-to-r from-default to-transparent"
          />
          <UIcon name="i-lucide-info" class="size-3.5 text-muted"/>
          <span class="flex-1 text-[10px] font-bold uppercase tracking-widest text-muted">
          Основное
        </span>
        </header>
        <div class="flex flex-col gap-1.5">
          <label for="block-index-ids" class="pl-0.5 text-[11px] font-semibold text-muted">
            Положение в меню
          </label>
          <ConstructorBlockIndexSelector  id="block-index-ids" v-model="parentBlockIndexIds" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="block-name" class="pl-0.5 text-[11px] font-semibold text-muted">
            Название
          </label>
          <UInput
            id="block-name"
            v-model="title"
            size="xs"
            placeholder="Введите название"
            class="w-full"
          />
        </div>


        <div class="flex flex-col gap-1.5">
          <label for="block-description" class="pl-0.5 text-[11px] font-semibold text-muted">
            Описание
          </label>
          <UTextarea
            id="block-description"
            v-model="description"
            size="xs"
            :rows="3"
            autoresize
            placeholder="Краткое описание"
            class="w-full"
          />
        </div>
      </section>
    </template>

    <!-- Настройки -->
    <section class="flex flex-col gap-2.5">
      <!-- ============ ADMIN ============ -->
      <template v-if="mode === 'admin'">
        <header class="relative flex items-center gap-1.5 pb-2 pl-2.5">
        <span
          class="absolute left-0 top-px bottom-2 w-0.5 rounded-full bg-gradient-to-b from-primary to-primary/15"
        />
          <span
            class="absolute bottom-0 left-2.5 right-0 h-px bg-gradient-to-r from-default to-transparent"
          />
          <UIcon name="i-lucide-sliders-horizontal" class="size-3.5 text-muted"/>
          <span class="flex-1 text-[10px] font-bold uppercase tracking-widest text-muted">
          Настройки
        </span>
          <span
            v-if="settings?.length"
            class="inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-2 text-[10.5px] font-bold leading-none text-primary"
          >
          {{ settings.length }}
        </span>
        </header>


        <div v-if="settings?.length" class="flex flex-col gap-2">
          <BlocksSettingField
            v-for="(item, index) in settings"
            :key="item.key"
            :model-value="item"
            :block-id="blockId"
            :model-name="modelName"
            :mode="mode"
            :settings="settings"
            :max-images="computeMaxImages(item)"
            :path="item.key"
            @update:model-value="updateItem(index, $event)"
          />
        </div>

        <div
          v-else
          class="relative flex flex-col items-center gap-1.5 overflow-hidden rounded-lg border border-dashed border-default bg-elevated px-3.5 pb-6 pt-7 text-center"
        >
          <div
            class="mb-1 flex size-11 items-center justify-center rounded-2xl border border-default bg-default shadow-sm"
          >
            <UIcon name="i-lucide-sliders-horizontal" class="size-5 text-primary/75"/>
          </div>
          <span class="text-[12.5px] font-semibold text-highlighted">Нет настроек</span>
          <span class="max-w-[220px] text-[11px] leading-snug text-muted">
            Добавьте поля, чтобы управлять блоком
          </span>
        </div>
      </template>

      <!-- ============ PUBLIC ============ -->
      <template v-else>
        <div v-if="publicSettings.length" class="flex flex-col gap-2.5">
          <BlocksSettingField
            v-for="ref in publicSettings"
            :key="ref.path.join('.')"
            :model-value="ref.item"
            :block-id="blockId"
            :model-name="modelName"
            :mode="mode"
            :settings="settings"
            :max-images="computeMaxImages(ref.item)"
            :path="ref.keyPath"
            @update:model-value="updatePublicItem(ref.path, $event)"
          />
        </div>

        <div
          v-else
          class="relative flex flex-col items-center gap-1.5 overflow-hidden rounded-lg border border-dashed border-default bg-elevated px-3.5 pb-6 pt-7 text-center"
        >
          <div
            class="mb-1 flex size-11 items-center justify-center rounded-2xl border border-default bg-default shadow-sm"
          >
            <UIcon name="i-lucide-eye-off" class="size-5 text-primary/75"/>
          </div>
          <span class="text-[12.5px] font-semibold text-highlighted">
            Нет публичных настроек
          </span>
          <span class="max-w-[220px] text-[11px] leading-snug text-muted">
            Для этого блока нечего показывать
          </span>
        </div>
      </template>
    </section>
  </div>
</template>
