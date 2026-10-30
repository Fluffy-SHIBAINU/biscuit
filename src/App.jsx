import React, { useEffect } from "react";
import { navigate, usePath } from "./lib/navigate.js";
import { store, useStore } from "./lib/store.js";
import { api } from "./lib/api.js";
import Home from "./rosa/Home.jsx";
import Talk from "./rosa/Talk.jsx";
import EnterCode from "./rosa/EnterCode.jsx";
import Letter from "./rosa/Letter.jsx";
import Reading from "./rosa/Reading.jsx";
import Question from "./rosa/Question.jsx";
import Offer from "./rosa/Offer.jsx";
import Docket from "./rosa/Docket.jsx";
import Mail from "./rosa/Mail.jsx";
import CamSetup from "./cam/Setup.jsx";
import CamRest from "./cam/Rest.jsx";
import CamWatching from "./cam/Watching.jsx";
import Help from "./rosa/Help.jsx";
import AfterHelp from "./rosa/AfterHelp.jsx";
import SetupHelp from "./rosa/SetupHelp.jsx";
import VoiceCheck from "./rosa/VoiceCheck.jsx";
import Consent from "./rosa/Consent.jsx";
import Siri from "./rosa/Siri.jsx";
import Done from "./rosa/Done.jsx";
import Settings from "./rosa/Settings.jsx";
import { listenToWorker } from "./lib/push.js";
import Family from "./ana/Family.jsx";
import WhoFor from "./ana/WhoFor.jsx";
import LinkCode from "./ana/LinkCode.jsx";

function Placeholder({ surface }) {
  return (
    <main className="screen">
      <div className="label">Biscuit · Kindred</div>
      <h1 className="display">{surface}</h1>
      <p className="muted">Coming up.</p>
    </main>
  );
}

let workerListening = false;

export default function App() {
  const path = usePath();
  if (!workerListening) { workerListening = true; listenToWorker(); }
  const s = useStore();
  // Whether the server has a neural voice for Biscuit; without one the phone's own voice speaks.
  useEffect(() => { if (s.deviceToken && s.kind === "rosa") api("/speak/voice").then((r) => store.set({ neuralVoice: Boolean(r?.neural) })).catch(() => {}); }, [s.deviceToken, s.kind]);
  if (path === "/ana/new") return <WhoFor />;
  if (path === "/ana/link") return <LinkCode />;
  if (path === "/ana" || path.startsWith("/ana/")) return <Family />;
  if (path === "/link" || !s.deviceToken) return <EnterCode />;
  if (path === "/cam") return s.cam?.region ? <CamWatching /> : <CamSetup />;
  if (path === "/cam/setup") return <CamSetup />;
  if (path === "/cam/rest") return <CamRest />;
  if (path === "/talk") return <Talk />;
  if (path === "/letter") return <Letter />;
  if (path === "/reading") return <Reading />;
  if (path === "/question") return <Question />;
  if (path === "/mail") return <Mail />;
  if (path === "/help") return <Help />;
  if (path === "/help/after") return <AfterHelp />;
  if (path === "/setup/voice") return <VoiceCheck />;
  if (path === "/setup/consent") return <Consent />;
  if (path === "/setup/help") return <SetupHelp onDone={() => navigate("/setup/siri")} />;
  if (path === "/setup/siri") return <Siri />;
  if (path === "/setup/done") return <Done />;
  if (path === "/settings") return <Settings />;
  if (path === "/offer") return <Offer />;
  if (path === "/docket") return <Docket />;
  if (path === "/") return <Home />;
  return <Placeholder surface={path.slice(1)} />;
}
