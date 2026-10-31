import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { CallScreen } from "./components/CallScreen";
import { Hood } from "./components/Hood";
import { Landing } from "./components/Landing";
import { Onboarding } from "./components/Onboarding";
import { Results } from "./components/Results";
import { Button } from "./components/ui/button";
import { api, callClaims, useLedger } from "./lib/api";
import { useCall, type Role } from "./lib/useCall";

type Screen = "landing" | "call" | "results";

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [onboard, setOnboard] = useState<{ open: boolean; role: Role }>({ open: false, role: "interview" });
  const [hood, setHood] = useState(false);
  const { state, refresh } = useLedger(screen === "call");
  const call = useCall(refresh);

  // When a call ends, wait for the webhook to seal it, then show what happened.
  useEffect(() => {
    if (call.phase !== "ended" || screen !== "call") return;
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      await refresh();
      const sealed = state?.calls.find((c) => c.id === call.callId)?.packetId;
      if (sealed || tries > 6) {
        clearInterval(t);
        setScreen(call.role === "interview" && callClaims(state, call.callId).length ? "results" : "landing");
      }
    }, 1200);
    return () => clearInterval(t);
  }, [call.phase, screen, state?.version]);

  // Every fresh demo starts from the same seeded systems; a drift callback keeps the current state.
  const freshStart = () => api("/api/reset", {}).catch(() => {});
  const startCall = async (role: Role, callbackId?: string) => {
    setOnboard({ open: false, role });
    setScreen("call");
    if (!callbackId && role === "interview") await freshStart();
    call.startLive(role, callbackId);
  };
  const watch = async () => {
    setScreen("call");
    await freshStart();
    call.startReplay();
  };
  const home = async () => {
    await api("/api/reset", {}).catch(() => {});
    await refresh();
    call.setPhase("idle");
    setScreen("landing");
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {screen === "landing" && (
          <motion.div key="landing" exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <Landing state={state} onTalk={() => setOnboard({ open: true, role: "interview" })} onWatch={watch} onHood={() => setHood(true)} />
          </motion.div>
        )}
        {screen === "results" && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Results
              state={state}
              callId={call.callId}
              refresh={refresh}
              onHome={home}
              onAuditor={() => setOnboard({ open: true, role: "auditor" })}
              onCallback={(id) => startCall("interview", id)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {screen === "call" && (
          <motion.div key="call" initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
            <CallScreen call={call} state={state} />
          </motion.div>
        )}
      </AnimatePresence>

      {call.phase === "error" && screen === "call" && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-4 rounded-full bg-sheet px-5 py-3 text-[14px] text-ink shadow-xl">
          {call.error}
          <Button size="sm" onClick={() => { call.setPhase("idle"); setScreen("landing"); }}>Back</Button>
          <Button size="sm" variant="outline" onClick={watch}>Watch a call</Button>
        </div>
      )}

      <Onboarding open={onboard.open} initialRole={onboard.role} onOpenChange={(o) => setOnboard((s) => ({ ...s, open: o }))} onStart={(r) => startCall(r)} />
      <Hood open={hood} onOpenChange={setHood} state={state} refresh={refresh} />
    </>
  );
}
