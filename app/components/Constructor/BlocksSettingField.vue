<!-- app/components/Constructor/BlocksSettingField.vue -->
<!--
  Рекурсивное поле настроек блока. Здесь остаётся только «дирижёр»:
  выбор типа узла, аккордеон, проброс обновлений. Сами виджеты типов
  живут в ./BlockSettingTypes/.
-->
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useSettingAccordion } from './BlockSettingTypes/useSettingAccordion'
import SettingIconField from './BlockSettingTypes/SettingIconField.vue'
import SettingImageField from './BlockSettingTypes/SettingImageField.vue'
import SettingStringField from './BlockSettingTypes/SettingStringField.vue'
import SettingGridField from './BlockSettingTypes/SettingGridField.vue'
import SettingGroupHeader from './BlockSettingTypes/SettingGroupHeader.vue'

interface SettingItem {
  key: string
  label?: string
  type?: 'string' | 'select' | 'content-type' | 'layout' | 'int' | 'float' | 'color' | 'bool' | 'icon' | 'image' | 'multiselect'
  default?: any
  allowed?: any[]
  purpose?: string
  public?: true | false
  children?: SettingItem[]
  params?: SettingItem[] | Record<string, any>
}

const props = withDefaults(
  defineProps<{
    blockId?: number | null
    modelName?: string | null
    mode?: 'admin' | 'public'
    settings?: Record<string, any> | SettingItem[] | null
    maxImages?: number | null
    path?: string
  }>(),
  {
    mode: 'admin',
    settings: null,
    maxImages: undefined,
    path: '',
  },
)

const model = defineModel<SettingItem>({ required: true })
/** Корневой узел дерева — чтобы правки дочерних полей доходили до v-model:settings панели. */
const fullNode = defineModel<SettingItem | null>('fullNode', { default: null })

// ============================================================
// Аккордеон
// ============================================================

const currentPath = computed(() => props.path || model.value.key)
const { isExpanded, toggleExpanded, getChildPath } = useSettingAccordion(currentPath)

// ============================================================
// Внешний вид
// ============================================================

const fieldLabel = computed(() => model.value.label || model.value.key)

/** Если в схеме нет type — при отсутствии children считаем поле строковым. */
const resolvedType = computed<string | undefined>(() => {
  if (model.value.type) return model.value.type
  if (model.value.children?.length) return undefined
  return 'string'
})

const typeIcon = computed(() => {
  switch (resolvedType.value) {
    case 'string': return 'i-lucide-type'
    case 'select': return 'i-lucide-list'
    case 'content-type': return 'i-lucide-list'
    case 'layout': return 'i-lucide-layout'
    case 'int':    return 'i-lucide-hash'
    case 'float':  return 'i-lucide-decimal'
    case 'color':  return 'i-lucide-palette'
    case 'bool':   return 'i-lucide-toggle-left'
    case 'icon':   return 'i-lucide-smile'
    case 'image':  return 'i-lucide-image'
    case 'multiselect': return 'i-lucide-list-checks'
    default:       return 'i-lucide-circle-dot'
  }
})

const publicIcon = computed(() => model.value.public ? 'i-lucide-eye' : 'i-lucide-eye-off')

/** Шеврон «свернуть группу» — только в админке и только у групп с children. */
const canCollapse = computed(() => props.mode === 'admin' && visibleChildren.value.length > 0)

const isGridType = computed(() =>
  ['select', 'content-type', 'layout', 'color', 'int', 'float', 'bool', 'multiselect']
    .includes(resolvedType.value ?? ''),
)

/** Схема может не задавать type у галереи — узнаём её по данным:
 *  непустой массив списков изображений. Пустой массив (как у text3) — не признак. */
const isImageNode = computed(() =>
  resolvedType.value === 'image' ||
  (Array.isArray(model.value.default) && model.value.default.some(
    (it: any) => it && typeof it === 'object' && typeof it.url === 'string',
  )),
)

// ============================================================
// Обновление значения
// ============================================================

function updateDefault(val: any) {
  model.value = { ...model.value, default: val }
}

function togglePublic() {
  model.value = { ...model.value, public: !model.value.public }
}

// ============================================================
// Группы
// ============================================================

function updateChild(index: number, updated: SettingItem) {
  if (!model.value.children) return
  const next = model.value.children.slice()
  next[index] = updated
  model.value = { ...model.value, children: next }
}

const visibleChildren = computed(() => {
  if (!model.value.children) return []

  if (model.value.type === 'content-type') {
    const activeChild = model.value.children.find(
      (child) => child.key === model.value.default || child.key.startsWith(model.value.default)
    )
    return activeChild ? [activeChild] : []
  }

  if (model.value.type === 'multiselect') {
    const selectedKeys = Array.isArray(model.value.default) ? model.value.default : []
    return model.value.children.filter(child => selectedKeys.includes(child.key))
  }

  return model.value.children
})

/** Индекс ребёнка в исходном массиве children (visibleChildren может быть отфильтрован). */
function rawChildIndex(child: SettingItem): number {
  return (model.value.children ?? []).indexOf(child)
}

/** Дочерний узел обновился: заменяем его в children (событие уже пробросилось выше). */
function onChildFullNode(child: SettingItem, updated: SettingItem | null) {
  if (!updated || !model.value.children) return
  updateChild(rawChildIndex(child), updated)
}

/** Проброс обновлённого дочернего узла в корень дерева (если передан full-node). */
watch(
  () => model.value,
  (node) => {
    if (fullNode.value) fullNode.value = node
  },
  { deep: true },
)

// ============================================================
// Params
// ============================================================

const paramsArray = computed<SettingItem[]>(() => {
  if (!model.value.params) return []
  if (Array.isArray(model.value.params)) return model.value.params
  return []
})

const visibleParams = computed(() => {
  if (model.value.type !== 'layout') return []

  if (model.value.default === 'row' || model.value.default === 'col') {
    return paramsArray.value
  }

  return paramsArray.value.slice(0, 1)
})

function updateParam(index: number, updated: SettingItem) {
  if (!Array.isArray(model.value.params)) return
  const next = [...model.value.params]
  next[index] = updated
  model.value = { ...model.value, params: next }
}
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1.5"
    :class="mode === 'admin' && visibleChildren.length && isExpanded
      ? 'relative gap-2 rounded-l-[10px] border border-default bg-elevated px-0 pb-3 pl-3.5 pt-2.5 shadow-sm'
      : ''"
  >
    <!-- Публичность: кнопка-переключатель есть в каждом виджете через слот actions -->
    <template v-if="true">
      <SettingIconField
        v-if="resolvedType === 'icon'"
        :label="fieldLabel"
        :value="model.default"
        @update="updateDefault"
      >
        <template v-if="mode === 'admin'" #actions>
          <UButton
            :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
            class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
            :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
            @click.stop="togglePublic"
          />
        </template>
      </SettingIconField>

      <SettingImageField
        v-else-if="isImageNode"
        :node="model"
        :label="fieldLabel"
        :block-id="blockId"
        :model-name="modelName"
        :settings="settings"
        :max-images="maxImages"
        :path="path"
        @update="updateDefault"
      >
        <template v-if="mode === 'admin'" #actions>
          <UButton
            :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
            class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
            :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
            @click.stop="togglePublic"
          />
        </template>
      </SettingImageField>

      <SettingStringField
        v-else-if="resolvedType === 'string'"
        :label="fieldLabel"
        :field-key="mode === 'admin' ? model.key : undefined"
        :icon="typeIcon"
        :value="model.default"
        :collapsible="canCollapse"
        :expanded="isExpanded"
        @update="updateDefault"
        @toggle="toggleExpanded"
      >
        <template v-if="mode === 'admin'" #actions>
          <UButton
            :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
            class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
            :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
            @click.stop="togglePublic"
          />
        </template>
      </SettingStringField>

      <SettingGridField
        v-else-if="isGridType"
        :label="fieldLabel"
        :field-key="mode === 'admin' ? model.key : undefined"
        :type="resolvedType!"
        :icon="typeIcon"
        :value="model.default"
        :allowed="model.allowed"
        :collapsible="canCollapse"
        :expanded="isExpanded"
        @update="updateDefault"
        @toggle="toggleExpanded"
      >
        <template v-if="mode === 'admin'" #actions>
          <UButton
            :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
            class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
            :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
            @click.stop="togglePublic"
          />
        </template>
      </SettingGridField>

      <SettingGroupHeader
        v-else
        :label="fieldLabel"
        :field-key="mode === 'admin' ? model.key : undefined"
        :expanded="isExpanded"
        @toggle="toggleExpanded"
      >
        <template v-if="mode === 'admin'" #actions>
          <UButton
            :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
            class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
            :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
            @click.stop="togglePublic"
          />
        </template>
      </SettingGroupHeader>
    </template>

    <!-- ============ CHILDREN ============ -->
    <div v-if="mode === 'admin' && visibleChildren.length && isExpanded" class="mt-1 flex flex-col gap-1.5">
      <BlocksSettingField
        v-for="child in visibleChildren" :key="child.key" :model-value="child"
        :block-id="blockId" :model-name="modelName" :mode="mode" :settings="settings" :max-images="props.maxImages"
        :full-node="fullNode ?? model"
        @update:full-node="onChildFullNode(child, $event)"
        :path="getChildPath(child.key)"
        @update:model-value="updateChild(rawChildIndex(child), $event)"
      />
    </div>

    <!-- ============ PARAMS ============ -->
    <div v-if="mode === 'admin' && resolvedType === 'layout' && visibleParams.length && isExpanded" class="mt-1 flex flex-col gap-1.5">
      <div class="text-[10px] font-bold uppercase tracking-widest text-muted mb-0.5">Параметры</div>
      <BlocksSettingField
        v-for="(paramItem, index) in visibleParams"
        :key="paramItem.key"
        :model-value="paramItem"
        :block-id="blockId"
        :model-name="modelName"
        :mode="mode"
        :settings="settings"
        :path="getChildPath(paramItem.key)"
        @update:model-value="updateParam(index, $event)"
      />
    </div>
  </div>
</template>

<script lang="ts">
// Явный self-import нужен, чтобы рекурсивный вызов <BlocksSettingField> резолвился без auto-import.
import BlocksSettingField from '~/components/Constructor/BlocksSettingField.vue'

export default {
  name: 'BlocksSettingField',
  components: { BlocksSettingField },
}
</script>
