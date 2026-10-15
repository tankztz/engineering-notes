<script setup>
import { computed, ref } from 'vue'
const props = defineProps({ fixed: Boolean })
const pointer = ref(30)
const expanded = ref(false)
const frames = ref([])
const left = computed(() => expanded.value && !props.fixed ? 40 : 20)
const right = computed(() => expanded.value ? 90 : 60)
function step() {
  const inside = pointer.value >= left.value && pointer.value <= right.value
  expanded.value = inside
  frames.value = [...frames.value.slice(-5), `${inside ? 'Expanded' : 'Collapsed'} · Pointer at ${pointer.value}%`]
}
</script>

<template>
  <p class="demo-rule">{{ fixed ? 'Reserve the expanded geometry so the target still contains the pointer.' : 'Expansion shifts the hit area away from a stationary pointer.' }}</p>
  <label for="demo-pointer">Pointer position: {{ pointer }}%</label>
  <input id="demo-pointer" v-model.number="pointer" type="range" min="0" max="100">
  <div class="demo-hover-field" aria-hidden="true">
    <div class="demo-hover-card" :style="{ left: left + '%', width: (right - left) + '%' }">{{ expanded ? 'Expanded' : 'Compact' }}</div>
    <span class="demo-pointer" :style="{ left: pointer + '%' }">↑</span>
  </div>
  <button type="button" @click="step">Advance one frame</button>
  <p role="status" data-demo-status>{{ expanded ? 'Expanded' : 'Collapsed' }} · Hit area {{ left }}–{{ right }}%</p>
  <p class="demo-caption">Keep the pointer at 30% and advance several frames. The problem alternates; the fix stays expanded. Move to 95% to test a real exit. Frames advance manually so flicker stays comfortable to inspect.</p>
  <ol class="demo-log" aria-label="Frame trace"><li v-for="(frame, i) in frames" :key="i">{{ frame }}</li></ol>
</template>
