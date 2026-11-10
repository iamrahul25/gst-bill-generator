"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BILL_STATUS, formatDate, formatIST, money } from "../lib/invoice";
import BillPrint from "./BillPrint";
import { byInvoiceDate, useGstData } from "./gstData";
import { ConfirmDialog, useToast } from "./ui";

const TABS = ["unfinished", "finished", "cancelled"];

const TAB_LABELS = {
  unfinished: "Unfinished Bills",
  finished: "Finished Bills",
  cancelled: "Cancelled Bills",
};

const EMPTY = {
  unfinished: "No unfinished bills. Bills saved from the billing page appear here.",
  finished: "No finished bills yet.",
  cancelled: "No cancelled bills.",
};

export default function SavedBills() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.includes(params.get("tab")) ? params.get("tab") : "unfinished";
  const [data, save] = useGstData();
  const [query, setQuery] = useState("");
  const [printing, setPrinting] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [toastNode, notify] = useToast();

  if (!data) return <div className="loading">Loading…</div>;

  const counts = Object.fromEntries(TABS.map((t) => [t, data.bills.filter((r) => r.status === t).length]));
  const q = query.trim().toLowerCase();
  const rows = data.bills
    .filter((r) => r.status === tab)
    .filter(
      (r) =>
        !q ||
        `${r.number} ${r.data.client.name} ${r.data.client.phone} ${r.data.business.name}`.toLowerCase().includes(q)
    )
    .sort(byInvoiceDate);

  const setStatus = (rec, patch, message) => {
    try {
      save(
        "bills",
        data.bills.map((r) => (r.id === rec.id ? { ...r, ...patch } : r))
      );
      notify(message);
    } catch (e) {
      notify(e.message, "error");
    }
    setConfirming(null);
  };

  const finish = (rec) =>
    setConfirming({
      title: `Finish bill ${rec.number}?`,
      message: "Once finished, this bill cannot be edited again. It moves to Finished Bills.",
      confirmLabel: "Finish Bill",
      onConfirm: () => setStatus(rec, { status: "finished", finishedAt: Date.now() }, `Bill ${rec.number} finished.`),
    });

  const restore = (rec) =>
    setConfirming({
      title: `Move bill ${rec.number} to Unfinished?`,
      message: "The bill moves back to Unfinished Bills with all its details. Its cancellation reason, date and time are removed.",
      confirmLabel: "Move to Unfinished",
      onConfirm: () =>
        setStatus(
          rec,
          { status: "unfinished", cancel: undefined, finishedAt: undefined },
          `Bill ${rec.number} moved to Unfinished.`
        ),
    });

  const print = (rec) => setPrinting({ rec, key: Date.now() });

  return (
    <div className="app responsive bills-app">
      <header className="toolbar screen-only">
        <div className="brand">GST Bill Generator</div>
        <Link href="/" className="toolbar-link">
          ← Back to Billing
        </Link>
        <div className="spacer" />
        <input
          className="bills-search"
          type="search"
          placeholder="Search invoice no., customer or business"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <main className="bills-wrap screen-only">
        <h1 className="bills-title">Saved Bills</h1>
        <div className="bills-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === tab}
              className={`bills-tab ${t} ${t === tab ? "active" : ""}`}
              onClick={() => router.replace(`/bills?tab=${t}`)}
            >
              {TAB_LABELS[t]} <span className="bills-count">{counts[t]}</span>
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="bills-empty">{q ? "No bills match your search." : EMPTY[tab]}</p>
        ) : (
          <div className="bills-table-wrap">
            <table className="bills-table">
              <thead>
                <tr>
                  <th>Invoice No.</th>
                  <th>Invoice Date</th>
                  <th>Customer</th>
                  <th>Business</th>
                  <th className="num">Amount</th>
                  {tab === "cancelled" ? <th>Cancelled</th> : null}
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="b-number" data-label="Invoice No.">
                      {r.number}
                    </td>
                    <td data-label="Invoice Date">{formatDate(r.data.date)}</td>
                    <td data-label="Customer">
                      <div>{r.data.client.name || "—"}</div>
                      {r.data.client.phone ? <div className="b-sub">{r.data.client.phone}</div> : null}
                    </td>
                    <td data-label="Business">{r.data.business.name}</td>
                    <td className="num" data-label="Amount">
                      ₹ {money(r.total)}
                    </td>
                    {tab === "cancelled" ? (
                      <td data-label="Cancelled">
                        <div>{r.cancel?.reason}</div>
                        <div className="b-sub">{formatIST(r.cancel?.at)}</div>
                      </td>
                    ) : null}
                    <td className="b-actions">
                      {r.status === "unfinished" ? (
                        <>
                          <button type="button" onClick={() => print(r)}>
                            Print
                          </button>
                          <Link href={`/bills/${r.id}/edit`} className="btn">
                            Edit
                          </Link>
                          <Link href={`/bills/${r.id}/cancel`} className="btn danger-text">
                            Cancel
                          </Link>
                          <button type="button" className="ok-btn" onClick={() => finish(r)}>
                            Finish
                          </button>
                        </>
                      ) : null}
                      {r.status === "finished" ? (
                        <>
                          <Link href={`/bills/${r.id}/cancel`} className="btn danger-text">
                            Cancel
                          </Link>
                          <button type="button" onClick={() => print(r)}>
                            Print
                          </button>
                        </>
                      ) : null}
                      {r.status === "cancelled" ? (
                        <>
                          <button type="button" onClick={() => print(r)}>
                            Print
                          </button>
                          <button type="button" onClick={() => restore(r)}>
                            Move to Unfinished
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="bills-foot">
          {BILL_STATUS[tab]} bills: {counts[tab]}. Saved bills can never be deleted.
        </p>
      </main>

      {printing ? <BillPrint key={printing.key} record={printing.rec} onDone={() => setPrinting(null)} /> : null}

      {confirming ? <ConfirmDialog {...confirming} onCancel={() => setConfirming(null)} /> : null}

      {toastNode}
    </div>
  );
}
