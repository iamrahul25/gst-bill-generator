"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BILL_STATUS, CANCEL_REASONS, calcInvoice, normalizeInvoice } from "../lib/invoice";
import { BillUnavailable } from "./EditBill";
import { useGstData } from "./gstData";
import InvoiceSheet from "./InvoiceSheet";
import { upiLinkFor, useQr } from "./print";
import { useToast } from "./ui";

const noop = () => {};

export default function CancelBill({ id }) {
  const router = useRouter();
  const [data, save] = useGstData();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [toastNode, notify] = useToast();
  const record = data?.bills.find((r) => r.id === id);
  const cancellable = record && (record.status === "unfinished" || record.status === "finished");
  const inv = useMemo(() => (record ? normalizeInvoice(record.data) : null), [record]);
  const calc = useMemo(() => (inv ? calcInvoice(inv) : null), [inv]);
  const qr = useQr(upiLinkFor(inv, calc?.total));

  if (!data) return <div className="loading">Loading…</div>;
  if (!cancellable) return <BillUnavailable record={record} action="cancelled" />;

  const discard = () => router.push(`/bills?tab=${record.status}`);

  const markCancelled = () => {
    if (!reason) return setError("Select a cancel reason.");
    if (reason === "Other" && !note.trim()) return setError("Write the reason for cancelling this bill.");
    try {
      save(
        "bills",
        data.bills.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "cancelled",
                cancel: { reason, note: note.trim(), at: new Date().toISOString(), from: r.status },
              }
            : r
        )
      );
    } catch (e) {
      notify(e.message, "error");
      return;
    }
    router.push("/bills?tab=cancelled");
  };

  return (
    <div className="app responsive">
      <header className="toolbar screen-only">
        <div className="brand">GST Bill Generator</div>
        <span className="toolbar-title">
          Cancel bill <b>{record.number}</b>
        </span>
        <div className="spacer" />
        <span className={`status ${record.status === "finished" ? "ok" : "warn"}`}>{BILL_STATUS[record.status]}</span>
        <div className="toolbar-main">
          <button type="button" onClick={discard}>
            Discard
          </button>
          <button type="button" className="primary danger" onClick={markCancelled}>
            Mark as Cancelled
          </button>
        </div>
      </header>

      <section className="cancel-panel screen-only" aria-labelledby="cancel-title">
        <h2 id="cancel-title">Cancel Details</h2>
        <fieldset className="cancel-reasons">
          <legend>Cancel reason *</legend>
          {CANCEL_REASONS.map((r) => (
            <label key={r} className={`cancel-option ${reason === r ? "active" : ""}`}>
              <input
                type="radio"
                name="cancel-reason"
                value={r}
                checked={reason === r}
                onChange={() => {
                  setReason(r);
                  setError("");
                }}
              />
              {r}
            </label>
          ))}
        </fieldset>
        <label className="cancel-note">
          <span>Reason details{reason === "Other" ? " *" : ""}</span>
          <textarea
            value={note}
            rows={3}
            maxLength={1000}
            placeholder="Explain why this bill is being cancelled"
            onChange={(e) => {
              setNote(e.target.value);
              setError("");
            }}
          />
        </label>
        {error ? (
          <div className="form-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}
        <p className="register-note">
          The bill below cannot be changed here. Mark as Cancelled moves it to Cancelled Bills with this reason and the
          current date and time (IST).
        </p>
      </section>

      <InvoiceSheet inv={inv} calc={calc} setInv={noop} sheetRef={null} printLayout={null} qr={qr} readOnly />

      {toastNode}
    </div>
  );
}
