<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const screen = ref('documents')
const revealed = ref(false)
const direction = ref('left')
const dragging = ref(false)
const angle = ref(0)
const code = ref('')
const error = ref('')
const hint = ref(0)
const liftEdge = ref(null)
const peeking = ref(false)
const reduceMotion = ref(false)
let gesture = null
let suppressClick = 0
let media
let observer
const updateMotion = () => { reduceMotion.value = media.matches }
onMounted(() => {
  media = matchMedia('(prefers-reduced-motion: reduce)')
  updateMotion()
  media.addEventListener('change', updateMotion)
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { peeking.value = true; observer.disconnect() }
  }, { threshold: .5 })
  if (liftEdge.value) observer.observe(liftEdge.value)
})
watch([screen, hint], async () => {
  peeking.value = false
  await nextTick()
  observer?.disconnect()
  if (liftEdge.value) observer?.observe(liftEdge.value)
})
onUnmounted(() => { media?.removeEventListener('change', updateMotion); observer?.disconnect() })
const pose = computed(() => dragging.value && !reduceMotion.value
  ? { transform: direction.value === 'up' ? `rotateX(${angle.value}deg)` : `rotateY(${-angle.value}deg)` }
  : {})

function reset() {
  gesture = null
  dragging.value = false
  angle.value = 0
  revealed.value = false
  code.value = ''
  error.value = ''
  hint.value++
}
function chooseScreen(value) { reset(); screen.value = value }
function unlock() {
  if (code.value.trim().toUpperCase() !== 'PAPER') { error.value = 'Use PAPER to try this sample.'; return }
  chooseScreen('documents')
}
function turn(show) {
  gesture = null
  dragging.value = false
  angle.value = 0
  revealed.value = show
}
function start(event) {
  if (!event.isPrimary) { turn(false); return }
  if (revealed.value || event.button !== 0) return
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: '', distance: 0 }
}
function move(event) {
  if (!gesture || gesture.id !== event.pointerId || gesture.axis === 'ignore') return
  const x = gesture.x - event.clientX, y = gesture.y - event.clientY
  if (!gesture.axis) {
    if (Math.max(Math.abs(x), Math.abs(y)) < 8) return
    gesture.axis = x > Math.abs(y) ? 'left' : y > Math.abs(x) ? 'up' : 'ignore'
    if (gesture.axis === 'ignore') return
    event.currentTarget.setPointerCapture(event.pointerId)
    direction.value = gesture.axis
    dragging.value = true
  }
  gesture.distance = Math.max(0, gesture.axis === 'left' ? x : y)
  angle.value = Math.min(45, gesture.distance / event.currentTarget.clientWidth * 90)
}
function finish(event, cancelled = false) {
  if (!gesture || gesture.id !== event.pointerId) return
  const { axis, distance } = gesture
  if (axis) suppressClick = performance.now() + 400
  const commit = !cancelled && axis !== 'ignore' && distance >= Math.min(80, event.currentTarget.clientWidth * .2)
  turn(commit)
}
function click(event) {
  if (performance.now() < suppressClick) { event.preventDefault(); event.stopPropagation() }
}
</script>

<template>
  <div class="paper-demo">
    <div class="paper-demo-controls">
      <div role="group" aria-label="Sample screen">
        <button type="button" :aria-pressed="screen === 'welcome'" @click="chooseScreen('welcome')">Welcome</button>
        <button type="button" :aria-pressed="screen === 'documents'" @click="chooseScreen('documents')">Documents</button>
      </div>
      <button type="button" class="paper-reset" @click="reset">Reset sample</button>
    </div>
    <div class="paper-stage">
      <div class="paper-brand">Alex Morgan <span>Sample portfolio</span></div>
      <div v-if="screen === 'welcome'" class="paper-welcome">
        <h3>Hi, I’m Alex.</h3>
        <p>Thank you for considering me for this opportunity.</p>
        <form @submit.prevent="unlock">
          <label for="sample-code">Access code</label>
          <input id="sample-code" v-model="code" placeholder="Enter your code" autocomplete="off" autocapitalize="none" spellcheck="false" required aria-describedby="sample-code-help sample-code-error">
          <p id="sample-code-help" class="paper-help">Sample code: <strong>PAPER</strong></p>
          <button type="submit" class="paper-primary">Continue</button>
          <p id="sample-code-error" class="paper-error" role="alert">{{ error }}</p>
        </form>
      </div>
      <div v-else class="paper-documents">
        <div class="paper-document-tabs" role="group" aria-label="Sample document">
          <button type="button" :aria-pressed="!revealed" @click="turn(false)">Cover letter</button>
          <button type="button" :aria-pressed="revealed" @click="turn(true)">Résumé</button>
        </div>
        <div class="paper-stack" :class="{ 'is-revealed': revealed }">
          <article class="paper-sheet paper-resume" :inert="!revealed" aria-label="Sample résumé">
            <h3>Alex Morgan</h3>
            <p class="paper-subtitle">Product engineer</p>
            <h4>Experience</h4>
            <p>Builds clear, thoughtful interfaces that make everyday work easier.</p>
            <h4>Approach</h4>
            <ul><li>Start with the task.</li><li>Make interactions feel natural.</li><li>Keep the details consistent.</li></ul>
            <p class="paper-footnote">Fictional profile for this interactive sample.</p>
          </article>
          <article class="paper-sheet paper-cover" :class="{ 'turn-up': direction === 'up', 'is-dragging': dragging }" :style="pose" :inert="revealed" aria-label="Sample cover letter"
            @pointerdown="start" @pointermove="move" @pointerup="finish($event)" @pointercancel="finish($event, true)" @lostpointercapture.self="finish($event, true)" @click.capture="click">
            <div class="paper-letter">
              <h3>Good work starts<br>with a conversation.</h3>
              <p>Hello,</p>
              <p>I enjoy turning complicated tasks into simple, useful experiences.</p>
              <p>This small portfolio brings that approach to life: a short introduction, followed by the details.</p>
              <p>Thank you for taking a look.</p>
              <p class="paper-signature">Alex</p>
            </div>
            <button ref="liftEdge" type="button" class="paper-lift" aria-label="Turn cover letter" @click="turn(true)">
              <span>Drag left, or lift from this edge</span><strong>View résumé</strong>
            </button>
            <span :key="hint" class="paper-fold" :class="{ 'is-peeking': peeking }" aria-hidden="true"></span>
          </article>
        </div>
        <p class="paper-sample-status" role="status">{{ revealed ? 'Résumé revealed. Choose Cover letter to try again.' : 'Try a swipe, mouse drag, or the View résumé button.' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paper-demo { color-scheme: light; color: #171717; font: 14px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow-wrap: normal; }
.paper-demo button { font: inherit; cursor: pointer; touch-action: manipulation; }
.paper-demo button:focus-visible, .paper-demo input:focus-visible { outline: 2px solid #555; outline-offset: 3px; }
.paper-demo-controls { display: flex; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid #ddd; border-bottom: 0; border-radius: 8px 8px 0 0; background: #fff; }
.paper-demo-controls > div, .paper-document-tabs { display: inline-flex; gap: 4px; }
.paper-demo-controls button, .paper-document-tabs button { padding: 7px 12px; border: 1px solid transparent; border-radius: 5px; font-size: 12px; min-height: 36px; }
.paper-demo-controls button:hover, .paper-document-tabs button:hover { background: #f5f5f5; }
.paper-demo-controls [aria-pressed=true], .paper-document-tabs [aria-pressed=true] { background: #f2f2f2; border-color: #ddd; font-weight: 600; }
.paper-demo-controls .paper-reset { color: #666; }
.paper-stage { background: #fafafa; border: 1px solid #ddd; border-radius: 0 0 8px 8px; padding: 24px 32px 12px; }
.paper-brand { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid #e5e5e5; font-weight: 600; }
.paper-brand span { font-size: 11px; color: #666; font-weight: 400; align-self: center; }
.paper-welcome { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; max-width: 350px; padding: 30px; margin: 64px auto 80px; }
.paper-welcome h3 { font-size: 26px; line-height: 1.25; letter-spacing: -.03em; margin: 0 0 12px; color: #171717; }
.paper-welcome p { color: #666; font-size: 13px; margin: 0 0 24px; line-height: 1.65; }
.paper-welcome label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.paper-welcome input { width: 100%; border: 1px solid #bbb; border-radius: 6px; padding: 10px 12px; font-size: 16px; color: #171717; background: #fff; caret-color: #171717; }
.paper-welcome input::placeholder { color: #737373; }
.paper-welcome .paper-help { font-size: 12px; margin: 8px 0 16px; }
.paper-welcome .paper-error { margin: 12px 0 0; color: #333; }
.paper-welcome .paper-error:empty { display: none; }
.paper-primary { width: 100%; padding: 10px 14px; border-radius: 6px; background: #171717; color: #fff; }
.paper-primary:hover { background: #333; }
.paper-documents { max-width: 450px; margin: 20px auto 0; }
.paper-document-tabs { margin-bottom: 18px; }
.paper-stack { display: grid; perspective: 1400px; overflow: clip; padding: 2px; }
.paper-sheet { grid-area: 1 / 1; min-width: 0; background: #fff; border: 1px solid #ddd; box-shadow: 0 4px 14px #00000008; }
.paper-resume { padding: 28px; }
.paper-resume h3 { margin: 0; color: #171717; font-size: 22px; }
.paper-resume h4 { margin: 28px 0 8px; color: #171717; font-size: 14px; }
.paper-resume p, .paper-resume ul { margin: 8px 0; font-size: 14px; line-height: 1.65; }
.paper-resume ul { padding-left: 20px; }
.paper-resume .paper-subtitle, .paper-resume .paper-footnote { color: #666; font-size: 12px; }
.paper-resume .paper-footnote { margin-top: 32px; }
.paper-cover { position: relative; z-index: 1; transform-origin: left center; backface-visibility: hidden; transition: transform 650ms cubic-bezier(.2,.7,.2,1), opacity 650ms ease, visibility 0s; cursor: grab; user-select: none; touch-action: pan-y pinch-zoom; }
.paper-cover.turn-up { transform-origin: center top; }
.paper-cover.is-dragging { transition: none; cursor: grabbing; }
.paper-letter { padding: 28px; }
.paper-letter h3 { color: #171717; font-size: 25px; line-height: 1.25; letter-spacing: -.03em; margin: 0 0 24px; }
.paper-letter p { font-size: 14px; line-height: 1.65; margin: 0 0 16px; }
.paper-letter .paper-signature { font-weight: 600; margin-bottom: 0; }
.paper-lift { display: flex; width: 100%; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; padding: 14px 50px 14px 20px; border-top: 1px solid #e5e5e5; background: #fafafa; touch-action: pinch-zoom !important; text-align: left; }
.paper-lift span { color: #666; font-size: 11px; }
.paper-lift strong { font-size: 12px; font-weight: 600; }
.paper-lift:hover { background: #f2f2f2; }
.paper-fold { position: absolute; right: 0; bottom: 0; width: 48px; height: 48px; pointer-events: none; transform-origin: right bottom; transform: scale(.16); filter: drop-shadow(-2px -2px 3px #00000020); }
.paper-fold.is-peeking { animation: paper-peek 2.4s ease-in-out 2; }
.paper-fold::before, .paper-fold::after { content: ''; position: absolute; inset: 0; }
.paper-fold::before { background: #fafafa; clip-path: polygon(100% 0, 100% 100%, 0 100%); }
.paper-fold::after { background: linear-gradient(135deg, #fff 20%, #eee 65%, #bcbcbc); clip-path: polygon(0 0, 100% 0, 0 100%); border-radius: 5px 0 0; }
.is-dragging .paper-fold { animation: none; transform: scale(1); }
.is-revealed .paper-cover { transform: rotateY(-110deg); opacity: 0; visibility: hidden; transition: transform 650ms cubic-bezier(.2,.7,.2,1), opacity 650ms ease, visibility 0s 650ms; }
.is-revealed .paper-cover.turn-up { transform: rotateX(110deg); }
.paper-sample-status { color: #666; font-size: 12px; line-height: 1.6; min-height: 38px; margin: 16px 0 0; }
@keyframes paper-peek { 0%, 100% { transform: scale(.16); } 40%, 55% { transform: scale(1); } }
@media (max-width: 600px) {
  .paper-stage { padding: 18px 12px 12px; }
  .paper-brand { font-size: 13px; }
  .paper-brand span { font-size: 10px; }
  .paper-demo-controls { gap: 4px; padding: 8px; }
  .paper-demo-controls button { padding: 7px 8px; font-size: 11px; }
  .paper-letter, .paper-resume { padding: 22px; }
  .paper-letter h3 { font-size: 23px; }
  .paper-welcome { margin: 40px auto 48px; padding: 22px; }
}
@media (prefers-reduced-motion: reduce) {
  .paper-cover, .paper-fold { transition: none !important; animation: none !important; }
  .paper-cover.is-dragging { transform: none !important; }
}
</style>
