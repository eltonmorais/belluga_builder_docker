# Disposable local knowledge-status adapter

## Prototype artifact-status adapter

The independent `artifact-status` command evaluates the explicit Prototype catalog in the bound Foundation Git checkout. From the Builder repository root:

```sh
local-api/artifact-status prototypes --mode working-tree
local-api/artifact-status prototypes --mode committed --revision '<full-foundation-commit-sha>'
```

It prints a fresh response and atomically replaces the ignored `v1/projects/builder/artifact-status.json` snapshot below the selected Project root. Consumers use that invocation's stdout, never the shared snapshot as current evidence. Exit 0 is complete structural `go`; exit 2 is valid `no_go` JSON; exits 64 and 70 are usage/infrastructure errors and leave any previous snapshot stale. The runner builds and executes a temporary Go binary inside Docker under the caller's host UID/GID. It adds no route to the preview. This Prototype-only operation returns `design_system_validation: not_evaluated`; it does not execute or render sources, approve QA, validate a Design System, or publish assets.

`v1/projects/builder/knowledge-status.json` is an atomically written snapshot of the local evaluator response. It is not canonical project data and is not served by the Builder preview.

## Design System artifact-status adapter

The separate `design-system` target resolves one whole Design System from the trusted local `local-api/source-bindings.json` map; `source-bindings.example.json` shows its redacted shape. Selection is Project, Company, then default. A broken selected binding is a no-go and never falls through. Do not commit the private map or include credentials. The provisional Project source must use the exact `belluga_builder_foundation_documentation/` checkout.

```sh
local-api/artifact-status design-system --mode working-tree
local-api/artifact-status design-system --mode committed
```

Every non-null source binding names a repository ID, workspace-relative Git root, definition path, and revision. Working-tree requires null revisions; committed requires an explicit full SHA. No implicit HEAD, fetch, or key-level merge is supported. Missing map/all-null bindings return exit 2 with `source_binding_missing`. Use only fresh invocation stdout: `inventory_digest` covers all managed files while `definition_digest` covers only the raw definition. The operation does not expose local roots/maps, authenticate ownership, render, publish, or change the preview; Prototype remains separate and reports conformance as `not_evaluated`.

From the Builder repository root, generate a fresh result with:

```sh
local-api/knowledge-status status
```

The runner uses the Go 1.23 Alpine image through Docker, installs Git and `su-exec` inside the disposable container, and executes as the invoking host UID/GID. A host Go installation is not required. The container can write the fixed snapshot and local review marker with the same ownership as the caller. It does not add an HTTP route or expose the Foundation checkout through the preview.

Generate a committed-revision packet for human inspection with:

```sh
local-api/knowledge-status review-packet --target landing
local-api/knowledge-status review-packet --target roadmap
```

Only after a human approves that exact packet digest, record the review with the corresponding target, digest, reviewer label, and approval reference:

```sh
local-api/knowledge-status record-review --target landing --expected-packet-digest 'sha256:<approved-digest>' --reviewed-by 'reviewer' --review-reference 'approval-reference'
```

Consumers must use the response printed by a successful `status` invocation immediately before acting. Reading this saved JSON by itself does not establish current status. The response remains scoped to `local_review_only` and does not claim remote verification.

Remove this adapter after an authorized, project-bound remote API or MCP returns the equivalent versioned schema and the consumer has switched to that response. The evaluator and its tests remain independent of this directory.
