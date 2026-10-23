<script setup lang="ts">

const props = defineProps<{
  isIcons: string
  isExpanded: string
}>()

interface NavItem {
  label: string
  icon: string
  to: string
}



const navItems: NavItem[] = [
  { label: 'Профиль',            icon: 'i-lucide-circle-user',    to: '/profile' },
  { label: 'Конструктор блоков', icon: 'i-lucide-blocks',         to: '/construct' },
  { label: 'Я - преподаватель',  icon: 'i-lucide-presentation',   to: '/edu' },
  { label: 'Я - ученик',         icon: 'i-lucide-graduation-cap', to: '/learn' },
]

</script>
<template>
  <ul class="space-y-1 px-2">
    <li v-for="item in navItems" :key="item.to">
      <NuxtLink
        :to="item.to"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm
                     text-default hover:bg-elevated transition-colors"
        :class="isIcons ? 'justify-center' : ''"
        :title="isIcons ? item.label : undefined"
      >
        <UIcon :name="item.icon" class="w-5 h-5 shrink-0"/>
        <span v-if="isExpanded" class="truncate">{{ item.label }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>
