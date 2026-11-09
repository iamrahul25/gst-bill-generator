"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isValidGstin } from "../lib/invoice";

export default function GstinSearch({ value, businessName, locked, invalid, status, onChange, onSelect }) {
  const listId = useId();
  const wrapRef = useRef(null);
  const skipQuery = useRef("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [active, setActive] = useState(-1);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!open || locked) return undefined;
    if (skipQuery.current && skipQuery.current === value) {
      skipQuery.current = "";
      setOpen(false);
      return undefined;
    }
    const query = value.trim();
    if (query.length < 2) {
      setResults([]);
      setSearchStatus("");
      setOpen(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchStatus("Searching…");
      setOpen(true);
      try {
        const response = await fetch(`/api/gst?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Search failed.");
        const businesses = data.businesses || [];
        setResults(businesses);
        setActive(businesses.length ? 0 : -1);
        setSearchStatus(businesses.length ? "" : "No registered GSTIN matches. Use New to register it.");
      } catch (error) {
        if (error.name === "AbortError") return;
        setResults([]);
        setActive(-1);
        setSearchStatus(error.message || "Search failed.");
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open, locked]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const choose = (business, meta) => {
    skipQuery.current = business.gstin;
    setOpen(false);
    onSelect(business, meta);
  };

  const showResults = () => {
    if (!locked && value.trim().length >= 2) setOpen(true);
  };

  const hideResults = (event) => {
    const next = event.relatedTarget;
    if (wrapRef.current?.contains(next)) return;
    requestAnimationFrame(() => {
      if (wrapRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    });
  };

  const onKeyDown = (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : -1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (results.length ? (i <= 0 ? results.length - 1 : i - 1) : -1));
    } else if (event.key === "Enter" && active >= 0 && results[active]) {
      event.preventDefault();
      choose(results[active]);
    }
  };

  return (
    <>
      <span className={value ? "" : "screen-only"}>GSTIN :</span>
      <div className="gstin-search screen-only" ref={wrapRef}>
        <input
          className={`field ${invalid ? "invalid" : ""}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Search GSTIN"
          value={value}
          readOnly={locked}
          placeholder="Search GSTIN"
          maxLength={15}
          spellCheck={false}
          autoCapitalize="characters"
          onFocus={showResults}
          onBlur={hideResults}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            onChange(event.target.value);
            if (!locked && event.target.value.trim().length >= 2) setOpen(true);
          }}
        />
        {locked || status === "registered" || status === "checking" ? null : (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setModalOpen(true);
            }}
            aria-label="Register new GST number"
          >
            New
          </button>
        )}
        {status === "checking" ? (
          <span className="gstin-mark wait" role="status" aria-label="Checking this GSTIN">
            …
          </span>
        ) : null}
        {status === "registered" ? (
          <button type="button" className="gstin-mark ok" aria-pressed="true" aria-label="This GSTIN is registered">
            ✓
          </button>
        ) : null}
        {status === "missing" && !locked ? (
          <button
            type="button"
            className="gstin-mark bad"
            aria-label="This GSTIN is not registered. Register it."
            onClick={() => {
              setOpen(false);
              setModalOpen(true);
            }}
          >
            ×
          </button>
        ) : null}
        {open ? (
          <div className="gstin-menu" id={listId} role="listbox" aria-label="Registered GST numbers">
            {results.map((business, index) => (
              <button
                key={business.gstin}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === active}
                className={`gstin-option ${index === active ? "active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(business)}
              >
                <span className="gstin-code">{business.gstin}</span>
                <span className="gstin-name">{business.name}</span>
              </button>
            ))}
            {searchStatus ? (
              <div className="gstin-empty" role="status">
                {searchStatus}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {value ? <span className="print-only">{value}</span> : null}
      {modalOpen ? (
        <RegisterModal
          gstin={value}
          businessName={businessName}
          onClose={() => setModalOpen(false)}
          onRegistered={(business, already) => {
            setModalOpen(false);
            choose(business, { already });
          }}
        />
      ) : null}
    </>
  );
}

function RegisterModal({ gstin, businessName = "", onClose, onRegistered }) {
  const gstinRef = useRef(null);
  const nameRef = useRef(null);
  const [gstinValue, setGstinValue] = useState(gstin || "");
  const [name, setName] = useState(businessName || "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const field = isValidGstin(gstinValue) ? nameRef.current : gstinRef.current;
    field?.focus();
    const onKey = (event) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // Focus once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const nextGstin = gstinValue.toUpperCase().replace(/\s/g, "");
    const nextName = name.trim().replace(/\s+/g, " ");
    if (!isValidGstin(nextGstin)) {
      setError("Enter a valid 15-character GSTIN.");
      gstinRef.current?.focus();
      return;
    }
    if (!nextName) {
      setError("Enter the business name.");
      nameRef.current?.focus();
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin: nextGstin, name: nextName }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not register this GST number.");
      onRegistered(data.business, data.already);
    } catch (err) {
      setError(err.message || "Could not register this GST number.");
      setPending(false);
    }
  };

  return (
    <div className="modal-backdrop screen-only" onClick={pending ? undefined : onClose}>
      <div
        className="modal register-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>Register GST number</h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={pending} aria-label="Close">
            ×
          </button>
        </div>
        <form className="register-form" onSubmit={submit}>
          <label htmlFor="register-gstin">
            GST number
            <input
              id="register-gstin"
              ref={gstinRef}
              value={gstinValue}
              maxLength={15}
              spellCheck={false}
              autoCapitalize="characters"
              aria-invalid={Boolean(error && !isValidGstin(gstinValue.toUpperCase().replace(/\s/g, "")))}
              onChange={(event) => setGstinValue(event.target.value.toUpperCase().replace(/\s/g, ""))}
            />
          </label>
          <label htmlFor="register-name">
            Business name
            <input
              id="register-name"
              ref={nameRef}
              value={name}
              maxLength={160}
              aria-invalid={Boolean(error && isValidGstin(gstinValue) && !name.trim())}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p className="register-note">
            The invoice series uses the first letter of each word. Shri Shayam Plywood becomes SSP/26/11/0001.
          </p>
          {error ? (
            <div className="hint error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="register-actions">
            <button type="button" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={pending}>
              {pending ? "Registering…" : "Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
