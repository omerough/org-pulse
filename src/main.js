import { createApp } from 'vue'
import './style.css'
import App from './components/App.vue'
import { installChunkLoadRecovery } from './module-loader'

installChunkLoadRecovery()
createApp(App).mount('#app')
