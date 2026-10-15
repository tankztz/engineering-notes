<script setup>
import { ref } from 'vue'
import ReadinessDemo from './ReadinessDemo.vue'
import HoverDemo from './HoverDemo.vue'
import SelectionDemo from './SelectionDemo.vue'
import OverflowDemo from './OverflowDemo.vue'
import VisibilityDemo from './VisibilityDemo.vue'
import NotificationsDemo from './NotificationsDemo.vue'
import ZoomDemo from './ZoomDemo.vue'
import './demos.css'

defineProps({ kind: String })
const examples = { readiness: ReadinessDemo, hover: HoverDemo, selection: SelectionDemo, overflow: OverflowDemo, visibility: VisibilityDemo, notifications: NotificationsDemo, zoom: ZoomDemo }
const fixed = ref(false)
const run = ref(0)
</script>

<template>
  <div class="demo-toolbar">
    <div role="group" aria-label="Example behavior" class="demo-modes">
      <button type="button" :aria-pressed="!fixed" @click="fixed = false">Problem</button>
      <button type="button" :aria-pressed="fixed" @click="fixed = true">Fix</button>
    </div>
    <button type="button" @click="run++">Reset example</button>
  </div>
  <div class="demo-stage" :data-mode="fixed ? 'fix' : 'problem'">
    <component :is="examples[kind]" :key="`${fixed}-${run}`" :fixed="fixed" />
  </div>
</template>
