---
name: create-prototype
description: Create or update a Builder Prototype candidate and validate its local structural inventory without claiming Design System conformance or publication.
---

# Create a Prototype

Use this skill only for a Builder Project Prototype candidate. A Prototype is a versioned, inspectable source artifact, not an executed or published application. Load this project-local skill by its explicit path; do not replace shared Delphi skill links.

## Establish the current inventory

From the Builder repository root, obtain a fresh result before making a decision:

```sh
local-api/artifact-status prototypes --mode working-tree
```

Use the JSON printed by this invocation, not a previously saved snapshot. Validate `schema_version`, `project_id`, `target`, `authority_scope`, `mode`, `revision`, `outcome`, `items`, `diagnostics`, and `design_system_validation`. The shared snapshot at `local-api/v1/projects/builder/artifact-status.json` is disposable last-writer-wins state and is not the current response.

Exit 0 means complete local structural validation only. Exit 2 means a valid `no_go` response; inspect every diagnostic and make a coherent candidate change. Exit 64 means usage error. Exit 70 means evaluator or adapter infrastructure failure. For 64 or 70, do not consume JSON or an old snapshot as fresh evidence. Re-run after changes.

If the catalog is absent, the actual Project remains unregistered. Do not create a real catalog or Prototype merely to make validation green. If a user asks for exploration before the authoring contract/provider is available, keep a clearly labeled concept draft outside `prototypes/`, such as `artifacts/drafts/prototypes/`, and do not call it a validated artifact.

## Create or update a candidate

Read the bound Foundation documents relevant to the request and inspect current catalog items first. Decide whether to create, update, or keep a concept alternative. Preserve existing stable IDs when names or roots change; never create duplicate IDs or infer a new ID from a folder name.

For an approved Prototype candidate, coordinate the `prototypes/catalog.json` record, its `root/prototype.json`, and all declared source/assets as one change. The catalog uses `schema_version:"1"`, bound `project_id`, and a `prototypes` array. Each record has stable `id`, display `name`, `description` string or null, and a direct-child `root` under `prototypes/`.

A creation request or provider `go` result does not grant mutation authority. Before changing managed artifacts, confirm that the artifact owner approved the governing TODO and the requested scope/permissions; otherwise keep a concept draft or defer and report.

Each `prototype.json` has `schema_version`, matching `id`, `entry_point`, nonnull `screens`, `sources`, `assets`, `links`, and `related` arrays, and `design_system_ref` explicitly set to null or `{id,content_digest}`. Each Screen has stable `id`, `name`, `path`, and `scope:null`; do not invent scope values. `entry_point`, Screen `path`, `sources`, and `assets` are safe relative file paths based at that Prototype's `root` (for example `index.html`), not Foundation-root-prefixed paths. Entry point and Screen paths must be declared sources. Sources/assets are unique, disjoint relative regular-file paths inside the Prototype root. Links refer only to existing Screens. Related references alone are Foundation-root-relative evidence links, not authorization or compatibility approval.

Keep drafts outside the managed `prototypes/` inventory. Do not execute HTML/JavaScript, fetch remote Git, publish assets, create HTTP/MCP routes, or automatically register generated content. Use only sources/assets intentionally admitted to the candidate. A malformed or unavailable contract is a reason to stop and report the blocker, not to fabricate an implementation.

## Distinguish evidence

After a coherent candidate edit, invoke the evaluator again and use that fresh stdout response. Structural `go` verifies the bounded file/catalog contract and content inventory only. This operation intentionally returns `design_system_validation:"not_evaluated"`; it does not resolve the reference. A null reference means no Design System version is bound. A nonnull reference is a version-binding claim only: it does not show that Prototype files use the system's tokens, components, or styles.

When evaluating a nonnull reference, separately invoke the actual Design System provider and use its fresh stdout. Validate the response envelope, selected source/owner, mode, revision, `outcome:"go"`, `design_system_validation:"valid"`, and exactly one item. Compare the Prototype manifest's `design_system_ref.id` to that item's stable `id`, and compare `content_digest` to the provider's full `inventory_digest` (never `definition_digest`). For a Project-owned committed system, run both operations against the same intended full Foundation SHA. Company and default sources use their own explicitly pinned full SHAs; working-tree outputs remain exploratory. A missing/no-go provider, null reference, identity/digest mismatch, or stale digest prevents the version-binding claim while a structurally valid Prototype may still return `go`. A matching ID and inventory digest identifies the Design System version only; it does not prove use of its CSS/components, visual quality, accessibility, behavior, QA, user approval, or publication.

Treat working-tree results as exploratory point-in-time checks, not filesystem transactions or publication attestations. For committed review, choose a full commit SHA and run:

```sh
local-api/artifact-status prototypes --mode committed --revision '<full-foundation-commit-sha>'
```

Never substitute a branch name or short SHA for the full revision. The local tool reads only the selected Foundation state and writes only its disposable snapshot under the Project root.

## Report

Summarize whether you created, updated, or deferred a candidate; name its stable ID and Foundation paths; report the mode/revision, outcome and inventory digest from the fresh response; and state which evidence remains unverified. On `no_go` or infrastructure failure, quote the actionable relative diagnostics and do not imply partial success. Do not record human review, approval, or publication on anyone's behalf.
