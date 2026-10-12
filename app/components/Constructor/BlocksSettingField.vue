<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
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
  children?: SettingItem[]
}

const props = defineProps<{
  /** id блока — нужен для FileContainer */
  blockId?: number | null
  /** имя модели для FileContainer */
  modelName?: string | null
}>()

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
    // Во время ввода просто копим сырьё — санитайз отложим.
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
  // Синхронизируем черновик с тем, что реально ушло в модель.
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

// Пересчитываем высоту при любом изменении отображаемого значения
watch(stringModel, async () => {
  await nextTick()
  resizeTextarea()
})

// Если модель изменили снаружи, пока мы не редактируем — подтягиваем в черновик
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

/**
 * purpose для FileContainer:
 *  - из model.purpose (если задан),
 *  - иначе — первый allowed.
 */
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

/**
 * modelName для FileContainer.
 */
const resolvedModelName = computed<string>(() => {
  return props.modelName || 'blocks'
})

/**
 * imageFiles.images → model.default
 */
watch(
  () => imageFiles.value.images,
  (images) => {
    model.value = { ...model.value, default: images }
  },
  { deep: true },
)

/**
 * model.default → imageFiles.images (только при первом монтировании)
 */
watch(
  () => model.value.default,
  (val) => {
    if (Array.isArray(val) && val.length && !imageFiles.value.images.length) {
      imageFiles.value = {
        ...imageFiles.value,
        images: val,
      }
    }
  },
  { immediate: true },
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
  <div class="field" :class="{ 'field--group': model.children?.length }">
    <!-- ============ ГРУППА ============ -->
    <template v-if="model.children?.length">
      <div class="group-head">
        <span class="group-head__chev">
          <UIcon name="i-lucide-chevron-right" />
        </span>
        <UIcon name="i-lucide-folder-tree" class="group-head__icon" />
        <span class="group-head__title">{{ model.label }}</span>
        <span class="group-head__key">{{ model.key }}</span>
      </div>

      <div class="group-body">
        <BlocksSettingField
          v-for="(child, index) in model.children"
          :key="child.key"
          :model-value="child"
          :block-id="blockId"
          :model-name="modelName"
          @update:model-value="updateChild(index, $event)"
        />
      </div>
    </template>

    <!-- ============ ICON ============ -->
    <template v-else-if="model.type === 'icon'">
      <div class="icon-field">
        <div class="icon-field__preview" :class="{ 'is-empty': !model.default }">
          <UIcon
            v-if="model.default"
            :name="model.default"
            class="icon-field__svg"
          />
          <UIcon v-else name="i-lucide-image-off" class="icon-field__ph" />
        </div>

        <div class="icon-field__body">
          <div class="icon-field__row">
            <span class="icon-field__label">{{ model.label }}</span>
            <span class="icon-field__mode">{{ iconMode === 'manual' ? 'вручную' : 'из набора' }}</span>
          </div>

          <!-- Ручной ввод -->
          <div v-if="iconMode === 'manual'" class="icon-field__input">
            <UInput
              v-model="model.default"
              size="xs"
              placeholder="i-lucide-hop"
              class="field-control"
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

          <!-- Пикер -->
          <div v-else class="icon-field__input">
            <Vue3IconPicker
              v-model="model.default"
              placeholder="Поиск иконки..."
              icon-library="lucide"
              class="field-control"
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

          <!-- Подсказка (только в ручном режиме) -->
          <div v-if="iconMode === 'manual'" class="icon-hint">
            <div class="icon-hint__line">
              <span class="icon-hint__tag">синтаксис</span>
              <code>i-набор:имя</code>
              <span class="icon-hint__sep">·</span>
              <span class="icon-hint__tag">пример</span>
              <code>i-lucide-hop</code>
            </div>
            <div class="icon-hint__links">
              <a
                href="https://icones.js.org"
                target="_blank"
                rel="noopener noreferrer"
                class="icon-hint__link"
              >
                <UIcon name="i-lucide-external-link" />
                icones.js.org
              </a>
              <a
                href="https://lucide.dev/icons/"
                target="_blank"
                rel="noopener noreferrer"
                class="icon-hint__link"
              >
                <UIcon name="i-lucide-external-link" />
                lucide.dev
              </a>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ============ IMAGE ============ -->
    <template v-else-if="model.type === 'image'">
      <div class="image-field">
        <div class="image-field__head">
          <span class="image-field__label">
            <UIcon name="i-lucide-image" class="image-field__label-icon" />
            {{ model.label }}
          </span>
          <span v-if="imagePurpose" class="image-field__purpose">
            {{ imagePurpose }}
          </span>
        </div>

        <FileContainer
          ref="fileContainerRef"
          v-if="imagePurpose"
          :model-name="resolvedModelName"
          :model-id="blockId ?? 0"
          :purpose="imagePurpose"
          :max-images="maxImages"
          file-type="image"
          v-model:files="imageFiles"
        />

        <div v-else class="image-field__empty">
          <UIcon name="i-lucide-info" />
          <span>Не задан purpose для изображения</span>
        </div>

        <div v-if="imageFiles.images.length" class="image-grid">
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
            <img :src="img.url" class="image-grid__thumb" />
          </ImageWrapper>
        </div>
      </div>
    </template>

    <!-- ============ ЛИСТОВЫЕ ============ -->
    <template v-else>
      <!-- string -->
      <template v-if="model.type === 'string'">
        <div class="leaf-head">
          <UIcon :name="typeIcon" class="leaf-head__icon" />
          <span class="leaf-head__label">{{ model.label }}</span>
          <span class="leaf-head__key">{{ model.key }}</span>
        </div>

        <textarea
          ref="textareaRef"
          v-model="stringModel"
          class="string-input"
          rows="1"
          spellcheck="false"
          @input="autoResize"
          @focus="onStringFocus"
          @blur="onStringBlur"
        />


      </template>

      <!-- остальные листовые -->
      <div v-else class="leaf-row">
        <span class="leaf-row__label">
          <UIcon :name="typeIcon" class="leaf-row__icon" />
          <span class="leaf-row__text" :title="model.key">{{ model.label }}</span>
        </span>

        <div class="leaf-row__control">
          <USelect
            v-if="model.type === 'select'"
            v-model="model.default"
            :items="model.allowed"
            size="xs"
            class="field-control  w-full"
          />
          <ColorPicker
            v-else-if="model.type === 'color'"
            v-model="model.default"
            :items="model.allowed ?? []"
            :columns="6"
            class="field-control"
          />
          <UInputNumber
            v-else-if="model.type === 'int'"
            v-model="model.default"
            size="xs"
            class="field-control"
          />
          <USwitch
            v-else-if="model.type === 'bool'"
            v-model="model.default"
            size="xs"
            class="field-control"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ============================================================
   База
   ============================================================ */

.field {
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;

  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field--group {
  position: relative;
  gap: 8px;
  padding: 10px 12px 12px 14px;
  border-radius: var(--radius-lg);
  background: var(--ui-bg-elevated, #f8fafc);
  border: 1px solid var(--ui-border, #e5e7eb);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 1px 2px rgba(15, 23, 42, 0.03);
  overflow: hidden;
}

.field--group::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.55), rgba(59, 130, 246, 0.05));
}

.field--group .field--group {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 4px 0 4px 12px;
  border-left: 1px dashed var(--ui-border, #e2e8f0);
  border-radius: 0;
  overflow: visible;
}

.field--group .field--group::before {
  display: none;
}

/* ============================================================
   Группа
   ============================================================ */

.group-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ui-text, #0f172a);
}

.group-head__chev {
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: var(--ui-text-muted, #94a3b8);
  transition: transform 0.2s ease, color 0.2s ease;
}

.group-head__chev :deep(svg) {
  width: 14px;
  height: 14px;
}

.field--group:hover > .group-head .group-head__chev {
  transform: translateX(1px);
  color: var(--ui-primary, #3b82f6);
}

.group-head__icon {
  width: 13px;
  height: 13px;
  color: var(--ui-primary, #3b82f6);
  opacity: 0.85;
}

.group-head__title {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-head__key {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--ui-text-muted, #64748b);
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}

.group-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ============================================================
   Листовые: общий заголовок (string)
   ============================================================ */

.leaf-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 1px;
  min-width: 0;
}

.leaf-head__icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--ui-text-muted, #94a3b8);
}

.leaf-head__label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ui-text, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaf-head__key {
  margin-left: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  color: var(--ui-text-muted, #94a3b8);
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #eef2f7);
}

/* ============================================================
   Листовые: строка label | control
   ============================================================ */

.leaf-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
  align-items: center;
  gap: 10px;
  min-height: 30px;
  padding: 3px 0;
  border-radius: var(--radius-md);
  transition: background 0.15s ease;
}

.leaf-row:hover {
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.06), transparent 70%);
}

.leaf-row__label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 2px;
}

.leaf-row__icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--ui-text-muted, #94a3b8);
}

.leaf-row__text {
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text, #334155);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaf-row__control {
  min-width: 0;
}

/* Компактные контролы Nuxt UI */
.field-control {
  min-width: 0;
}

.field-control :deep(input),
.field-control :deep(button) {
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 12.5px;
}

/* ============================================================
   STRING
   ============================================================ */

.string-input {
  width: 100%;
  min-height: 32px;
  max-height: 260px;
  padding: 8px 11px;
  border: 1px solid var(--ui-border, #e2e8f0);
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, rgba(148, 163, 184, 0.03), transparent 8px),
    var(--ui-bg, #ffffff);
  color: var(--ui-text, #0f172a);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  resize: none;
  overflow-y: auto;
  outline: none;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02) inset;
  transition: border-color 0.15s ease, box-shadow 0.2s ease, background 0.15s ease;
}

.string-input::placeholder {
  color: var(--ui-text-muted, #94a3b8);
}

.string-input:hover {
  border-color: var(--ui-border-accented, #cbd5e1);
}

.string-input:focus {
  border-color: var(--ui-primary, #3b82f6);
  box-shadow:
    0 0 0 3px var(--ui-primary-muted, rgba(59, 130, 246, 0.15)),
    0 1px 0 rgba(15, 23, 42, 0.02) inset;
}

/* Превью безопасного HTML под textarea */
.string-preview {
  margin-top: 3px;
  padding: 9px 11px;
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, rgba(148, 163, 184, 0.04), transparent 12px),
    var(--ui-bg-elevated, #f8fafc);
  border: 1px solid var(--ui-border, #eef2f7);
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-text, #334155);
  overflow-wrap: anywhere;
}

.string-preview :deep(a) {
  color: var(--ui-primary, #3b82f6);
  text-decoration: underline;
  text-decoration-color: rgba(59, 130, 246, 0.4);
  text-underline-offset: 2px;
}

.string-preview :deep(a:hover) {
  text-decoration-color: var(--ui-primary, #3b82f6);
}

.string-preview :deep(p),
.string-preview :deep(ul),
.string-preview :deep(ol) {
  margin: 0 0 4px;
}

.string-preview :deep(p:last-child),
.string-preview :deep(ul:last-child),
.string-preview :deep(ol:last-child) {
  margin-bottom: 0;
}

.string-preview :deep(strong),
.string-preview :deep(b) {
  font-weight: 700;
}

.string-preview :deep(em),
.string-preview :deep(i) {
  font-style: italic;
}

/* ============================================================
   ICON
   ============================================================ */

.icon-field {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}

.icon-field__preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  padding: 9px;
  border-radius: 12px;
  background:
    radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.9), transparent 60%),
    linear-gradient(135deg, rgba(148, 163, 184, 0.08), rgba(148, 163, 184, 0.02)),
    var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e2e8f0);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 4px 10px rgba(15, 23, 42, 0.05);
  overflow: hidden;
  flex-shrink: 0;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.icon-field__preview:hover {
  border-color: var(--ui-primary, #3b82f6);
  box-shadow:
    0 0 0 3px var(--ui-primary-muted, rgba(59, 130, 246, 0.12)),
    0 6px 14px rgba(59, 130, 246, 0.12);
  transform: translateY(-1px);
}

.icon-field__preview.is-empty {
  border-style: dashed;
  background: var(--ui-bg-elevated, #f8fafc);
  box-shadow: none;
}

.icon-field__svg {
  width: 100%;
  height: 100%;
  color: var(--ui-text, #0f172a);
}

.icon-field__svg :deep(svg) {
  width: 100%;
  height: 100%;
}

.icon-field__ph {
  width: 22px;
  height: 22px;
  color: var(--ui-text-muted, #cbd5e1);
}

.icon-field__body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.icon-field__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.icon-field__label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ui-text, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-field__mode {
  flex-shrink: 0;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--ui-primary, #2563eb);
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.16), rgba(59, 130, 246, 0.08));
  border: 1px solid rgba(59, 130, 246, 0.18);
}

.icon-field__input {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.icon-field__input .field-control {
  flex: 1 1 auto;
  min-width: 0;
}

/* Хинт */
.icon-hint {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, rgba(148, 163, 184, 0.05), transparent 12px),
    var(--ui-bg-elevated, #f8fafc);
  border: 1px solid var(--ui-border, #eef2f7);
  font-size: 10.5px;
  color: var(--ui-text-muted, #64748b);
}

.icon-hint__line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.icon-hint__tag {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 8.5px;
  color: var(--ui-text-muted, #94a3b8);
}

.icon-hint__sep {
  color: var(--ui-border-accented, #cbd5e1);
}

.icon-hint code {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: var(--ui-text, #334155);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}

.icon-hint__links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.icon-hint__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  color: var(--ui-primary, #3b82f6);
  font-size: 10.5px;
  font-weight: 500;
  text-decoration: none;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.icon-hint__link:hover {
  background: var(--ui-primary-muted, rgba(59, 130, 246, 0.08));
  border-color: var(--ui-primary, #3b82f6);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.12);
}

.icon-hint__link :deep(svg) {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
}

/* ============================================================
   IMAGE
   ============================================================ */

.image-field {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.image-field__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
}

.image-field__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ui-text, #0f172a);
}

.image-field__label-icon {
  width: 13px;
  height: 13px;
  color: var(--ui-primary, #3b82f6);
  opacity: 0.85;
}

.image-field__purpose {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  color: var(--ui-text-muted, #64748b);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}

.image-field__empty {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 13px;
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, rgba(148, 163, 184, 0.05), transparent 12px),
    var(--ui-bg-elevated, #f8fafc);
  border: 1px dashed var(--ui-border, #e2e8f0);
  font-size: 11.5px;
  color: var(--ui-text-muted, #64748b);
}

.image-field__empty :deep(svg) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  align-items: flex-start;
}

.image-grid__thumb {
  width: 68px;
  height: 68px;
  object-fit: cover;
  border-radius: var(--radius-md);
  background: var(--ui-bg-muted, #f1f5f9);
  border: 1px solid var(--ui-border, #e2e8f0);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7) inset;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.image-grid__thumb:hover {
  transform: translateY(-2px) scale(1.02);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
}
</style>
