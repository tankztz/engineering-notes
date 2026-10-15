<script setup>
import { computed, ref } from 'vue'
const props = defineProps({ fixed: Boolean })
const focused = ref(false)
const size = computed(() => props.fixed ? 16 : 14)
const scale = computed(() => focused.value ? Math.max(1, 16 / size.value) : 1)
</script>

<template>
  <p class="demo-rule">{{ fixed ? 'Give editable text a 16px size before focus and preserve pinch zoom.' : 'Let the field inherit a compact 14px font.' }}</p>
  <div class="demo-phone" aria-label="Illustrated phone viewport">
    <div class="demo-phone-page" :style="{ transform: `scale(${scale})` }">
      <strong>Join a workspace</strong><p>Invitation code</p>
      <div class="demo-fake-input" :class="{ focused }" :style="{ fontSize: size + 'px' }">EXAMPLE-123</div>
      <p>Surrounding page content</p>
    </div>
  </div>
  <div class="demo-actions"><button type="button" @click="focused = true">Focus sample field</button><button type="button" @click="focused = false">Reset focus</button></div>
  <p role="status" data-demo-status>Field: {{ size }}px · Illustrated scale: {{ scale.toFixed(2) }}×</p>
  <p class="demo-caption">This is a contained illustration of the 16 ÷ font-size calculation, not native iOS behavior. Browser settings and scale limits affect the result. Verify on a physical iPhone; desktop emulation cannot establish the outcome.</p>
</template>
