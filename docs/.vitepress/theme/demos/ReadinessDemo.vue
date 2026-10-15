<script setup>
import { onUnmounted, ref } from 'vue'
const props = defineProps({ fixed: Boolean })
const phase = ref('idle')
const log = ref([])
const command = ref('')
const output = ref('')
const timers = []
function later(ms, action) { timers.push(setTimeout(action, ms)) }
function start() {
  phase.value = 'creating'
  log.value.push('0.0s · Start requested. Runtime revision changes from 1 to 2.')
  later(600, () => { phase.value = 'session'; log.value.push('0.6s · Session created.') })
  later(1000, () => { phase.value = 'connected'; log.value.push('1.0s · Connection open; terminal is not ready yet.') })
  later(1600, () => { phase.value = 'ready'; log.value.push('1.6s · Terminal ready. ' + (props.fixed ? 'Input enabled.' : 'Still waiting for workspace refresh.')) })
  later(3200, () => {
    phase.value = props.fixed ? 'ready' : 'stopped'
    log.value.push('3.2s · Old workspace snapshot (revision 1) arrives. ' + (props.fixed ? 'Rejected; the new session stays open.' : 'Applied; the new session is incorrectly marked stopped.'))
  })
}
onUnmounted(() => timers.forEach(clearTimeout))
</script>

<template>
  <p class="demo-rule">{{ fixed ? 'Show each milestone, enable input at readiness, and reject an older snapshot.' : 'Hide progress, wait for an unrelated refresh, and trust the stale snapshot.' }}</p>
  <button type="button" :disabled="phase !== 'idle'" @click="start">Open terminal</button>
  <p role="status" data-demo-status>{{ phase === 'idle' ? 'Ready to start.' : fixed ? ({ creating: 'Creating session…', session: 'Opening connection…', connected: 'Waiting for terminal readiness…', ready: 'Terminal ready · Input enabled' })[phase] : phase === 'stopped' ? 'Session stopped by stale data.' : 'No progress shown to the user…' }}</p>
  <form class="demo-terminal" @submit.prevent="output = 'Demo received: ' + command; command = ''">
    <label for="demo-command">Terminal input (simulation; no commands execute)</label>
    <input id="demo-command" v-model="command" :disabled="!fixed || phase !== 'ready'" placeholder="Try typing after readiness" autocomplete="off">
    <p v-if="output" role="status">{{ output }}</p>
  </form>
  <ol class="demo-log" aria-label="Event trace"><li v-for="entry in log" :key="entry">{{ entry }}</li></ol>
  <p class="demo-caption">Both versions use the same simulated delays. A connection opening is earlier than an interactive terminal.</p>
</template>
