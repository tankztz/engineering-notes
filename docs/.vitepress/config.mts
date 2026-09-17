import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Engineering Notes',
  description: 'Reusable engineering lessons from real code.',
  lang: 'en-US',
  cleanUrls: true,
  appearance: true,
  router: { prefetchLinks: false },
  head: [['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }]],
  themeConfig: {
    logo: '/favicon.svg',
    outline: { level: 2, label: 'On this page' },
    docFooter: { prev: false, next: false },
    sidebarMenuLabel: 'Browse lessons',
    externalLinkIcon: true,
  },
})
