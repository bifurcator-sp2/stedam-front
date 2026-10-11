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
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px 14px 22px;
}

/* ============================================================
   Мета-чип с ID
   ============================================================ */

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.06), rgba(59, 130, 246, 0.02)),
    var(--ui-bg-elevated, #f8fafc);
  border: 1px solid var(--ui-border, #e5e7eb);
}

.meta__label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted, #64748b);
}

.meta__value {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px 2px 6px;
  border-radius: 999px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ui-text, #0f172a);
}

.meta__hash {
  width: 11px;
  height: 11px;
  color: var(--ui-primary, #3b82f6);
  opacity: 0.8;
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
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px 6px;
  border-bottom: 1px solid var(--ui-border, #eef2f7);
}

.section__icon {
  width: 13px;
  height: 13px;
  color: var(--ui-text-muted, #94a3b8);
}

.section__title {
  flex: 1 1 auto;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted, #64748b);
}

.section__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--ui-primary-muted, rgba(59, 130, 246, 0.12));
  color: var(--ui-primary, #3b82f6);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1;
}

/* ============================================================
   Поля
   ============================================================ */

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field__label {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ui-text-muted, #64748b);
  padding-left: 2px;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 26px 12px 24px;
  text-align: center;
  border: 1px dashed var(--ui-border, #e2e8f0);
  border-radius: 10px;
  background: var(--ui-bg-elevated, #f8fafc);
}

.empty__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  margin-bottom: 2px;
}

.empty__icon {
  width: 20px;
  height: 20px;
  color: var(--ui-text-muted, #94a3b8);
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
  line-height: 1.4;
}
</style>
