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
  params?: Record<string, any>
}

const props = withDefaults(
  defineProps<{
    blockId?: number | null
    modelName?: string | null
    mode?: 'admin' | 'public'
    settings?: Record<string, any> | SettingItem[] | null
    maxImages?: number | null
  }>(),
  {
    mode: 'admin',
    settings: null,
    maxImages: undefined,
  },
)

const model = defineModel<SettingItem>({ required: true })
const { sanitizeHtml } = useSanitize()

// ============================================================
// Внешний вид
// ============================================================

const iconMode = ref<'manual' | 'picker'>('manual')

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

const publicIcon = computed(() =>
  model.value.public ? 'i-lucide-eye' : 'i-lucide-eye-off',
)

// ============================================================
// Резолв пути
// ============================================================

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

// ============================================================
// string
// ============================================================

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const stringDraft = ref<string>('')
const isEditing = ref(false)

const modelString = computed<string>(() => {
  const v = model.value.default
  return typeof v === 'string' ? v : ''
})

const stringModel = computed<string>({
  get() { return isEditing.value ? stringDraft.value : modelString.value },
  set(raw: string) { stringDraft.value = raw },
})

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

function onStringBlur() { commitString() }

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
// image
// ============================================================

function emptyFiles(): FilesListResponse {
  return {
    images: [], files: [], temp: { images: [], files: [] }, stored: { images: [], files: [] },
  }
}

const imageFiles = ref<FilesListResponse>(emptyFiles())
const fileContainerRef = ref<InstanceType<typeof FileContainer> | null>(null)

const imagePurpose = computed<string | null>(() => {
  const fromParams = model.value.params?.purpose
  if (typeof fromParams === 'string' && fromParams) return fromParams
  if (typeof model.value.purpose === 'string' && model.value.purpose) return model.value.purpose
  const first = model.value.allowed?.[0]
  return typeof first === 'string' && first ? first : null
})

const resolvedCount = computed<number | null>(() => {
  const raw = model.value.params?.count
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const val = resolvePath(props.settings, raw)
    const num = Number(val)
    return Number.isFinite(num) ? num : null
  }
  return null
})

const resolvedDisplayImages = computed<boolean>(() => {
  const raw = model.value.params?.['display-images']
  if (raw == null) return true
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') {
    const val = resolvePath(props.settings, raw)
    if (val == null) return true
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase()
      return !(s === '' || s === 'false' || s === '0' || s === 'no')
    }
    return Boolean(val)
  }
  return Boolean(raw)
})

const displayImages = computed(() => resolvedDisplayImages.value)

const maxImages = computed<number>(() => {
  if (model.value.params?.count != null) {
    const n = resolvedCount.value
    if (n == null) return -1
    return n < 0 ? -1 : n
  }
  if (props.maxImages != null) {
    return props.maxImages < 0 ? -1 : props.maxImages
  }
  return -1
})

const resolvedModelName = computed<string>(() => props.modelName || 'blocks')

const formattedInitialFiles = computed<FilesListResponse | null>(() => {
  let val = model.value.default

  // Защита на случай, если из БД придет объект со свойством default
  if (val && typeof val === 'object' && !Array.isArray(val) && Array.isArray((val as any).default)) {
    val = (val as any).default
  }

  if (!Array.isArray(val)) return emptyFiles()

  const raw = toRaw(val)
  const images = raw.map((i: any) => ({ ...toRaw(i) }))

  return {
    images, files: [], temp: { images: [], files: [] }, stored: { images, files: [] },
  }
})

watch(
  () => imageFiles.value.images,
  (images) => {
    let current = model.value.default

    // Защита для сравнения
    if (current && typeof current === 'object' && !Array.isArray(current) && Array.isArray((current as any).default)) {
      current = (current as any).default
    }

    const same =
      Array.isArray(current) &&
      current.length === images.length &&
      current.every((x: any, i: number) => x?.url === images[i]?.url)

    if (same) return

    // Сохраняем массив напрямую в default
    if (model.value.default && typeof model.value.default === 'object' && !Array.isArray(model.value.default)) {
      model.value = { ...model.value, default: { ...(model.value.default as any), default: images } }
    } else {
      model.value = { ...model.value, default: images }
    }
  },
  { deep: true },
)

function onRemove(item: ImageItem) { fileContainerRef.value?.removeFile(item) }
function onRestore(item: ImageItem) { fileContainerRef.value?.restoreFile(item) }

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
    :class="model.children?.length && model.type !== 'image'
      ? 'relative gap-2 overflow-hidden rounded-[10px] border border-default bg-elevated px-3 pb-3 pl-3.5 pt-2.5 shadow-sm'
      : ''"
  >
    <!-- ============ ICON ============ -->
    <template v-if="model.type === 'icon'">
      <div class="grid grid-cols-[60px_minmax(0,1fr)] items-start gap-3">
        <div
          class="relative flex size-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default bg-default p-2.5 shadow-sm transition"
          :class="!model.default ? 'border-dashed bg-elevated shadow-none' : ''"
        >
          <UIcon v-if="model.default" :name="model.default" class="size-full text-highlighted" />
          <UIcon v-else name="i-lucide-image-off" class="size-5 text-muted" />
        </div>

        <div class="flex min-w-0 flex-col gap-1.5">
          <div class="flex min-w-0 items-center justify-between gap-2">
            <span class="truncate text-[11.5px] font-semibold text-highlighted">
              {{ model.label }}
            </span>
            <span class="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary">
              {{ iconMode === 'manual' ? 'вручную' : 'из набора' }}
            </span>

            <UButton
              v-if="mode==='admin'" :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
              class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
              :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
            />
          </div>

          <div v-if="iconMode === 'manual'" class="flex min-w-0 items-center gap-1.5">
            <UInput v-model="model.default" size="xs" placeholder="i-lucide-hop" class="min-w-0 flex-1" />
            <UButton icon="i-lucide-grid-2x2" size="xs" color="neutral" variant="soft" square title="Выбрать из библиотеки" @click="iconMode = 'picker'" />
          </div>

          <div v-else class="flex min-w-0 items-center gap-1.5">
            <Vue3IconPicker v-model="model.default" placeholder="Поиск иконки..." icon-library="lucide" class="min-w-0 flex-1" />
            <UButton icon="i-lucide-keyboard" size="xs" color="neutral" variant="soft" square title="Ввести вручную" @click="iconMode = 'manual'" />
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
            <span v-if="imagePurpose" class="rounded-full border border-default bg-default px-1.5 py-0.5 font-mono text-[9.5px] text-muted shadow-sm">
              {{ imagePurpose }}
            </span>
            <span v-if="maxImages >= 0" class="rounded-full border border-default bg-default px-1.5 py-0.5 font-mono text-[9.5px] text-muted shadow-sm">
              max {{ maxImages }}
            </span>

            <UButton
              v-if="mode==='admin'" :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
              class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
              :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
            />
          </div>
        </div>

        <FileContainer
          ref="fileContainerRef" v-if="imagePurpose"
          :model-name="resolvedModelName" :model-id="blockId ?? 0" :purpose="imagePurpose"
          :max-images="maxImages" :initial-files="formattedInitialFiles"
          file-type="image" v-model:files="imageFiles"
        />

        <div v-else class="flex items-center gap-1.5 rounded-md border border-dashed border-default bg-elevated px-3 py-2.5 text-[11.5px] text-muted">
          <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
          <span>Не задан purpose для изображения</span>
        </div>

        <div v-if="imageFiles.images.length && displayImages" class="flex flex-wrap items-start gap-2">
          <ImageWrapper
            v-for="(img, idx) in imageFiles.images" :key="img.url ?? idx"
            :item="img" :siblings="imageFiles.images" :allow-drag-and-drop="false" :show-to-delete="true"
            @remove="onRemove($event)" @restore="onRestore($event)"
          >
            <img :src="img.url" class="size-[68px] rounded-md border border-default bg-muted object-cover shadow-sm transition hover:-translate-y-0.5 hover:scale-[1.02] hover:border-primary/40 hover:shadow-md" />
          </ImageWrapper>
        </div>
      </div>

      <!-- СТИЛИ ГАЛЕРЕИ (только в админке) -->
      <div v-if="mode === 'admin' && model.children?.length" class="mt-0.5 flex flex-col gap-1.5 rounded-lg border border-default bg-elevated p-2.5">
        <div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
          <UIcon name="i-lucide-sliders-horizontal" class="size-3" />
          <span>Стили галереи</span>
        </div>

        <BlocksSettingField
          v-for="(child, index) in model.children" :key="child.key" :model-value="child"
          :block-id="blockId" :model-name="modelName" :mode="mode" :settings="settings"
          @update:model-value="updateChild(index, $event)"
        />
      </div>
    </template>

    <!-- ============ ГРУППА ============ -->
    <template v-else-if="model.children?.length">
      <span class="pointer-events-none absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r-sm bg-gradient-to-b from-primary/55 to-primary/5" />

      <div class="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-widest text-highlighted">
        <span class="inline-flex size-3.5 items-center justify-center text-muted transition-transform duration-200">
          <UIcon name="i-lucide-chevron-right" class="size-3.5" />
        </span>
        <UIcon name="i-lucide-folder-tree" class="size-3.5 text-primary/85" />
        <span class="flex-1 truncate">{{ model.label }}</span>
        <span class="rounded-full border border-default bg-default px-1.5 py-0.5 font-mono text-[9.5px] font-medium normal-case tracking-normal text-muted shadow-sm">
          {{ model.key }}
        </span>

        <UButton
          v-if="mode==='admin'" :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
          class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
          :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <BlocksSettingField
          v-for="(child, index) in model.children" :key="child.key" :model-value="child"
          :block-id="blockId" :model-name="modelName" :mode="mode" :settings="settings" :max-images="props.maxImages"
          @update:model-value="updateChild(index, $event)"
        />
      </div>
    </template>

    <!-- ============ ЛИСТОВЫЕ ============ -->
    <template v-else>
      <template v-if="model.type === 'string'">
        <div class="flex min-w-0 items-center gap-1.5 pl-px">
          <UIcon :name="typeIcon" class="size-3 shrink-0 text-muted" />
          <span class="truncate text-[11.5px] font-semibold text-highlighted">{{ model.label }}</span>
          <span class="rounded-full border border-default bg-default px-1.5 py-px font-mono text-[9.5px] text-muted">{{ model.key }}</span>

          <UButton
            v-if="mode==='admin'" :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
            class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
            :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
          />
        </div>

        <textarea
          ref="textareaRef" v-model="stringModel" rows="1" spellcheck="false"
          class="w-full min-h-8 max-h-[260px] resize-none overflow-y-auto rounded-md border border-default bg-default px-2.5 py-2 font-[inherit] text-[12.5px] leading-normal text-highlighted shadow-sm outline-none transition placeholder:text-muted hover:border-default focus:border-primary focus:ring-2 focus:ring-primary/20"
          @input="autoResize" @focus="onStringFocus" @blur="onStringBlur"
        />
      </template>

      <div v-else class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-2.5 rounded-md py-0.5 transition hover:bg-muted/40">
        <span class="flex min-w-0 items-center gap-1.5 pl-0.5">
          <UIcon :name="typeIcon" class="size-3.5 shrink-0 text-muted" />
          <span class="truncate text-[12px] font-medium text-highlighted" :title="model.key">{{ model.label }}</span>

          <UButton
            v-if="mode==='admin'" :icon="publicIcon" size="xs" color="neutral" variant="ghost" square
            class="size-5 shrink-0 p-0 opacity-60 transition hover:opacity-100"
            :class="model.public ? '!bg-primary/15 !text-primary opacity-100' : ''"
          />
        </span>

        <div class="min-w-0">
          <USelect v-if="model.type === 'select'" v-model="model.default" :items="model.allowed" size="xs" class="w-full min-w-0 [&_button]:py-0.5 [&_button]:text-[12.5px]" />
          <ColorPicker v-else-if="model.type === 'color'" v-model="model.default" :items="model.allowed ?? []" :columns="6" class="min-w-0" />
          <UInputNumber v-else-if="model.type === 'int'" v-model="model.default" size="xs" class="min-w-0" />
          <USwitch v-else-if="model.type === 'bool'" v-model="model.default" size="xs" class="min-w-0" />
        </div>
      </div>
    </template>
  </div>
</template>
