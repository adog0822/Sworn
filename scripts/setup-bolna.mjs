#!/usr/bin/env node
// Creates (or fully updates) Sworn's two Bolna voice agents and writes their IDs
// into wrangler.jsonc. Usage: npm run setup:bolna -- https://your-worker.workers.dev
import fs from "node:fs";

const base = (process.argv[2] || "https://sworn.loxeai-evt.workers.dev").replace(/\/$/, "");
const vars = Object.fromEntries(
  fs.readFileSync(".dev.vars", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const KEY = process.env.BOLNA_API_KEY || vars.BOLNA_API_KEY;
const TOOL_AUTH = `Bearer ${vars.TOOL_TOKEN}`;

const VOICE = { provider: "elevenlabs", provider_config: { voice: "Benedict - Smooth, Polished and British", voice_id: "oaGwHLz3csUaSnc2NBD4", model: process.env.SWORN_TTS_MODEL || "eleven_v3_conversational" }, stream: true, buffer_size: 250, audio_format: "wav",
  pronunciation_rules: [
    { word: "jsmith-contractor", say_as: "J Smith contractor" },
    { word: "svc-deploy", say_as: "S V C deploy" },
    { word: "svc-backup", say_as: "S V C backup" },
    { word: "tmp-admin-debug", say_as: "temp admin debug" },
    { word: "SOC 2", say_as: "sock two" },
    { word: "IAM", say_as: "I A M" },
    { word: "MFA", say_as: "M F A" },
    { word: "SEC-214", say_as: "ticket S E C two fourteen" },
  ] };
// Key-term prompting so jargon and names survive transcription ("Q4" was heard as "queue").
const KEYTERMS = "Q4, Q3, quarter, access review, Okta, Linear, Jira, AWS, IAM, IAM user, MFA, two-factor, SSO, SCP, Terraform, GitHub, branch protection, pull request, PR, CI, KMS, RDS, S3, offboarding, deprovisioned, contractor, jsmith, svc-deploy, svc-backup, Raj, Priya, SOC 2, ISO 27001, auditor, exception, remediation";
const EARS = { provider: "deepgram", model: "nova-3", language: "en", stream: true, encoding: "linear16", sampling_rate: 16000, endpointing: 450, keywords: KEYTERMS };
const LLM = { agent_type: "simple_llm_agent", agent_flow_type: "streaming", llm_config: { provider: "openai", family: "openai", model: "gpt-4.1-mini", max_tokens: 220, temperature: 0.2 } };

const execParam = { type: "string", description: "The call reference from your instructions ({execution_id}). Always pass it." };

function tool(name, description, pre_call_message, properties, required) {
  const param = Object.fromEntries(Object.keys(properties).map((k) => [k, `%(${k})s`]));
  return {
    def: { name, key: "custom_task", description, pre_call_message, parameters: { type: "object", properties, required } },
    params: { method: "POST", url: `${base}/api/bolna/tools/${name}`, api_token: TOOL_AUTH, headers: { "Content-Type": "application/json" }, param },
  };
}

const verifyClaim = tool(
  "verify_claim",
  "Call this every time the engineer states a fact about a security control: MFA or two-factor login, a user access review, removing access for people who left (offboarding, deprovisioning, deleting stale accounts), code review or branch protection before merging to production, or encryption at rest. One call per distinct fact, before you respond to it. It checks the statement against live system records and tells you what to say.",
  "Let me check that against the records.",
  {
    claim_kind: {
      type: "string",
      enum: ["mfa.enforced", "access_review.completed", "accounts.deprovisioned", "change.peer_review", "encryption.at_rest"],
      description: "mfa.enforced = MFA/2FA; access_review.completed = a periodic access review happened; accounts.deprovisioned = departed users' access was removed; change.peer_review = PR approval / branch protection; encryption.at_rest = data stores encrypted.",
    },
    engineer_words: { type: "string", description: "What the engineer said about this fact, close to verbatim." },
    scope: { type: "string", description: "Who or what the statement covers, e.g. 'everyone', 'human users', 'three stale accounts', 'prod'. Use 'none' if not said." },
    systems: { type: "string", description: "Comma-separated systems named, e.g. 'okta, aws, github'. Use 'none' if not said." },
    approver: { type: "string", description: "Who approved, if the engineer said so. 'none' otherwise." },
    period: { type: "string", description: "Review period if said, e.g. 'Q4 2026'. 'none' otherwise." },
    execution_id: execParam,
  },
  ["claim_kind", "engineer_words", "execution_id"],
);

const resolveClaim = tool(
  "resolve_claim",
  "Call this when the engineer explains a contradiction the records showed: an approved exception, a fix they commit to, a dispute, or a correction of what they said. Records their answer in auditor language on the affected claims.",
  "Noting that for the auditor.",
  {
    resolution: { type: "string", enum: ["approved_exception", "remediation", "disputed", "corrected"], description: "approved_exception = documented and approved; remediation = they will fix it; disputed = they think the records are wrong; corrected = they misspoke." },
    subject: { type: "string", description: "The account, user or system the explanation is about, e.g. 'jsmith-contractor' or 'svc-deploy'. 'none' if unclear." },
    claim_kind: { type: "string", description: "The claim kind it relates to if obvious, else 'none'." },
    note: { type: "string", description: "One sentence in auditor language: what was found and what will happen." },
    owner: { type: "string", description: "Who owns the fix or approved the exception. 'none' if not said." },
    due: { type: "string", description: "When it will be done, e.g. 'today' or 'Nov 3'. 'none' if not said." },
    execution_id: execParam,
  },
  ["resolution", "note", "execution_id"],
);

const answerAuditor = tool(
  "answer_auditor_question",
  "Call this for every question about controls, evidence, or how the company handles security or compliance: MFA, access reviews, least privilege, terminations and offboarding, change management, encryption. Returns an answer built only from verified claims, with claim IDs.",
  "Let me pull the verified record.",
  {
    question: { type: "string", description: "The caller's question, close to verbatim." },
    framework: { type: "string", description: "Framework the caller is using: soc2, iso27001, nist80053, pcidss, hipaa or fedramp20x. Default soc2." },
    execution_id: execParam,
  },
  ["question", "execution_id"],
);

const PERSONA = `Personality: you are Sworn, think JARVIS with a compliance badge. Calm, quick, British, dryly funny. You may add one short witty aside per turn (a raised-eyebrow observation, never a pun pile-up), then get straight to the point. Warm with people, merciless with facts. Never joke about a security finding being harmless, and never invent a fact to land a joke. Speak in short spoken sentences, no lists, no markdown.`;

const INTERVIEW_PROMPT = `${PERSONA}

You are on a recorded call with {owner_full_name}, {owner_role} at {company}. Reason for this call: {call_reason}. Call reference: {execution_id}.

Your job: let the engineer explain in their own words, check every factual statement about a security control against the real systems, and ask the follow-up a sharp auditor would ask.

Rules:
1. Whenever the engineer states a fact about MFA, access reviews, removing access for people who left, code review or branch protection, or encryption at rest, call @verify_claim once per distinct fact before you respond to it. Pass their words close to verbatim and always pass execution_id {execution_id}.
2. Then say the tool's "say" result in natural spoken words (round numbers, drop jargon the engineer didn't use) and follow its "ask_next" instruction. Never state a finding the tool did not return. Never declare anything compliant on your own.
3. When records agree, a light touch: for example "Lovely. The records agree with you, which is more than I can say for most people." When they disagree, stay curious, not accusing: for example "Ah. The IAM report and you have a small disagreement." Then ask who approved it, whether it covers all accounts or some, and when it will be fixed.
4. When the engineer explains an exception or commits to a fix, call @resolve_claim with the resolution type, the account or system as subject, the owner and due date if given, and a one-sentence note in auditor language.
5. If the engineer hesitates or says they don't know, help them: ask a concrete question, for example "Start simple: was there an access review this quarter, and who signed off?"
6. Understand engineers the way a colleague would. They say "nuked", "killed", "offboarded", "yanked access" for removing accounts; "2FA", "MFA", "Okta Verify", "YubiKeys" for MFA; "PRs", "reviews", "branch rules" for code review. Speech-to-text mishears jargon: "queue review" or "cue four" means Q4, "octa" means Okta, "I am" before "users" or "roles" means IAM. One sentence can hold several claims; check each one. If you genuinely can't tell what they meant, confirm in a few words ("The Q4 access review, right?") instead of guessing.
7. One or two sentences per turn, one question at a time.
8. When the statements are covered, say in one sentence what the auditor will receive, that you'll keep watching the systems and call back if anything drifts, and sign off with a little style.
9. If asked something unrelated, deflect with wit and steer back to compliance.`;

const AUDITOR_PROMPT = `${PERSONA}

You are {company}'s compliance line for external auditors and customer security reviewers. The call is recorded. Call reference: {execution_id}.

Rules:
1. For every question about controls, evidence, or how {company} handles security, call @answer_auditor_question with the question, the framework the caller uses (soc2, iso27001, nist80053, pcidss, hipaa or fedramp20x; default soc2), and execution_id {execution_id}.
2. Read the answer back faithfully in auditor language. You may shorten it, but never add facts, never soften an exception, and never claim more than the answer supports. Auditors appreciate precision more than charm, so keep the wit very light here.
3. If there is no verified record, say so plainly and offer to have the control owner called.
4. Mention claim IDs when they help trace evidence, and offer the signed evidence packet.
5. Two sentences per turn.`;

function agentBody(name, welcome, prompt, tools, terminate) {
  return {
    agent_config: {
      agent_name: name,
      agent_welcome_message: welcome,
      webhook_url: `${base}/api/bolna/webhook?token=${vars.WEBHOOK_TOKEN}`,
      agent_type: "other",
      tasks: [{
        task_type: "conversation",
        tools_config: {
          llm_agent: LLM, synthesizer: VOICE, transcriber: EARS,
          input: { provider: "plivo", format: "wav" }, output: { provider: "plivo", format: "wav" },
          api_tools: { tools: tools.map((t) => t.def), tools_params: Object.fromEntries(tools.map((t) => [t.def.name, t.params])) },
        },
        toolchain: { execution: "parallel", pipelines: [["transcriber", "llm", "synthesizer"]] },
        task_config: {
          call_terminate: terminate, hangup_after_silence: 20, incremental_delay: 400,
          number_of_words_for_interruption: 3, check_if_user_online: true, trigger_user_online_message_after: 12,
          check_user_online_message: "Still there?", voicemail: false, optimize_latency: true,
        },
      }],
    },
    agent_prompts: { task_1: { system_prompt: prompt } },
  };
}

const AGENTS = [
  {
    key: "INTERVIEWER_AGENT_ID",
    body: agentBody(
      "Sworn · Control owner line",
      "Hello {owner_name}, Sworn here, the AI that keeps {company} honest with its auditors. This call is recorded for the audit record. It's about {call_reason}. Tell me what you did, and I'll check whether the systems agree with you.",
      INTERVIEW_PROMPT, [verifyClaim, resolveClaim], 300,
    ),
  },
  {
    key: "AUDITOR_AGENT_ID",
    body: agentBody(
      "Sworn · Auditor line",
      "Sworn, {company}'s AI compliance line. This call is recorded, and I only answer from records I've verified, so ask me anything you like. Which control shall we look at?",
      AUDITOR_PROMPT, [answerAuditor], 240,
    ),
  },
];

async function api(path, method, body) {
  const res = await fetch(`https://api.bolna.ai${path}`, {
    method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

const wranglerPath = "wrangler.jsonc";
let wrangler = fs.readFileSync(wranglerPath, "utf8");
const current = (k) => wrangler.match(new RegExp(`"${k}": "([^"]*)"`))?.[1];

for (const a of AGENTS) {
  const existing = current(a.key);
  if (existing) {
    await api(`/v2/agent/${existing}`, "PUT", a.body);
    console.log(`updated ${a.key} = ${existing}`);
  } else {
    const r = await api("/v2/agent", "POST", a.body);
    const id = r.agent_id;
    wrangler = wrangler.replace(new RegExp(`"${a.key}": "[^"]*"`), `"${a.key}": "${id}"`);
    console.log(`created ${a.key} = ${id}`);
  }
}
fs.writeFileSync(wranglerPath, wrangler);
console.log("wrangler.jsonc updated; run `npm run deploy`.");
