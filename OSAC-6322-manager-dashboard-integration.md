# OSAC-6322 — Manager Dashboard integration patch (APPLIED)

Owner session: **OSAC-6322 | App | Manager Dashboard**.

All business logic for project-qualified manager dashboards lives in owned files
(`modules/team-tracker/server/manager-purview.js`,
`modules/team-tracker/server/project-manager-dashboard.js`,
`modules/team-tracker/client/composables/useManagerDashboard.js`,
`modules/team-tracker/client/views/ManagerDashboardView.vue`).

The route wiring and the nav-visibility follow-up below have both been applied
on this branch (`modules/team-tracker/server/index.js`,
`shared/client/composables/usePermissions.js`, `src/components/AppSidebar.vue`).
This file is kept as a record of what changed and why. No change was needed in
`shared/client/services/api.js` (the composables build their own query strings).

## `modules/team-tracker/server/index.js`

`resolveProjectSelection` and `readProjectPeopleTeams` are already imported at the
top of the module (and `context.projects` is already used elsewhere), so only the
dashboard builder import and the route branch are new.

### 1. Add the builder require next to the existing one (near line 575)

```diff
   const { getManagerPurview } = require('./manager-purview');
+  const { buildProjectManagerDashboard } = require('./project-manager-dashboard');
```

### 2. Branch the route to the project path (route opens at line 589)

```diff
   router.get('/manager/dashboard', requireScope('roster:read'), function(req, res) {
+    // Project-qualified roster: compute purview from the published read model.
+    // OSAC and an unset projectId fall through to the legacy registry path.
+    const selection = resolveProjectSelection(context.projects, req.query);
+    if (selection.provided && selection.status) {
+      return res.status(selection.status).json({ error: selection.error });
+    }
+    if (selection.provided && selection.projectId !== 'osac') {
+      const result = readProjectPeopleTeams(context.projects, selection.projectId);
+      if (result.status !== 200 || !result.model) {
+        return res.status(result.status).json({ error: result.error });
+      }
+      const { status, body } = buildProjectManagerDashboard(result.model, {
+        email: req.userEmail,
+        includeIndirect: req.query?.includeIndirect === 'true',
+        isPrivileged: Boolean(req.isAdmin || req.isTeamAdmin)
+      });
+      return res.status(status).json(body);
+    }
+
     // Handle null userUid (e.g. local dev where email isn't in registry)
     if (!req.userUid) {
```

### 3. Document the new query params on the `@openapi` block (CI `validate:openapi`)

```diff
    *     summary: Get manager dashboard data (purview, reports, teams, field definitions)
+   *     parameters:
+   *       - in: query
+   *         name: projectId
+   *         schema: { type: string }
+   *         description: OSAC/unset returns the legacy registry dashboard; any other project returns its read-only project-qualified purview.
+   *       - in: query
+   *         name: includeIndirect
+   *         schema: { type: boolean }
+   *         description: Include transitive (indirect) reports.
    *     responses:
```

## Behavior guarantees

- OSAC and unset `projectId` are byte-for-byte unchanged (legacy path untouched).
- Project path is read-only; it never calls write stores. Field editing and team
  membership for projects depend on Admin/RBAC's project-scoped write model.
- Identity is resolved by `req.userEmail` against the published roster's `email`
  field (active people only) — never by display name.
- Unavailable/stale/partial publications return an honest `availability`/`reason`,
  not a zeroed dashboard.

## Nav visibility: `/permissions/me` and `usePermissions.js` (applied)

`GET /permissions/me` now takes the same `resolveProjectSelection`/
`readProjectPeopleTeams` branch as `/manager/dashboard`. For a non-OSAC project
it resolves the caller's `accountId` via `resolveProjectManagerAccountId` and
derives `isManager` from `getManagerPurview(...).directReportUids.length > 0`
against that project's read model — never from the OSAC registry. OSAC and an
unset `projectId` fall through to the original code path unchanged.

`usePermissions.js` mirrors `useRoster.js`'s pattern: it watches `useProjectId()`
(`flush: 'sync'`), resets `permissionData` to `null` immediately on switch, and
guards in-flight requests with a sequence counter so a slow stale-project
response can't overwrite a newer one. `isAdmin`/`isTeamAdmin`/`roles` are
untouched — they come from `useAuth()`'s global role assignment, which is not
project-scoped by design.

`AppSidebar.vue`'s `in-app-mode` gate (`props.teamDataSource !== 'in-app'`) now
also passes when `props.projectId` is a selected non-OSAC project, since
project rosters have no `teamDataSource` concept. `requireRole: "manager"`
needed no change: it already reads `props.isManager`, which is now
project-aware end to end.

Sidebar visibility is navigation convenience only; `/manager/dashboard` and
`/permissions/me` independently re-verify identity and manager status per
request, so a nav-visibility bug can never grant unauthorized data access.
