<template>
  <div class="space-y-6">
    <!-- Headcount Chart -->
    <div v-if="headcount.totalHeadcount > 0" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Headcount by Role</h3>
      <HeadcountChart :headcount="headcount" :selectedRole="roleFilter" @select-role="roleFilter = $event" />
    </div>

    <!-- Team Members -->
    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Team Members
          <span class="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">{{ members.length }} member{{ members.length !== 1 ? 's' : '' }}</span>
        </h3>
      </div>
      <TeamMembersTable
        :members="members"
        :teamKey="teamKey"
        :roleFilter="roleFilter"
        @update:roleFilter="roleFilter = $event"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import HeadcountChart from './HeadcountChart.vue'
import TeamMembersTable from './TeamMembersTable.vue'
import { deriveHeadcountByRole } from '../utils/member-resolution'

const props = defineProps({
  members: { type: Array, default: () => [] },
  teamKey: { type: String, default: null }
})

const roleFilter = ref(null)

// Derived from the already-loaded members: deduplicated by canonical identity,
// missing roles bucketed as Unknown, and the total always equals unique team membership.
const headcount = computed(() => deriveHeadcountByRole(props.members))
</script>
