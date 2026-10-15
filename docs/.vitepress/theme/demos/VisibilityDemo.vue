<script setup>
import { computed, ref } from 'vue'
const props = defineProps({ fixed: Boolean })
const parentArchived = ref(false)
const childArchived = ref(false)
const active = computed(() => !parentArchived.value && !childArchived.value)
const linked = computed(() => !childArchived.value && (!props.fixed || !parentArchived.value))
</script>

<template>
  <p class="demo-rule">{{ fixed ? 'Both views use eligibility that includes ancestor state.' : 'The preview checks only the child’s own archive flag.' }}</p>
  <label class="demo-check"><input v-model="parentArchived" type="checkbox"> Archive the parent project</label>
  <label class="demo-check"><input v-model="childArchived" type="checkbox"> Archive the child directly</label>
  <div class="demo-comparison">
    <div><h3>Main view</h3><ul><li>Independent note</li><li v-if="active">Project / Child note</li></ul></div>
    <div><h3>Preview references</h3><ul><li>Independent note</li><li v-if="linked" data-child-reference>Project / Child note</li></ul></div>
  </div>
  <p role="status" data-demo-status>{{ active === linked ? 'The views agree.' : 'Mismatch: a hidden descendant reappears in the preview.' }}</p>
  <p class="demo-caption">Archive only the parent to expose the bug. Archiving the child directly works in both versions, so testing only that case misses it. Visibility rules do not replace authorization.</p>
</template>
