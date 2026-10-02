# Builder Project Knowledge preview

This is an anonymous, read-only preview of one reviewed Builder Foundation revision. It is **not** general Project access and provides no IAM, MCP, editing, or remote freshness attestation.

From the Builder Docker root:

```bash
docker build --target go-test -f builder-app/Dockerfile builder-app
docker build --target web-test -f builder-app/Dockerfile builder-app
docker build --target runtime -f builder-app/Dockerfile builder-app
docker compose -f compose.builder.yaml up --build -d
```

The `go-test` stage installs Git for its Git-backed integration test fixtures; Git is not included in the final runtime image.

The local preview is at `http://127.0.0.1:8088`. The Go API exposes only `/api/preview` and `/api/preview/documents/{approved-id}`. A trusted one-shot exporter reads the pinned Git commit from the dedicated Foundation checkout and writes only the approved eight-file bundle to a named volume. The public runtime mounts that volume read-only; it does not mount the Foundation checkout or `.git`. It rejects incomplete, extra, oversized, or digest-mismatched bundle content at startup. A changed checkout does not update the served revision.

For the shared tunnel, attach its connector to the external Docker network `builder-preview-ingress` while preserving its default network. In Cloudflare's tunnel hostname configuration, point **only** `builder.belluga.online` to `http://builder-preview:8080`. The tunnel connector token is not a route-management credential; adding the hostname requires Cloudflare dashboard/API access. Do not point a public route at the host-loopback port or expose `8088` on a non-loopback address.

After route creation, verify the anonymous Landing → Foundation → Genesis journey and negative paths through the hostname, then smoke the pre-existing tunnel hostnames. To stop only the Builder runtime, run `docker compose -f compose.builder.yaml down` from this root. This preserves the named bundle volume. A new Foundation revision requires a separate content review, approved catalog/digest update, and a deliberate replacement of the publication bundle; it is never automatic.
