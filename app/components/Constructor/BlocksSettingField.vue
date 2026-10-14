<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, toRaw } from 'vue'
import { Vue3IconPicker } from 'vue3-icon-picker'
import 'vue3-icon-picker/dist/style.css'
import type { FilesListResponse, ImageItem } from '~/types/files'
import { useSanitize } from '~/composables/useSanitize'

interface SettingItem {
  key: string
  label: string
  type: 'string' | 'select' | 'int' | 'color' | 'bool' | 'icon' | 'image'
  default?: any
  allowed?: any[]
  purpose?: string
  public?: true | false
  children?: SettingItem[]
}

const props = withDefaults(
  defineProps<{
    blockId?: number | null
    modelName?: string | null
    mode?: 'admin' | 'public'
  }>(),
  {
    mode: 'admin',
  },
)

const model = defineModel<SettingItem>({ required: true })

const { sanitizeHtml } = useSanitize()

// Режим блока icon: 'manual' | 'picker'
const iconMode = ref<'manual' | 'picker'>('manual')

// Иконка типа — для мини-бейджа рядом с лейблом
const typeIcon = computed(() => {
  switch (model.value.type) {
    case 'string': return 'i-lucide-type'
    case 'select': return 'i-lucide-list'
    case 'int':    return 'i-lucide-hash'
    case 'color':  return 'i-lucide-palette'
    case 'bool':   return 'i-lucide-toggle-left'
    case 'icon':   return 'i-lucide-smile'
    case 'image':  return 'i-lucide-image'
    default:       return 'i-lucide-circle-dot'
  }
})

// Иконка для текущего состояния public
const publicIcon = computed(() =>
  model.value.public ? 'i-lucide-eye' : 'i-lucide-eye-off',
)


// ============================================================
// Тип "string" — авторесайз + санитайз
// ============================================================

const textareaRef = ref<HTMLTextAreaElement | null>(null)

/** Черновик ввода: пока фокус в textarea — храним сырую строку, чтобы можно было набирать HTML. */
const stringDraft = ref<string>('')

/** Черновик актуален только при активном редактировании. */
const isEditing = ref(false)

/** Значение из модели, как есть. */
const modelString = computed<string>(() => {
  const v = model.value.default
  return typeof v === 'string' ? v : ''
})

/** То, что показываем в textarea. */
const stringModel = computed<string>({
  get() {
    return isEditing.value ? stringDraft.value : modelString.value
  },
  set(raw: string) {
    stringDraft.value = raw
  },
})

/** Зафиксировать: санитайзим черновик и пишем в модель. */
function commitString() {
  const clean = sanitizeHtml(stringDraft.value)
  isEditing.value = false
  if (clean !== model.value.default) {
    model.value = { ...model.value, default: clean }
  }
  stringDraft.value = clean
}

function onStringFocus() {
  stringDraft.value = modelString.value
  isEditing.value = true
}

function onStringBlur() {
  commitString()
}

/** Подгоняем высоту textarea под контент. */
function resizeTextarea() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

onMounted(async () => {
  await nextTick()
  resizeTextarea()
})

watch(stringModel, async () => {
  await nextTick()
  resizeTextarea()
})

watch(modelString, (val) => {
  if (!isEditing.value) stringDraft.value = val
})

// ============================================================
// Тип "image"
// ============================================================

function emptyFiles(): FilesListResponse {
  return {
    images: [],
    files: [],
    temp: { images: [], files: [] },
    stored: { images: [], files: [] },
  }
}

const imageFiles = ref<FilesListResponse>(emptyFiles())

const fileContainerRef = ref<InstanceType<typeof FileContainer> | null>(null)

const imagePurpose = computed<string | null>(() => {
  if (typeof model.value.purpose === 'string' && model.value.purpose) {
    return model.value.purpose
  }
  const first = model.value.allowed?.[0]
  return typeof first === 'string' && first ? first : null
})

const maxImages = computed<string | number | null>(() => {
  if (typeof model.value.purpose === 'string' && model.value.purpose) {
    return -1
  }
  const first = model.value.allowed?.[1]
  return first ? first : null
})

const resolvedModelName = computed<string>(() => {
  return props.modelName || 'blocks'
})

const formattedInitialFiles = computed<FilesListResponse | null>(() => {
  const val = model.value.default
  if (!Array.isArray(val) || val.length === 0) {
    return null
  }

  const raw = toRaw(val)
  const images = raw.map((i: any) => ({ ...toRaw(i) }))

  return {
    images,
    files: [],
    temp: { images: [], files: [] },
    stored: { images, files: [] },
  }
})

watch(
  () => imageFiles.value.images,
  (images) => {
    const current = model.value.default
    const same =
      Array.isArray(current) &&
      current.length === images.length &&
      current.every((x: any, i: number) => x?.url === images[i]?.url)

    if (same) return

    model.value = { ...model.value, default: images }
  },
  { deep: true },
)

function onRemove(item: ImageItem) {
  fileContainerRef.value?.removeFile(item)
}

function onRestore(item: ImageItem) {
  fileContainerRef.value?.restoreFile(item)
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
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1.5"
    :class="model.children?.length
      ? 'relative gap-2 overflow-hidden rounded-[10px] border border-default bg-elevated px-3 pb-3 pl-3.5 pt-2.5 shadow-sm'
      : ''"
  >
    <!-- ============ ГРУППА ============ -->
    <template v-if="model.children?.length">
      <!-- Левая акцентная полоса (только для группы верхнего уровня, не для вложенных) -->
      <span
        class="pointer-events-none absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r-sm bg-gradient-to-b from-primary/55 to-primary/5"
      />

      <div class="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-widest text-highlighted">
        <span class="inline-flex size-3.5 items-center justify-center text-muted transition-transform duration-200">
          <UIcon name="i-lucide-chevron-right" class="size-3.5" />
        </span>
        <UIcon name="i-lucide-folder-tree" class="size-3.5 text-primary/85" />
        <span class="flex-1 truncate">{{ model.label }}</span>
        <span
          class="rounded-full border border-default bg-default px-1.5 py-0.5 font-mono text-[9.5px] font-medium normal-case tracking-normal text-muted shadow-sm"
        >
          {{ model.key }}
        </span>

        <UButton
          v-if="mode==='admin'"
          :icon="publicIcon"
          size="xs"
          color="neutral"
          variant="ghost"
          square
          class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
          :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <BlocksSettingField
          v-for="(child, index) in model.children"
          :key="child.key"
          :model-value="child"
          :block-id="blockId"
          :model-name="modelName"
          :mode="mode"
          @update:model-value="updateChild(index, $event)"
        />
      </div>
    </template>

    <!-- ============ ICON ============ -->
    <template v-else-if="model.type === 'icon'">
      <div class="grid grid-cols-[60px_minmax(0,1fr)] items-start gap-3">
        <div
          class="relative flex size-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default bg-default p-2.5 shadow-sm transition"
          :class="!model.default ? 'border-dashed bg-elevated shadow-none' : ''"
        >
          <UIcon
            v-if="model.default"
            :name="model.default"
            class="size-full text-highlighted"
          />
          <UIcon v-else name="i-lucide-image-off" class="size-5 text-muted" />
        </div>

        <div class="flex min-w-0 flex-col gap-1.5">
          <div class="flex min-w-0 items-center justify-between gap-2">
            <span class="truncate text-[11.5px] font-semibold text-highlighted">
              {{ model.label }}
            </span>
            <span
              class="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary"
            >
              {{ iconMode === 'manual' ? 'вручную' : 'из набора' }}
            </span>

            <UButton
              v-if="mode==='admin'"
              :icon="publicIcon"
              size="xs"
              color="neutral"
              variant="ghost"
              square
              class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
              :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
            />
          </div>

          <div v-if="iconMode === 'manual'" class="flex min-w-0 items-center gap-1.5">
            <UInput
              v-model="model.default"
              size="xs"
              placeholder="i-lucide-hop"
              class="min-w-0 flex-1"
            />
            <UButton
              icon="i-lucide-grid-2x2"
              size="xs"
              color="neutral"
              variant="soft"
              square
              title="Выбрать из библиотеки"
              @click="iconMode = 'picker'"
            />
          </div>

          <div v-else class="flex min-w-0 items-center gap-1.5">
            <Vue3IconPicker
              v-model="model.default"
              placeholder="Поиск иконки..."
              icon-library="lucide"
              class="min-w-0 flex-1"
            />
            <UButton
              icon="i-lucide-keyboard"
              size="xs"
              color="neutral"
              variant="soft"
              square
              title="Ввести вручную"
              @click="iconMode = 'manual'"
            />
          </div>

          <div
            v-if="iconMode === 'manual'"
            class="flex flex-col gap-1.5 rounded-md border border-default bg-elevated p-2 text-[10.5px] text-muted"
          >
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[8.5px] font-bold uppercase tracking-widest text-muted">синтаксис</span>
              <code class="rounded-full border border-default bg-default px-1.5 py-px font-mono text-[10px] text-highlighted shadow-sm">
                i-набор:имя
              </code>
              <span class="text-muted/50">·</span>
              <span class="text-[8.5px] font-bold uppercase tracking-widest text-muted">пример</span>
              <code class="rounded-full border border-default bg-default px-1.5 py-px font-mono text-[10px] text-highlighted shadow-sm">
                i-lucide-hop
              </code>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <a
                href="https://icones.js.org"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 rounded-full border border-default bg-default px-2 py-0.5 text-[10.5px] font-medium text-primary shadow-sm transition hover:border-primary hover:bg-primary/10"
              >
                <UIcon name="i-lucide-external-link" class="size-3" />
                icones.js.org
              </a>
              <a
                href="https://lucide.dev/icons/"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 rounded-full border border-default bg-default px-2 py-0.5 text-[10.5px] font-medium text-primary shadow-sm transition hover:border-primary hover:bg-primary/10"
              >
                <UIcon name="i-lucide-external-link" class="size-3" />
                lucide.dev
              </a>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ============ IMAGE ============ -->
    <template v-else-if="model.type === 'image'">
      <div class="flex flex-col gap-2.5">
        <div class="flex items-center justify-between gap-2 px-0.5">
          <span class="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-highlighted">
            <UIcon name="i-lucide-image" class="size-3.5 text-primary/85" />
            {{ model.label }}
          </span>

          <div class="flex items-center gap-1.5">
            <span
              v-if="imagePurpose"
              class="rounded-full border border-default bg-default px-1.5 py-0.5 font-mono text-[9.5px] text-muted shadow-sm"
            >
              {{ imagePurpose }}
            </span>

            <UButton
              v-if="mode==='admin'"
              :icon="publicIcon"
              size="xs"
              color="neutral"
              variant="ghost"
              square
              class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
              :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
            />
          </div>
        </div>

        <FileContainer
          ref="fileContainerRef"
          v-if="imagePurpose"
          :model-name="resolvedModelName"
          :model-id="blockId ?? 0"
          :purpose="imagePurpose"
          :max-images="maxImages"
          :initial-files="formattedInitialFiles"
          file-type="image"
          v-model:files="imageFiles"
        />

        <div
          v-else
          class="flex items-center gap-1.5 rounded-md border border-dashed border-default bg-elevated px-3 py-2.5 text-[11.5px] text-muted"
        >
          <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
          <span>Не задан purpose для изображения</span>
        </div>

        <div v-if="imageFiles.images.length" class="flex flex-wrap items-start gap-2">
          <ImageWrapper
            v-for="(img, idx) in imageFiles.images"
            :key="img.url ?? idx"
            :item="img"
            :siblings="imageFiles.images"
            :allow-drag-and-drop="false"
            :show-to-delete="true"
            @remove="onRemove($event)"
            @restore="onRestore($event)"
          >
            <img
              :src="img.url"
              class="size-[68px] rounded-md border border-default bg-muted object-cover shadow-sm transition hover:-translate-y-0.5 hover:scale-[1.02] hover:border-primary/40 hover:shadow-md"
            />
          </ImageWrapper>
        </div>
      </div>
    </template>

    <!-- ============ ЛИСТОВЫЕ ============ -->
    <template v-else>
      <!-- string -->
      <template v-if="model.type === 'string'">
        <div class="flex min-w-0 items-center gap-1.5 pl-px">
          <UIcon :name="typeIcon" class="size-3 shrink-0 text-muted" />
          <span class="truncate text-[11.5px] font-semibold text-highlighted">
            {{ model.label }}
          </span>
          <span
            class="rounded-full border border-default bg-default px-1.5 py-px font-mono text-[9.5px] text-muted"
          >
            {{ model.key }}
          </span>

          <UButton
            v-if="mode==='admin'"
            :icon="publicIcon"
            size="xs"
            color="neutral"
            variant="ghost"
            square
            class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
            :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
          />
        </div>

        <textarea
          ref="textareaRef"
          v-model="stringModel"
          rows="1"
          spellcheck="false"
          class="w-full min-h-8 max-h-[260px] resize-none overflow-y-auto rounded-md border border-default bg-default px-2.5 py-2 font-[inherit] text-[12.5px] leading-normal text-highlighted shadow-sm outline-none transition placeholder:text-muted hover:border-default focus:border-primary focus:ring-2 focus:ring-primary/20"
          @input="autoResize"
          @focus="onStringFocus"
          @blur="onStringBlur"
        />
      </template>

      <!-- остальные листовые -->
      <div v-else class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-2.5 rounded-md py-0.5 transition hover:bg-muted/40">
        <span class="flex min-w-0 items-center gap-1.5 pl-0.5">
          <UIcon :name="typeIcon" class="size-3.5 shrink-0 text-muted" />
          <span class="truncate text-[12px] font-medium text-highlighted" :title="model.key">
            {{ model.label }}
          </span>

        <UButton
          v-if="mode==='admin'"
          :icon="publicIcon"
          size="xs"
          color="neutral"
          variant="ghost"
          square
          class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
          :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
        />
        </span>

        <div class="min-w-0">
          <USelect
            v-if="model.type === 'select'"
            v-model="model.default"
            :items="model.allowed"
            size="xs"
            class="w-full min-w-0 [&_button]:py-0.5 [&_button]:text-[12.5px]"
          />
          <ColorPicker
            v-else-if="model.type === 'color'"
            v-model="model.default"
            :items="model.allowed ?? []"
            :columns="6"
            class="min-w-0"
          />
          <UInputNumber
            v-else-if="model.type === 'int'"
            v-model="model.default"
            size="xs"
            class="min-w-0"
          />
          <USwitch
            v-else-if="model.type === 'bool'"
            v-model="model.default"
            size="xs"
            class="min-w-0"
          />
        </div>
      </div>
    </template>
  </div>
</template>
