<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PublicLayout from './layouts/PublicLayout.vue';
import StaffLayout from './layouts/StaffLayout.vue';

const route = useRoute();
const layout = computed(() => route.meta.layout === 'staff' ? StaffLayout : PublicLayout);
</script>

<template>
  <component :is="layout">
    <router-view />
  </component>
</template>
