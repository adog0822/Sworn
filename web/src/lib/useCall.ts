import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export type Role = "interview" | "auditor";
export type Phase = "idle" | "connecting" | "live" | "ended" | "error";
export interface Caption { id: number; text: string; final: boolean; at: number }

declare global {
  interface Window {
    BolnaWebCall?: any;
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

// One call at a time: a Bolna browser call, or the scripted sample that runs through the same engine.
export function useCall(onRefresh: () => void) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("interview");
  const [mode, setMode] = useState<"live" | "replay">("live");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const level = useRef(0);
  const sdk = useRef<any>(null);
  const recog = useRef<any>(null);
  const replayAlive = useRef(false);
  const capId = useRef(0);

  // Live captions of the user's own speech, so they see Sworn "hearing" them. Chrome-only; silently absent elsewhere.
  const startCaptions = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = "en-US";
      r.onresult = (e: any) => {
        const res = e.results[e.results.length - 1];
        const text = res[0].transcript.trim();
        if (!text) return;
        setCaptions((cs) => {
          const last = cs.at(-1);
          if (last && !last.final) return [...cs.slice(0, -1), { ...last, text, final: res.isFinal }];
          return [...cs, { id: ++capId.current, text, final: res.isFinal, at: Date.now() }].slice(-12);
        });
      };
      r.onend = () => {
        if (recog.current === r) {
          try { r.start(); } catch { /* already restarting */ }
        }
      };
      r.start();
      recog.current = r;
    } catch {
      recog.current = null;
    }
  };
  const stopCaptions = () => {
    const r = recog.current;
    recog.current = null;
    try { r?.stop(); } catch { /* not running */ }
  };

  const reset = (r: Role, m: "live" | "replay") => {
    setRole(r);
    setMode(m);
    setCaptions([]);
    setError(null);
    setCallId(null);
    setMuted(false);
    setStartedAt(Date.now());
    level.current = 0;
  };

  async function startLive(r: Role, callbackId?: string) {
    if (!window.BolnaWebCall) {
      setError("The voice SDK is still loading. Try again in a second.");
      setPhase("error");
      return;
    }
    reset(r, "live");
    setPhase("connecting");
    const qs = new URLSearchParams({ kind: r, ...(callbackId ? { callback: callbackId } : {}) });
    const call = new window.BolnaWebCall({ sessionUrl: `/api/web-call/session?${qs}` });
    sdk.current = call;
    let quietSince = 0;
    call.on("volume-level", (v: number) => {
      level.current = Math.min(1, v * 1.8);
      const now = performance.now();
      if (v > 0.04) quietSince = now;
      setSpeaking(now - quietSince < 650);
    });
    call.on("call-start", () => {
      setPhase("live");
      setStartedAt(Date.now());
      setCallId(call.getRunId?.() ?? null);
      startCaptions();
      onRefresh();
    });
    call.on("call-end", () => {
      stopCaptions();
      level.current = 0;
      setSpeaking(false);
      setPhase("ended");
    });
    call.on("error", (e: any) => {
      stopCaptions();
      setError(
        e?.code === "at_capacity" ? "All lines are busy right now. Watch a call instead."
          : e?.code === "microphone_denied" ? "Your microphone is blocked. Allow it in the address bar, or watch a call instead."
            : `The call couldn't connect (${e?.message || e?.code}).`,
      );
      setPhase("error");
    });
    try {
      await call.start();
    } catch (e: any) {
      setError(e?.message || "The call couldn't start.");
      setPhase("error");
    }
  }

  async function startReplay() {
    reset("interview", "replay");
    setPhase("live");
    replayAlive.current = true;
    try {
      const { callId: id, steps } = await api<{ callId: string; steps: number }>("/api/replay", { action: "start" });
      setCallId(id);
      for (let i = 0; i < steps && replayAlive.current; i++) {
        const r = await api<{ done: boolean; pauseMs: number }>("/api/replay", { action: "step", callId: id, index: i });
        onRefresh();
        const t0 = performance.now();
        // Drive the orb as if the agent were speaking, so the sample feels like a call.
        while (performance.now() - t0 < r.pauseMs && replayAlive.current) {
          level.current = 0.25 + 0.35 * Math.abs(Math.sin(performance.now() / 140));
          await new Promise((res) => setTimeout(res, 60));
        }
        if (r.done) break;
      }
    } catch (e: any) {
      setError(e?.message);
    }
    level.current = 0;
    replayAlive.current = false;
    setPhase("ended");
  }

  async function end() {
    replayAlive.current = false;
    stopCaptions();
    await sdk.current?.stop?.().catch(() => {});
    setPhase("ended");
  }

  function toggleMute() {
    const next = !muted;
    sdk.current?.setMuted?.(next);
    setMuted(next);
  }

  useEffect(() => () => {
    replayAlive.current = false;
    stopCaptions();
    sdk.current?.stop?.().catch?.(() => {});
  }, []);

  return { phase, setPhase, callId, role, mode, speaking, muted, captions, error, startedAt, level, startLive, startReplay, end, toggleMute };
}
