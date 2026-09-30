<script setup lang="ts">

import UserDataForm from "../components/forms/UserDataForm.vue";
definePageMeta({
  layout: 'default',
})

const title = "Stedam";
const description = "Stedam"

useSeoMeta({
  titleTemplate: '',
  title,
  ogTitle: title,
  description,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/saas-light.png'
})

import type { NavigationMenuItem } from '@nuxt/ui'

const rolesIcons = {
  'student': 'i-lucide-graduation-cap',
  'teacher': 'i-lucide-presentation',
  'parent': 'i-lucide-users',
  'methodologist': 'i-lucide-book-open',
}

// Список name ролей, которые хотим показать на этой странице
const roleNames = ['student', 'teacher', 'parent', 'methodologist']

// Загружаем роли через наш composable (SSR + реактивность)
const { useRoles } = useRolesApi()
const { data: roles, pending, error } = await useRoles()

// Локальный стейт выбранных ролей
const selected = ref<Record<string, boolean>>({})

</script>


<template>
  <UContainer>
    <div class="h-screen flex items-center justify-center px-4">
      <div class="flex flex-col items-center gap-4">
        <UserDataForm />
      </div>
    </div>
  </UContainer>
</template>
