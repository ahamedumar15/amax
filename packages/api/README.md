# @amax/api

Public API, signed webhooks and rate limits (035). Owned by the platform team.

- **REST** (`handleRest`, mounted at `/api/v1`): every MCP tool as `POST /api/v1/tools/<name>`, and
  `GET /api/v1/openapi.json` (OpenAPI 3.1) generated from the same registry. Calls run through
  `registry.call`, so permissions, audit and trace match MCP and chat. A personal API token acts as
  its user. A service credential (002 principal) must name the person it acts for in the
  `amax-act-for` header; its scopes are per module (`delivery:read`, `delivery:write`,
  `hr:sensitive`; write includes read). Its writes are audited as the credential (`sp:<id>`, kind
  `service`) acting for that person, and the person's roles decide what it may do. Tools that take a
  typed secret, and privacy requests (chat-only), are not usable over the API.
- **Client credentials**: `POST /oauth/token` with `grant_type=client_credentials`,
  `client_id=<credential id>`, `client_secret=<key>` returns a one-hour access token.
- **Incoming webhooks** (`receiveWebhook`, for 008): verifies GitHub (`X-Hub-Signature-256`),
  Azure DevOps service hooks (Basic auth password plus `createdDate`), Microsoft Graph
  (`clientState`) and amax-signed calls against the tenant's 031 secrets (`github-webhook`,
  `azure-devops-webhook`, `msgraph-webhook`, `amax-webhook`; every valid version, so rotation has
  grace). Signed timestamps must be within `REPLAY_WINDOW_MS` (5 minutes); GitHub sends none. Dedupe is on a hash of the
  signed body, not the unsigned delivery-id header, so a replay with a fresh id is still a duplicate.
  Every rejection is recorded in `api.inbound`; a provider with no secret set up is recorded as
  `not_configured`, a setup problem, not a rejection.
- **Outgoing webhooks**: `subscribe_webhook` and friends (Admin, chat-confirmed). Each event an
  installed module emits fans out to a `api.webhook-deliver` workflow (029). Each module declares every field of each event it emits (`declarePayload`); a plain field is sent,
  a classified one is masked with its class, and an undeclared one is masked (fail closed), with name
  patterns as a net inside plain fields. Receivers must be public: the URL is checked when subscribed
  and the resolved address again at delivery, where the connection is pinned to it (no private,
  loopback, link-local, CGNAT or mapped addresses, no redirects). the body is signed `X-Amax-Signature: t=<unix>,v1=<hex HMAC-SHA256 of
  "t.body">` with the tenant's `amax-webhook` secret, retried `RETRY.maxAttempts` times with backoff, and the webhook
  is switched off after `MAX_FAILURES` deliveries in a row fail.
- **Rate limits** live in `@amax/core/rate-limit` (fixed one-minute windows per token, user and tenant, counted per server process
  and wired by each bundle: the proxy wires its own limits and recorder on every host;
  a shared store can plug in later). The registry calls it once per tool call; MCP and REST answer 429 with `Retry-After`;
  the proxy limits pages. Limited requests are counted in `api.rate_limited`. The API's logs are
  kept by the 032 purge (`apiRetention`), not a job of their own.

Tests: `pnpm vitest run --config ../../vitest.config.ts --dir packages/api` (needs
`DATABASE_MIGRATE_URL`).
