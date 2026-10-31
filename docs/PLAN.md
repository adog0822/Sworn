# Build plan (make-plan output)

Phases were run in order; each lists its source docs and how it was verified.

## Phase 0: documentation discovery
- Bolna API: official skills repo `bolna-ai/skills` (references/openapi.yml, create-agent, setup-tools, make-call, setup-webhook, bolna-graph-agents) and docs at bolna.ai/docs.
- Allowed APIs used: `POST /v2/agent`, `PUT /v2/agent/{id}`, `POST /call`, `POST /web-call/freeswitch-session`, `GET /me/voices`, `GET /user/me`; tools via `tools_config.api_tools` with `key: "custom_task"`; webhooks via `agent_config.webhook_url`.
- Anti-patterns avoided: deprecated `api.bolna.dev` host and v1 `/agent` endpoints; PATCH for tool changes (PUT is required); timezone-less `scheduled_at`; API key in the browser.

## Phase 1: core engine (src/core)
Typed claims, deterministic checks, crosswalk, renderers, hash-chained log, Ed25519 sealing. Verified by `npm test`.

## Phase 2: Worker + Durable Object
API, Bolna tool endpoints (bearer auth), webhook (token), browser-call minting, MCP. Verified by simulating Bolna tool calls and webhooks with curl against the deployed Worker.

## Phase 3: Bolna agents
`scripts/setup-bolna.mjs` creates the control-owner and auditor agents. Verified with `GET /v2/agent/{id}` (tools, webhook, voice) and a minted browser-call session.

## Phase 4: guided UI
Intro → live call with verdict cards → result walkthrough (heard, checked, translated, sealed, keeps watching). Verified in the browser with the sample call, fix and drift.

## Phase 5: submission
README, pitch deck, live URL, repo.
