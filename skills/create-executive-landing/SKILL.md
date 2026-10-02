---
name: create-executive-landing
description: Create or review Builder's executive Landing for clear, evidence-linked decisions and current project state.
---

# Create an Executive Landing

Create a concise Landing for executives and other non-specialist readers. Explain why the project matters, the decisions that shape it, its current state, and the next meaningful direction. The Landing is a navigational summary; Foundation documents remain authoritative.

## Check local review status first

Run a fresh evaluator invocation immediately before using status. From the Builder repository root:

```sh
local-api/knowledge-status status
```

Use only the JSON printed by that successful invocation. The file under `local-api/v1/projects/builder/knowledge-status.json` is an atomic point-in-time snapshot, not live status. The response has `authority_scope: local_review_only`; it says nothing about remote verification, publication, authentication, or Builder's future Landing Freshness Attestation.

For `review_required`, or an unreviewed target, generate its committed-revision packet:

```sh
local-api/knowledge-status review-packet --target landing
```

Use `local-api/knowledge-status review-packet --target roadmap` for Roadmap review. Inspect the complete packet and the named output document at that revision. Cite its source paths and digests in your review. If the document remains accurate, say so explicitly; do not change prose just to clear a status. Recording a review is a human action: only after the human explicitly approves that exact `packet_digest`, run the corresponding command with that target, digest, reviewer label, and reference to the approval message. Replace the quoted placeholders with the approved values:

```sh
local-api/knowledge-status record-review --target landing --expected-packet-digest 'sha256:<approved-digest>' --reviewed-by 'reviewer-label' --review-reference 'approval-message-reference'
```

Never infer approval from a review reference, and never record status automatically.

## Build the Landing

- Read the current `project_mandate.md`, `domain_entities.md`, `project_constitution.md`, `system_roadmap.md`, and relevant Markdown under `policies/` and `modules/` in the dedicated Foundation checkout.
- State confirmed purpose, decisions, current stage, meaningful progress, and unresolved questions in plain language. Link each material statement to its canonical Foundation source.
- Distinguish established facts from plans and open questions. Do not invent metrics, dates, delivery claims, user evidence, approvals, or remote verification.
- Keep implementation details subordinate to their executive consequence. Preserve important caveats and decision boundaries rather than implying certainty that the sources do not support.
- If source evidence is missing, conflicting, or unverifiable, identify the gap and ask for clarification instead of filling it in.
- After a content change, run fresh status again and report the resulting state. A document change itself requires review.

## Adapter lifecycle

The local CLI and `local-api` JSON exist only to exercise this versioned consumer contract before Project Binding, database, authentication, and MCP exist. Remove the adapter after an authorized, project-bound remote API or MCP returns the equivalent versioned response and this skill consumes that response. Keep the local status explicitly separate from the public preview and remote freshness attestation.
