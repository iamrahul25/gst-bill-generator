"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calcInvoice, normalizeInvoice } from "../lib/invoice";
import InvoiceSheet from "./InvoiceSheet";
import { printWithTitle, upiLinkFor, usePrintLayout, useQr } from "./print";

const noop = () => {};

// Renders a saved bill for printing only and opens the print dialog once its
// UPI QR code (if any) is ready. Cancelled bills print with a watermark and a
// last page with the cancellation details.
export default function BillPrint({ record, onDone }) {
  const sheetRef = useRef(null);
  const printLayout = usePrintLayout(sheetRef);
  const inv = useMemo(() => normalizeInvoice(record.data), [record]);
  const calc = useMemo(() => calcInvoice(inv), [inv]);
  const link = upiLinkFor(inv, calc.total);
  const qr = useQr(link);
  const [waited, setWaited] = useState(false);
  const ready = !link || Boolean(qr) || waited;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const printedRef = useRef(false);

  useEffect(() => {
    if (!ready || printedRef.current) return undefined;
    const after = () => {
      printedRef.current = true;
      doneRef.current?.();
    };
    window.addEventListener("afterprint", after, { once: true });
    const cancelled = record.status === "cancelled" ? " (CANCELLED)" : "";
    const cancelPrint = printWithTitle(`${[inv.number, inv.client.name].filter(Boolean).join(" - ")}${cancelled}`);
    return () => {
      cancelPrint();
      window.removeEventListener("afterprint", after);
    };
  }, [ready, inv, record.status]);

  return (
    <div className="print-only print-host">
      <InvoiceSheet
        inv={inv}
        calc={calc}
        setInv={noop}
        sheetRef={sheetRef}
        printLayout={printLayout}
        qr={qr}
        readOnly
        cancel={record.status === "cancelled" ? record.cancel : null}
      />
    </div>
  );
}
