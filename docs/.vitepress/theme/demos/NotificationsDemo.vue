<script setup>
import { ref } from 'vue'
const props = defineProps({ fixed: Boolean })
const time = ref(0)
const events = ref(0)
const alerts = ref(0)
const pending = ref(false)
const notified = ref(false)
const started = ref(0)
const log = ref([])
function record(text) { log.value = [...log.value.slice(-5), `${time.value}s · ${text}`] }
function request() {
  events.value++
  if (!pending.value) { pending.value = true; notified.value = false; started.value = time.value }
  if (!props.fixed) alerts.value++
  record(props.fixed ? 'Request event logged; notification held or deduplicated.' : 'Request event logged; immediate alert sent.')
}
function advance() {
  time.value++
  if (props.fixed && pending.value && !notified.value && time.value - started.value >= 5) {
    alerts.value++; notified.value = true; record('Still unresolved after 5s; one alert sent.')
  }
}
function resolve() { pending.value = false; record('Request resolved; pending notification canceled.') }
</script>

<template>
  <p class="demo-rule">{{ fixed ? 'Keep every event, wait briefly, and notify once per unresolved request.' : 'Notify immediately for every delivery of the same request.' }}</p>
  <div class="demo-actions"><button type="button" @click="request">{{ pending ? 'Repeat same request' : 'Send request' }}</button><button type="button" :disabled="!pending" @click="resolve">Resolve request</button><button type="button" @click="advance">Advance 1 second</button></div>
  <p role="status" data-demo-status>Clock: {{ time }}s · Events logged: {{ events }} · Alerts sent: {{ alerts }}</p>
  <p>{{ pending ? 'Request remains unresolved.' : 'No pending request.' }}</p>
  <ol class="demo-log" aria-label="Notification trace"><li v-for="(entry, i) in log" :key="i">{{ entry }}</li></ol>
  <p class="demo-caption">Send the same request three times, then resolve it before five seconds. Reset and leave it unresolved to see one delayed alert in the fix. Time advances only when you press the button; no real notifications are sent.</p>
</template>
