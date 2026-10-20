<script setup>
import { ref, onMounted } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
const { frontmatter } = useData()
const ready = ref(false)
onMounted(() => { ready.value = true })
</script>

<template>
  <p v-if="!ready" class="notes-starting" role="status">Loading Engineering Notes…</p>
  <ClientOnly>
    <DefaultTheme.Layout>
      <template #nav-bar-content-before>
        <form v-if="!frontmatter.shared" class="header-search" action="/search" role="search">
          <label class="sr-only" for="header-query">Search engineering lessons</label>
          <input id="header-query" name="q" type="search" placeholder="Search notes…" :value="frontmatter.query" maxlength="240" required>
          <button type="submit">Search</button>
        </form>
        <span v-else class="shared-label">Shared {{ frontmatter.pattern ? 'pattern' : 'lesson' }} · Access to this page only</span>
      </template>
      <template #nav-bar-content-after>
        <form v-if="!frontmatter.shared" class="notes-signout" action="/auth/logout" method="post"><button type="submit">Sign out</button></form>
      </template>
      <template #nav-screen-content-after>
        <form v-if="!frontmatter.shared" class="notes-mobile-signout" action="/auth/logout" method="post"><button type="submit">Sign out</button></form>
      </template>
      <template #doc-after>
        <footer class="notes-footer">
          <span>Engineering Notes · Powered by <a href="https://vitepress.dev/">VitePress</a></span>
          <nav v-if="!frontmatter.shared" aria-label="Document formats"><a href="/llms.txt" target="_self">llms.txt</a><a href="/api/index.json" target="_self">JSON index</a><a href="/api/export" target="_self">Export</a><a href="https://github.com/tankztz/engineering-notes">Source code</a></nav>
        </footer>
      </template>
    </DefaultTheme.Layout>
  </ClientOnly>
</template>
