# OSAC-6322 — Manager Dashboard integration patch

Owner session: **OSAC-6322 | App | Manager Dashboard**.

All business logic for project-qualified manager dashboards lives in owned files
(`modules/team-tracker/server/manager-purview.js`,
`modules/team-tracker/server/project-manager-dashboard.js`,
`modules/team-tracker/client/composables/useManagerDashboard.js`,
`modules/team-tracker/client/views/ManagerDashboardView.vue`).

The only change required in an **integration-reserved** file is wiring the
existing `GET /manager/dashboard` route to the project path. Apply this after
PR #187 and ownership reconciliation. No change is needed in
`shared/client/services/api.js` (the composable builds the query string itself).

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
