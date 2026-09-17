import { defineAsyncComponent } from 'vue'

export const routes = {
  'osac': defineAsyncComponent(() => import('./views/OsacBuildsView.vue')),
}
