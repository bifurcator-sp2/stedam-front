<script setup lang="ts">
import { computed } from 'vue'
import BlocksSettingField from '~/components/Constructor/BlocksSettingField.vue'

const id = defineModel<number | null>('id')
const title = defineModel<string | null>('title')
const description = defineModel<string | null>('description')
const settings = defineModel<SettingNode[]>('settings', { default: () => [] })

/** id блока — прокидываем в FileContainer */
const blockId = computed(() => id.value ?? null)

/** имя модели — прокидываем. */
const modelName = 'blocks'

function updateItem(index: number, updated: SettingNode) {
  const next = settings.value.slice()
  next[index] = updated
  settings.value = next
}
</script>

<template>
  <div class="properties">
    <!-- Шапка с ID -->
    <div class="meta">
      <span class="meta__label">Блок</span>
      <span class="meta__value">
        <UIcon name="i-lucide-hash" class="meta__hash" />
        {{ id ?? '—' }}
      </span>
    </div>

    <!-- Основные поля -->
    <section class="section">
      <header class="section__head">
        <UIcon name="i-lucide-info" class="section__icon" />
        <span class="section__title">Основное</span>
      </header>

      <div class="field">
        <label class="field__label" for="block-name">Название</label>
        <UInput
          id="block-name"
          v-model="title"
          size="xs"
          placeholder="Введите название"
          class="w-full"
        />
      </div>

      <div class="field">
        <label class="field__label" for="block-description">Описание</label>
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

    <!-- Настройки -->
    <section class="section">
      <header class="section__head">
        <UIcon name="i-lucide-sliders-horizontal" class="section__icon" />
        <span class="section__title">Настройки</span>
        <span v-if="settings?.length" class="section__count">{{ settings.length }}</span>
      </header>

      <div v-if="settings?.length" class="settings-list">
        <BlocksSettingField
          v-for="(item, index) in settings"
          :key="item.key"
          :model-value="item"
          :block-id="blockId"
          :model-name="modelName"
          @update:model-value="updateItem(index, $event)"
        />
      </div>

      <div v-else class="empty">
        <div class="empty__icon-wrap">
          <UIcon name="i-lucide-sliders-horizontal" class="empty__icon" />
        </div>
        <span class="empty__title">Нет настроек</span>
        <span class="empty__hint">Добавьте поля, чтобы управлять блоком</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.properties {
  --panel-pad: 14px;
  --panel-gap: 18px;
  --radius-card: 10px;
  --radius-pill: 999px;

  display: flex;
  flex-direction: column;
  gap: var(--panel-gap);
  padding: var(--panel-pad) var(--panel-pad) 24px;
}

/* ============================================================
   Мета-чип с ID
   ============================================================ */

.meta {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border-radius: var(--radius-card);
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.015) 60%),
    var(--ui-bg-elevated, #f8fafc);
  border: 1px solid var(--ui-border, #e5e7eb);
  overflow: hidden;
}

.meta::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #60a5fa, #3b82f6);
  border-radius: 0 3px 3px 0;
}

.meta__label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ui-text-muted, #64748b);
}

.meta__value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px 3px 7px;
  border-radius: var(--radius-pill);
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ui-text, #0f172a);
}

.meta__hash {
  width: 11px;
  height: 11px;
  color: var(--ui-primary, #3b82f6);
  opacity: 0.85;
}

/* ============================================================
   Секции
   ============================================================ */

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section__head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 2px 8px 10px;
}

.section__head::before {
  content: '';
  position: absolute;
  left: 0;
  top: 1px;
  bottom: 9px;
  width: 2px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--ui-primary, #3b82f6), rgba(59, 130, 246, 0.15));
}

.section__head::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, var(--ui-border, #eef2f7), transparent 85%);
}

.section__icon {
  width: 13px;
  height: 13px;
  color: var(--ui-text-muted, #94a3b8);
}

.section__title {
  flex: 1 1 auto;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ui-text-muted, #64748b);
}

.section__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 18px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.16), rgba(59, 130, 246, 0.1));
  color: var(--ui-primary, #2563eb);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1;
  border: 1px solid rgba(59, 130, 246, 0.18);
}

/* ============================================================
   Поля
   ============================================================ */

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted, #64748b);
  padding-left: 2px;
  letter-spacing: 0.01em;
}

/* ============================================================
   Список настроек
   ============================================================ */

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ============================================================
   Пустое состояние
   ============================================================ */

.empty {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 14px 26px;
  text-align: center;
  border: 1px dashed var(--ui-border, #e2e8f0);
  border-radius: var(--radius-card);
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(59, 130, 246, 0.05), transparent 60%),
    var(--ui-bg-elevated, #f8fafc);
  overflow: hidden;
}

.empty__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.8) inset,
    0 6px 14px rgba(15, 23, 42, 0.06);
  margin-bottom: 4px;
}

.empty__icon {
  width: 20px;
  height: 20px;
  color: var(--ui-primary, #3b82f6);
  opacity: 0.75;
}

.empty__title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ui-text, #334155);
}

.empty__hint {
  font-size: 11px;
  color: var(--ui-text-muted, #94a3b8);
  max-width: 220px;
  line-height: 1.45;
}
</style>
