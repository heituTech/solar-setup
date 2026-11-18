<script setup>
// Layout 由 router 的父级组件提供
import { dbBusy } from './api/client';
</script>

<template>
  <router-view />
  <div v-if="dbBusy" class="db-busy-mask" aria-busy="true">
    <span class="db-busy-indicator" />
  </div>
</template>
