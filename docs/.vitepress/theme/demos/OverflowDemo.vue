<script setup>
import { ref } from 'vue'
defineProps({ fixed: Boolean })
const viewport = ref(null)
const table = ref(null)
const pageScroll = ref(0)
const tableScroll = ref(0)
</script>

<template>
  <p class="demo-rule">{{ fixed ? 'Only the table scrolls. The heading and surrounding text stay in place.' : 'The wide table expands the sample page. Everything scrolls sideways together.' }}</p>
  <div ref="viewport" class="demo-viewport" tabindex="0" role="region" aria-label="Sample page viewport" @scroll="pageScroll = Math.round($event.target.scrollLeft)">
    <div class="demo-sample-page" :class="{ 'demo-page-wide': !fixed }">
      <strong>Sample document heading</strong>
      <p>Keep this paragraph in view.</p>
      <div ref="table" :class="{ 'demo-local-scroll': fixed }" :tabindex="fixed ? 0 : undefined" :role="fixed ? 'region' : undefined" :aria-label="fixed ? 'Sample table scroll area' : undefined" @scroll="tableScroll = Math.round($event.target.scrollLeft)">
        <table class="demo-wide-table"><thead><tr><th>Task</th><th>Owner</th><th>State</th><th>Last column</th></tr></thead><tbody><tr><td>Build preview</td><td>Sample team</td><td>Ready</td><td>Reachable content</td></tr></tbody></table>
      </div>
      <p>The rest of the document belongs inside its viewport.</p>
    </div>
  </div>
  <button type="button" @click="(fixed ? table : viewport).scrollLeft = 1000">Inspect last column</button>
  <p role="status" data-demo-status>Sample page scroll: {{ pageScroll }}px · Table scroll: {{ tableScroll }}px</p>
  <p class="demo-caption">Try the scrollbars, touch, or focus the region and press ArrowRight. The outer frame contains the broken example so it cannot break this article.</p>
</template>
