"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

// Escape closes only the top-most open modal.
const openModals = [];

export function Modal({ title, onClose, busy = false, className = "", children }) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const entry = {};
    openModals.push(entry);
    const onKey = (event) => {
      if (event.key !== "Escape" || openModals.at(-1) !== entry || busyRef.current) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openModals.splice(openModals.indexOf(entry), 1);
    };
  }, []);

  return (
    <div className="modal-backdrop screen-only" onMouseDown={busy ? undefined : onClose}>
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// `acknowledge` adds a checkbox that must be ticked before confirming.
export function ConfirmDialog({
  title,
  message,
  acknowledge,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  onClose = onCancel,
}) {
  const [checked, setChecked] = useState(false);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!acknowledge) confirmRef.current?.focus();
  }, [acknowledge]);

  return (
    <Modal title={title} onClose={onClose} busy={busy} className="confirm-modal">
      <div className="confirm-body">
        <div className="confirm-message">{message}</div>
        {acknowledge ? (
          <label className="confirm-check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} autoFocus />
            <span>{acknowledge}</span>
          </label>
        ) : null}
        <div className="register-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? "primary danger" : "primary"}
            onClick={onConfirm}
            disabled={busy || (acknowledge && !checked)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const notify = useCallback((msg, type = "ok") => {
    clearTimeout(timer.current);
    setToast({ msg, type });
    timer.current = setTimeout(() => setToast(null), type === "error" ? 6000 : 2500);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const node = toast ? (
    <div className={`toast screen-only ${toast.type}`} role="status" aria-live="polite">
      {toast.msg}
    </div>
  ) : null;

  return [node, notify];
}

export function ModeSwitch({ mode, onChange }) {
  return (
    <div className="seg" role="group" aria-label="Bill type">
      <button type="button" className={mode === "gst" ? "active" : ""} onClick={() => onChange("gst")}>
        GST Bill
      </button>
      <button type="button" className={mode === "nongst" ? "active" : ""} onClick={() => onChange("nongst")}>
        Non-GST Bill
      </button>
    </div>
  );
}

export function useServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    }
  }, []);
}

export function InstallButton({ notify }) {
  const [install, setInstall] = useState(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (standalone) return;
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    if (ios) setInstall({ ios: true });
    const onPrompt = (e) => {
      e.preventDefault();
      setInstall({ prompt: e });
    };
    const onInstalled = () => setInstall(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!install) return null;

  const handleInstall = async () => {
    if (install.ios) {
      notify('To install: tap the Share button, then "Add to Home Screen".');
      return;
    }
    install.prompt.prompt();
    const { outcome } = await install.prompt.userChoice;
    setInstall(null);
    if (outcome === "accepted") notify("Installing GST Bill Generator as an app…");
  };

  return (
    <button type="button" onClick={handleInstall} title="Install this as an app on your computer or phone">
      Install App
    </button>
  );
}
