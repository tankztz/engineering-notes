import { createApp, defineComponent, h, markRaw, onMounted, onUnmounted } from 'vue'
import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import { bindNotesInteractions } from './interactions.js'
import LessonDemo from './demos/LessonDemo.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ router, siteData }) {
    if (import.meta.env.SSR) return
    const element = document.getElementById('notes-page')
    if (!element) return
    const page = JSON.parse(element.textContent)
    element.remove()
    siteData.value = {
      ...siteData.value,
      themeConfig: {
        ...siteData.value.themeConfig,
        logoLink: page.shared ? page.path : '/',
        nav: page.shared ? [] : [{ text: 'All lessons', link: '/' }, { text: 'For agents', link: '/agents' }, { text: 'Updates', link: '/status' }],
        sidebar: page.sidebar,
      },
    }
    let initial = true
    // Full document navigation rechecks login/share access and reads the latest D1 revision.
    router.onBeforeRouteChange = to => {
      if (initial) return
      window.location.assign(to)
      return false
    }
    router.onBeforePageLoad = () => {
      if (!initial) { window.location.reload(); return false }
      initial = false
      router.route.path = page.path
      router.route.data = {
        title: page.title,
        description: page.description,
        relativePath: (page.path === '/' ? '/index' : page.path).slice(1) + '.md',
        filePath: '', headers: [],
        frontmatter: { shared: page.shared, query: page.query, sidebar: !page.shared, aside: page.article, outline: page.article ? 2 : false, prev: false, next: false },
      }
      router.route.component = markRaw(defineComponent({
        setup() {
          let demo
          onMounted(() => {
            bindNotesInteractions()
            const target = document.querySelector('[data-lesson-demo]')
            if (target) {
              demo = createApp(LessonDemo, { kind: target.dataset.lessonDemo })
              demo.mount(target)
            }
            if (location.hash) requestAnimationFrame(() => {
              try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView() } catch { /* An invalid fragment has no target. */ }
            })
          })
          onUnmounted(() => demo?.unmount())
          return () => h('div', { class: 'notes-content', innerHTML: page.content })
        },
      }))
      return false
    }
  },
}
