<template>
  <div>
    <div class="flex items-center gap-2 mb-1">
      <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Teams</label>
      <button
        v-if="teams.length > 1"
        @click="toggleAll"
        class="text-xs text-primary-600 hover:text-primary-800 dark:hover:text-primary-400"
      >
        {{ modelValue.length === teams.length ? 'Clear' : 'All' }}
      </button>
    </div>
    <div class="space-y-1 max-h-48 overflow-y-auto" role="group" aria-label="Team filter">
      <label
        v-for="team in teams"
        :key="team.key"
        class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
      >
        <input
          type="checkbox"
          :value="team.key"
          :checked="modelValue.includes(team.key)"
          @change="toggle(team.key)"
          class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        />
        <span class="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap truncate">{{ team.displayName }}</span>
        <span
          v-if="showCount"
          class="text-xs text-gray-400 dark:text-gray-500 ml-auto shrink-0"
        >{{ team.memberCount }}</span>
      </label>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  teams: { type: Array, required: true },
  modelValue: { type: Array, required: true },
  showCount: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

function toggle(key) {
  const current = [...props.modelValue]
  const idx = current.indexOf(key)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(key)
  }
  emit('update:modelValue', current)
}

function toggleAll() {
  if (props.modelValue.length === props.teams.length) {
    emit('update:modelValue', [])
  } else {
    emit('update:modelValue', props.teams.map(t => t.key))
  }
}
</script>
