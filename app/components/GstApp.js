"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bizSnapshot,
  calcInvoice,
  emptyClient,
  emptyItem,
  gstBillErrors,
  isValidGstin,
  newGstBill,
  normalizeInvoice,
  profileFromBusiness,
  uid,
} from "../lib/invoice";
import * as store from "../lib/storage";
import dummy from "../data/dummy.json";
import { byName, useGstData } from "./gstData";
import { BusinessPicker, CustomerPicker } from "./GstPickers";
import InvoiceSheet from "./InvoiceSheet";
import { printWithTitle, upiLinkFor, usePreview, usePrintLayout, useQr } from "./print";
import { ConfirmDialog, useToast } from "./ui";

const SAVE_WARNING =
  "Once saved, this bill can only be Finished, Edited or Cancelled from the Saved Bills area. You can never delete it.";

// Where the main page starts: the bill left open last time, unless it was
// finished or cancelled since, or saved again from Saved Bills (then the saved
// copy is newer than the draft).
function initialBill(data) {
  const draft = data.draft;
  if (draft?.inv) {
    const rec = data.bills.find((r) => r.id === draft.inv.id);
    if (!rec) return { inv: normalizeInvoice(draft.inv), snapshot: "", base: null };
    if (rec.status === "unfinished") {
      const saved = normalizeInvoice(rec.data);
      const inv = rec.savedAt === draft.baseSavedAt ? normalizeInvoice(draft.inv) : saved;
      return { inv, snapshot: JSON.stringify(saved), base: rec.savedAt };
    }
  }
  const inv = newGstBill(data.businesses.length === 1 ? data.businesses[0] : null);
  return { inv, snapshot: JSON.stringify(inv), base: null };
}

export default function GstApp({ modeSwitch, installButton }) {
  const router = useRouter();
  const [data, save] = useGstData();
  const [inv, setInv] = useState(null);
  const [base, setBase] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [toastNode, notify] = useToast();
  const sheetRef = useRef(null);
  const savedSnapshot = useRef("");
  const latest = useRef(null);
  const keyRef = useRef({});
  const printLayout = usePrintLayout(sheetRef);
  const exitPreview = useCallback(() => setPreview(false), []);
  usePreview(preview, exitPreview);

  useEffect(() => {
    if (!data || inv) return;
    const start = initialBill(data);
    savedSnapshot.current = start.snapshot;
    setBase(start.base);
    setInv(start.inv);
  }, [data, inv]);

  // Businesses saved by the earlier version are linked once, when their GSTIN
  // is in the GST register.
  useEffect(() => {
    if (!data) return;
    const legacy = store.legacyGstBusinesses().filter(
      (b) => isValidGstin(b.gstin) && !data.businesses.some((x) => x.gstin === b.gstin)
    );
    if (!legacy.length) {
      try {
        store.markLegacyLinked();
      } catch {}
      return;
    }
    let cancelled = false;
    (async () => {
      const found = [];
      for (const b of legacy) {
        const res = await fetch(`/api/gst?gstin=${encodeURIComponent(b.gstin)}`).catch(() => null);
        if (!res?.ok) return;
        const match = (await res.json().catch(() => ({}))).businesses?.[0];
        if (match && !found.some((x) => x.gstin === match.gstin)) {
          found.push(profileFromBusiness({ ...b, id: uid(), gstin: match.gstin, name: match.name }));
        }
      }
      if (cancelled) return;
      try {
        if (found.length) {
          const current = store.loadGst().businesses;
          const fresh = found.filter((f) => !current.some((x) => x.gstin === f.gstin));
          save("businesses", [...current, ...fresh].sort(byName));
        }
        store.markLegacyLinked();
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, after the first load
  }, [Boolean(data)]);

  useEffect(() => {
    if (!inv) return;
    latest.current = { inv, baseSavedAt: base };
    const t = setTimeout(() => {
      try {
        store.saveGstDraft({ inv, baseSavedAt: base });
      } catch (e) {
        notify(e.message, "error");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [inv, base, notify]);

  // Leaving for Saved Bills or Non-GST mode unmounts this page; a reload or
  // closing the tab only fires pagehide.
  useEffect(() => {
    const flush = () => {
      if (!latest.current) return;
      try {
        store.saveGstDraft(latest.current);
      } catch {}
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const calc = useMemo(() => (inv ? calcInvoice(inv) : null), [inv]);
  const currentJson = useMemo(() => (inv ? JSON.stringify(inv) : ""), [inv]);
  const qr = useQr(upiLinkFor(inv, calc?.total));

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s" || key === "p") {
        e.preventDefault();
        keyRef.current[key]?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!data || !inv) return <div className="loading">Loading…</div>;

  const record = data.bills.find((r) => r.id === inv.id);
  const isSaved = Boolean(record);
  const dirty = currentJson !== savedSnapshot.current;
  const problems = gstBillErrors(inv);
  const errorKeys = showErrors ? new Set(problems.map(([k]) => k)) : null;
  const unfinishedCount = data.bills.filter((r) => r.status === "unfinished").length;

  const validate = () => {
    if (!problems.length) return true;
    setShowErrors(true);
    const labels = [...new Set(problems.map(([, label]) => label))];
    notify(`Fill the required fields: ${labels.join(", ")}.`, "error");
    return false;
  };

  const persist = (next) => {
    try {
      const now = Date.now();
      const existing = data.bills.find((r) => r.id === next.id);
      if (existing && existing.status !== "unfinished") {
        throw new Error(`Bill ${existing.number} is ${existing.status} and cannot be changed here.`);
      }
      const rec = {
        ...(existing || { id: next.id, status: "unfinished", createdAt: now }),
        number: next.number,
        savedAt: now,
        total: calcInvoice(next).total,
        data: next,
      };
      save("bills", existing ? data.bills.map((r) => (r.id === next.id ? rec : r)) : [rec, ...data.bills]);
      savedSnapshot.current = JSON.stringify(next);
      setInv(next);
      setBase(now);
      return true;
    } catch (e) {
      notify(e.message, "error");
      return false;
    }
  };

  const handleSave = () => {
    if (preview || !validate()) return;
    if (!inv.numberIssued) {
      setConfirmSave(true);
      return;
    }
    if (persist(inv)) notify(`Bill ${inv.number} saved.`);
  };

  const issueAndSave = async () => {
    setIssuing(true);
    try {
      const response = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", gstin: inv.business.gstin, date: inv.date, invoiceId: inv.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not generate an invoice number.");
      const next = { ...inv, number: result.number, numberIssued: true };
      setConfirmSave(false);
      if (persist(next)) notify(`Bill saved. Invoice number ${result.number}.`);
      else setInv(next);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setIssuing(false);
    }
  };

  const handlePrint = () => {
    if (!isSaved) return notify("Save the bill first. Print is available after the invoice number is issued.", "error");
    if (dirty) {
      if (!validate() || !persist(inv)) return;
    }
    printWithTitle([inv.number, inv.client.name].filter(Boolean).join(" - "));
  };

  keyRef.current = {
    s: handleSave,
    p: () => (preview ? notify("Preview cannot be printed. Save the bill, then use Print.", "error") : handlePrint()),
  };

  const handleNew = () => {
    if (dirty) {
      const msg = isSaved
        ? "Discard the unsaved changes? The saved copy of this bill stays in Saved Bills."
        : "Discard this bill? It has not been saved.";
      if (!confirm(msg)) return;
    }
    const profile = data.businesses.find((b) => b.id === inv.business.id);
    const next = newGstBill(profile);
    savedSnapshot.current = JSON.stringify(next);
    setShowErrors(false);
    setPreview(false);
    setBase(null);
    setInv(next);
    window.scrollTo(0, 0);
  };

  const fillDummyData = () => {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const sample = pick(dummy.businesses);
    const client = pick(dummy.customers);
    setInv((p) => ({
      ...p,
      client: { ...emptyClient(), ...client, phone: client.phone || "98765 43210" },
      items: sample.items.map((it) => ({ ...emptyItem(), ...it })),
      discount: sample.discount,
      shipping: sample.shipping,
    }));
    notify(`Filled sample customer ${client.name} and items.`);
  };

  const selectBusiness = (profile) => setInv((p) => ({ ...p, business: bizSnapshot(profile) }));

  const onBusinessSaved = (profile, isNew) => {
    if (inv.numberIssued) {
      if (inv.business.id === profile.id) selectBusiness(profile);
    } else if (isNew || inv.business.id === profile.id) {
      selectBusiness(profile);
    }
  };

  const status = !isSaved
    ? ["New bill · not saved", "warn"]
    : dirty
      ? ["Unsaved changes", "warn"]
      : ["Saved · Unfinished", "ok"];

  return (
    <div className={`app ${preview ? "previewing" : "responsive"} ${isSaved && !preview ? "" : "print-blocked"}`}>
      {preview ? (
        <div className="preview-bar">
          <span className="preview-note">Preview only. Save the bill to print it (Esc to go back).</span>
          <div className="spacer" />
          <button type="button" className="primary" onClick={() => setPreview(false)}>
            Back to Edit
          </button>
        </div>
      ) : null}
      <header className="toolbar screen-only">
        <div className="brand">GST Bill Generator</div>
        {modeSwitch}
        <div className="spacer" />
        <span className={`status ${status[1]}`}>{status[0]}</span>
        <div className="toolbar-actions">
          {installButton}
          <button type="button" onClick={fillDummyData} title="Fill a sample customer and items">
            Dummy Data
          </button>
          <button type="button" onClick={() => router.push("/bills")}>
            Saved Bills ({unfinishedCount})
          </button>
          <button type="button" onClick={handleNew}>
            New Bill
          </button>
        </div>
        <div className="toolbar-main">
          <button type="button" onClick={() => setPreview(true)} title="See how the bill will look">
            Preview
          </button>
          <button type="button" className={isSaved ? "" : "primary"} onClick={handleSave} title="Ctrl+S">
            Save
          </button>
          {isSaved ? (
            <button type="button" className="primary" onClick={handlePrint} title="Saves the latest details, then prints">
              Print
            </button>
          ) : null}
        </div>
      </header>

      <InvoiceSheet
        inv={inv}
        calc={calc}
        setInv={setInv}
        sheetRef={sheetRef}
        printLayout={printLayout}
        qr={qr}
        lockDate={inv.numberIssued}
        errors={errorKeys}
        bizPicker={
          <BusinessPicker
            businesses={data.businesses}
            selectedId={inv.business.id}
            disabled={inv.numberIssued}
            invalid={Boolean(errorKeys?.has("business"))}
            onSelect={selectBusiness}
            onSaveList={(list) => save("businesses", list)}
            onSaved={onBusinessSaved}
            notify={notify}
          />
        }
        clientPicker={
          <CustomerPicker
            clients={data.clients}
            selectedId={inv.client.id}
            onSelect={(c) => setInv((p) => ({ ...p, client: { ...emptyClient(), ...c } }))}
            onClear={() => setInv((p) => ({ ...p, client: emptyClient() }))}
            onSaveList={(list) => save("clients", list)}
            onSaved={(c, isNew) => {
              if (isNew || inv.client.id === c.id) setInv((p) => ({ ...p, client: { ...emptyClient(), ...c } }));
            }}
            onDeleted={(c) => {
              if (inv.client.id === c.id) setInv((p) => ({ ...p, client: { ...p.client, id: "" } }));
            }}
            notify={notify}
          />
        }
      />

      <div className="print-blocked-note" aria-hidden="true">
        Save this bill to print it.
      </div>

      {confirmSave ? (
        <ConfirmDialog
          title="Save this bill?"
          message={
            <>
              <p>An invoice number will be issued for this bill now, based on its invoice date.</p>
              <p className="confirm-warn">{SAVE_WARNING}</p>
            </>
          }
          acknowledge="I understand. Save the bill and issue its invoice number."
          confirmLabel={issuing ? "Saving…" : "Save Bill"}
          busy={issuing}
          onConfirm={issueAndSave}
          onCancel={() => setConfirmSave(false)}
        />
      ) : null}

      {toastNode}
    </div>
  );
}
