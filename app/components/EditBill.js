"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BILL_STATUS,
  bizSnapshot,
  calcInvoice,
  emptyBusiness,
  emptyClient,
  gstBillErrors,
  normalizeInvoice,
} from "../lib/invoice";
import { useGstData } from "./gstData";
import { CustomerPicker } from "./GstPickers";
import InvoiceSheet from "./InvoiceSheet";
import { upiLinkFor, useQr } from "./print";
import { ConfirmDialog, useToast } from "./ui";

export function BillUnavailable({ record, action }) {
  return (
    <div className="app responsive bills-app">
      <header className="toolbar screen-only">
        <div className="brand">GST Bill Generator</div>
        <Link href="/bills" className="toolbar-link">
          ← Saved Bills
        </Link>
      </header>
      <p className="bills-empty">
        {record
          ? `Bill ${record.number} is ${BILL_STATUS[record.status].toLowerCase()} and cannot be ${action}.`
          : "This bill was not found on this device."}
      </p>
    </div>
  );
}

// GSTIN, business name, invoice number and invoice date stay as saved; every
// other field can change. Leaving the page without saving discards changes.
export default function EditBill({ id }) {
  const router = useRouter();
  const [data, save] = useGstData();
  const [inv, setInv] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [asking, setAsking] = useState(false);
  const [toastNode, notify] = useToast();
  const record = data?.bills.find((r) => r.id === id);
  const editable = record?.status === "unfinished";

  useEffect(() => {
    if (editable && !inv) setInv(normalizeInvoice(record.data));
  }, [editable, inv, record]);

  const calc = useMemo(() => (inv ? calcInvoice(inv) : null), [inv]);
  const qr = useQr(upiLinkFor(inv, calc?.total));

  if (!data) return <div className="loading">Loading…</div>;
  if (!editable) return <BillUnavailable record={record} action="edited" />;
  if (!inv) return <div className="loading">Loading…</div>;

  const back = () => router.push("/bills?tab=unfinished");
  const saved = record.data;
  const problems = gstBillErrors(inv);
  const errorKeys = showErrors ? new Set(problems.map(([k]) => k)) : null;

  const profile =
    data.businesses.find((b) => b.id === inv.business.id) || data.businesses.find((b) => b.gstin === saved.business.gstin);
  const latestBiz = profile ? { ...bizSnapshot(profile), gstin: saved.business.gstin, name: saved.business.name } : null;
  const bizOutdated =
    latestBiz && Object.keys(emptyBusiness()).some((k) => (latestBiz[k] ?? "") !== (inv.business[k] ?? ""));

  const askSave = () => {
    if (problems.length) {
      setShowErrors(true);
      notify(`Fill the required fields: ${[...new Set(problems.map(([, l]) => l))].join(", ")}.`, "error");
      return;
    }
    setAsking(true);
  };

  const commit = () => {
    const next = {
      ...inv,
      number: record.number,
      numberIssued: true,
      date: saved.date,
      business: { ...inv.business, gstin: saved.business.gstin, name: saved.business.name },
    };
    try {
      const now = Date.now();
      save(
        "bills",
        data.bills.map((r) => (r.id === id ? { ...r, savedAt: now, total: calcInvoice(next).total, data: next } : r))
      );
    } catch (e) {
      setAsking(false);
      notify(e.message, "error");
      return;
    }
    back();
  };

  return (
    <div className="app responsive">
      <header className="toolbar screen-only">
        <div className="brand">GST Bill Generator</div>
        <span className="toolbar-title">
          Editing bill <b>{record.number}</b>
        </span>
        <div className="spacer" />
        <span className="status warn">Unfinished</span>
        <div className="toolbar-main">
          <button type="button" onClick={back}>
            Discard
          </button>
          <button type="button" className="primary" onClick={askSave}>
            Save
          </button>
        </div>
      </header>

      <InvoiceSheet
        inv={inv}
        calc={calc}
        setInv={setInv}
        sheetRef={null}
        printLayout={null}
        qr={qr}
        lockDate
        errors={errorKeys}
        bizPicker={
          <div className="picker-bar locked-bar screen-only">
            <span className="picker-label">Business</span>
            <span className="locked-value">
              {saved.business.name} · {saved.business.gstin}
            </span>
            {bizOutdated ? (
              <button
                type="button"
                className="picker-btn"
                onClick={() => setInv((p) => ({ ...p, business: latestBiz }))}
                title="Copy the current address, phones, bank details, logo and terms from the business profile"
              >
                Use latest business details
              </button>
            ) : null}
            <span className="picker-note">GSTIN, business name, invoice no. and date cannot be changed.</span>
          </div>
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

      {asking ? (
        <ConfirmDialog
          title={`Save changes to bill ${record.number}?`}
          message="Save keeps all the changes you made. Discard throws them away and returns to Unfinished Bills."
          confirmLabel="Save"
          cancelLabel="Discard"
          onConfirm={commit}
          onCancel={back}
          onClose={() => setAsking(false)}
        />
      ) : null}

      {toastNode}
    </div>
  );
}
