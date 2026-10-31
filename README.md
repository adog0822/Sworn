# Sworn

**Say it. Sworn checks if it's true.**

Sworn is an AI voice agent that calls the engineers who run security controls, lets them explain what they did in their own words, checks every statement against the real systems, and translates the result for whoever's asking: SOC 2, ISO 27001, NIST 800-53, PCI DSS, HIPAA and FedRAMP 20x auditors, enterprise buyers, or the board.

Live demo: **https://sworn.loxeai-evt.workers.dev** (talk to it in the browser, or watch a sample call without a mic)

Built by LoxeAI for the Bolna Symphony Buildathon. Voice runs on [Bolna](https://bolna.ai).

---

## The problem

Compliance runs on claims. Engineers make them out loud ("MFA is on for everyone", "we removed everyone who left"). Auditors, buyers and regulators consume them in their own dialects. Nobody checks whether they're true until fieldwork.

- In one audit firm's 75 SOC 2 exams, 88% needed at least one extra round of evidence requests and 71% ended with exceptions ([Lazarus Alliance 2026 benchmark](https://lazarusalliance.com/2026-soc-2-audit-benchmark-report/), audit-firm data).
- IT security review is the #1 post-selection delay for 50% of enterprise software buyers ([G2 2026 Buyer Behavior Report](https://www.webull.com/news/15271320722760704)).
- 61% of IT and business leaders say they spend more time proving security than improving it ([Vanta State of Trust 2025](https://www.businesswire.com/news/home/20251029144534/en/), vendor survey).

A chatbot can rephrase an engineer's words. It can't start the conversation at quarter end, can't check the statement against the IAM report, and can't sign what it heard. That's the gap.

## What it does

1. **Listen.** A Bolna voice agent calls the control owner, at quarter end or the moment a claim drifts, and lets them talk in jargon.
2. **Type.** Every factual statement becomes a typed claim (kind, scope, systems, approver, period). This is the interlingua; every framework is a rendering of it.
3. **Verify.** Deterministic checks read the systems of record (IAM credential report, Okta, Linear, GitHub branch protection, AWS Config) and return the population, the exceptions, and a hash of what they read. A spoken claim is a hypothesis; the system is the test.
4. **Push back.** When records disagree, the agent says so on the call and asks the follow-up an auditor would ask ("who approved that, and when will it be fixed?"), then records the answer.
5. **Render.** Templates write each audience's version from the checked facts. No model writes the evidence, so nothing can say more than the checks found.
6. **Seal.** Each call becomes a packet: canonical JSON, SHA-256, Ed25519 signature, transcript hash, recording link, on a hash-chained log. Anyone can verify it at `/verify.html`.
7. **Keep watching.** When systems change, every claim re-verifies. A claim that stops being true queues a callback to the person who said it.

The auditor line and an MCP endpoint (`/mcp`) answer only from verified claims, and say so plainly when there's no record.

## The demo moment

Priya says: *"We nuked three stale accounts, and MFA's enforced for everyone through Okta."*

Sworn checks, then: *"Ah. The IAM report and you have a small disagreement. jsmith-contractor still has console access and no MFA. Its owner was deactivated in Okta a week ago, yet its access key was used four days later."*

One forgotten account breaks three of her statements. Sworn finds it before the auditor does, logs her fix, re-checks when she makes it, and calls her back when someone else breaks it.

## Why the design holds up to an auditor

A spoken answer is *inquiry*, the weakest form of audit evidence (PCAOB AS 1105 and AS 2201, AICPA AT-C 205). Sworn never treats it as evidence by itself:

- Claims and evidence are different types; a claim is only promoted when a system-of-record check corroborates it, and contradictions become exceptions, never smoothed over.
- The rendered auditor text states the inquiry, the inspection, the population and the exceptions separately.
- Signatures prove a record wasn't altered. The checks are what make it true. The UI says this in plain words.
- Calls open with an AI disclosure and a recording notice.
- The auditor line is read-only and cite-only, and refuses when no verified record exists.

## Architecture

```
Browser (Bolna web-call SDK) ─┐                      ┌─ Ledger Durable Object (SQLite)
Phone (Bolna /call)  ─────────┼─ Bolna voice agent ──┤   typed claims · checks · renders
                              │   (STT → LLM → TTS)  │   hash-chained log · signed packets
                              │   tools: verify_claim, resolve_claim, answer_auditor_question
                              └─ webhooks (transcript, recording) → seal packet
Cloudflare Worker: /api/*, /mcp, /.well-known/sworn-keys.json, static UI (web/, built to dist/)
```

- `src/core/` is pure TypeScript with no platform dependencies: `types.ts` (the interlingua), `checks.ts` (verifiers), `crosswalk.ts` (framework mappings), `render.ts` (dialects), `engine.ts` (ledger, drift, sealing), `seal.ts` (canonical JSON + Ed25519), `answer.ts` (auditor line), `replay.ts` (sample call).
- `src/ledger.ts` is the Durable Object that serializes every mutation.
- `src/worker.ts` routes the API, Bolna tool calls, webhooks and browser-call session minting.
- `src/mcp.ts` is a minimal MCP server over the same ledger.
- `web/` is the React app (Vite, Tailwind v4, shadcn/ui on Radix, Motion, Phosphor): landing, three-step onboarding, the call room, and the audit-package results.
- `scripts/setup-bolna.mjs` creates or updates both Bolna agents (control-owner line and auditor line) with their tools and webhook.

Quillfeather, the company in the demo, is fictional and its systems are seeded sample data. The voice calls, the checks, the drift detection and the signatures are real.

## Run it

```bash
npm install && npm --prefix web install
npm test                 # 11 tests: checks, drift, rendering, replay, signing
npm run dev:web          # React UI on :5180, API proxied to the live Worker
```

Local secrets go in `.dev.vars` (gitignored):

```
BOLNA_API_KEY=bn-...
SIGNING_KEY_JWK={"kty":"OKP","crv":"Ed25519","d":"...","x":"..."}
TOOL_TOKEN=...
WEBHOOK_TOKEN=...
DEMO_PASSCODE=...
```

Deploy to Cloudflare and point Bolna at it:

```bash
npx wrangler deploy
npx wrangler secret bulk secrets.json        # the same five values
npm run setup:bolna -- https://<your-worker>.workers.dev
npx wrangler deploy                          # picks up the agent IDs
```

## What's next

- Real connectors (LoxeAI already pulls AWS, Okta, Google, GitHub and HR evidence) in place of seeded state.
- Owner attestation with SSO step-up after each call; the AI never signs on anyone's behalf.
- Multilingual control-owner calls (Hindi and Hinglish via Bolna and Sarvam) for India's 2,100+ global capability centers.
- An opt-in incident-bridge scribe that turns engineer talk into candidate regulatory clocks (CERT-In 6 hours, DORA 4 hours, GDPR 72 hours), with counsel deciding.
- A typed-decision layer (Jev-style calibrated classifiers) for claim typing confidence.

## Team

- **Arjav Mehta**, founder and CEO, LoxeAI
- **Karthik**, co-founder and CTO, LoxeAI
