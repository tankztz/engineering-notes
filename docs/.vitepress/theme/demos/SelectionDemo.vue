<script setup>
import { onUnmounted, ref } from 'vue'
const props = defineProps({ fixed: Boolean })
const selected = ref(true)
const transitions = ref(['Selected'])
let restore
function outside() {
  if (!selected.value) return
  if (props.fixed) { transitions.value = [...transitions.value.slice(-5), 'Outside click → Selection preserved']; return }
  selected.value = false
  transitions.value = [...transitions.value.slice(-5), 'Outside click → Selection cleared']
  restore = setTimeout(() => { selected.value = true; transitions.value.push('Effect runs → Selection restored') }, 650)
}
onUnmounted(() => clearTimeout(restore))
</script>

<template>
  <p class="demo-rule">{{ fixed ? 'The outside click leaves selection alone. One owner controls the panel.' : 'The click handler clears selection; a later effect restores it.' }}</p>
  <div class="demo-canvas">
    <button type="button" class="demo-outside" @click="outside">Click outside the panel</button>
    <div class="demo-panel-slot"><div v-if="selected" class="demo-selected-panel">Selected item<br><small>This panel should stay open.</small></div></div>
  </div>
  <p role="status" data-demo-status>{{ selected ? 'Panel open' : 'Panel closed until the effect restores it' }}</p>
  <ol class="demo-log" aria-label="Selection trace"><li v-for="(entry, i) in transitions" :key="i">{{ entry }}</li></ol>
  <p class="demo-caption">The final screen is identical. The trace exposes the unintended intermediate state. This example assumes outside clicks should preserve selection; dismissal is a different product decision.</p>
</template>
