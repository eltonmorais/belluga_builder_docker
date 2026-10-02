# Disposable local knowledge-status adapter

`v1/projects/builder/knowledge-status.json` is an atomically written snapshot of the local evaluator response. It is not canonical project data and is not served by the Builder preview.

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
