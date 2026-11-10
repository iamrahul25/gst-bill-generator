"use client";

import { useEffect, useState } from "react";
import * as store from "../lib/storage";
import GstApp from "./GstApp";
import NonGstApp from "./NonGstApp";
import { InstallButton, ModeSwitch, useServiceWorker, useToast } from "./ui";

export default function InvoiceApp() {
  const [mode, setMode] = useState(null);
  const [toastNode, notify] = useToast();
  useServiceWorker();

  useEffect(() => {
    setMode(store.loadMode());
  }, []);

  if (!mode) return <div className="loading">Loading…</div>;

  const changeMode = (next) => {
    if (next === mode) return;
    try {
      store.saveMode(next);
    } catch {}
    setMode(next);
  };

  const props = {
    modeSwitch: <ModeSwitch mode={mode} onChange={changeMode} />,
    installButton: <InstallButton notify={notify} />,
  };

  return (
    <>
      {mode === "gst" ? <GstApp {...props} /> : <NonGstApp {...props} />}
      {toastNode}
    </>
  );
}
