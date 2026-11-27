// app/components/Constructor/BlockSettingTypes/useSettingAccordion.ts
// Свёрнутость групп в панели настроек: состояние живёт в localStorage.

import { computed, ref, type Ref } from 'vue'

const STORAGE_KEY = 'constructor_collapsed_nodes'

function loadCollapsed(): Set<string> {
  if (import.meta.server) return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveCollapsed(paths: Set<string>) {
  if (import.meta.server) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(paths)))
  } catch (e) {
    console.warn('Failed to save collapsed nodes', e)
  }
}

export function useSettingAccordion(currentPath: Ref<string>) {
  const collapsedPaths = ref<Set<string>>(loadCollapsed())

  const isExpanded = computed(() => !collapsedPaths.value.has(currentPath.value))

  function toggleExpanded() {
    const next = new Set(collapsedPaths.value)
    if (next.has(currentPath.value)) next.delete(currentPath.value)
    else next.add(currentPath.value)
    collapsedPaths.value = next
    saveCollapsed(next)
  }

  function getChildPath(key: string) {
    return currentPath.value ? `${currentPath.value}.${key}` : key
  }

  return { isExpanded, toggleExpanded, getChildPath }
}
