"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import QRCode from "qrcode";

// Preview reuses the real print styles by copying the rules of every
// `@media print` block into a screen stylesheet. Rules that must only apply
// to real printing live in `@media only print` blocks, which are not copied.
export function printRulesCss() {
  let css = "";
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule && rule.media.mediaText === "print") {
        for (const inner of rule.cssRules) css += `${inner.cssText}\n`;
      }
    }
  }
  return css;
}

// A4 height minus the 10mm @page margins, in CSS px.
const PAGE_HEIGHT_PX = (277 * 96) / 25.4;
const PAGE_SAFETY_PX = 14;

// Lays the sheet out with the print rules applied on screen and decides where
// item rows break onto a new page, plus how much blank space (with column
// lines) each page needs so the items table reaches the bottom of the page and
// the totals sit at the bottom of the last page. Returns null for one-page bills.
//
// Print lays out at one device pixel per CSS px, but on a scaled display (125%,
// 150%, browser zoom) borders and line heights snap to device pixels and rows
// measure shorter than they print. Zooming the sheet by 1/devicePixelRatio
// while measuring restores the print geometry.
export function measurePages(sheet) {
  if (!sheet) return null;
  const style = document.createElement("style");
  style.textContent = printRulesCss();
  document.head.appendChild(style);
  const app = sheet.closest(".app");
  const responsive = app?.classList.contains("responsive");
  if (responsive) app.classList.remove("responsive");
  const zoom = 1 / (window.devicePixelRatio || 1);
  sheet.style.width = "190mm";
  sheet.style.zoom = String(zoom);
  try {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top / zoom, bottom: r.bottom / zoom, height: r.height / zoom };
    };
    const items = sheet.querySelector("table.items");
    const totalTop = rect(items.querySelector(".items-total")).top;
    const bodyTop = rect(sheet.tBodies[0]).top;
    const tops = [...items.querySelectorAll("tr[data-row]")]
      .filter((el) => el.getClientRects().length)
      .map((el) => ({ i: Number(el.dataset.row), top: rect(el).top }));
    if (!tops.length) return null;
    const rows = tops.map((r, k) => ({ i: r.i, h: (tops[k + 1]?.top ?? totalTop) - r.top }));

    const avail = PAGE_HEIGHT_PX - rect(sheet.tHead).height - rect(sheet.tFoot).height - PAGE_SAFETY_PX;
    const itemsHeadH = rect(items.tHead).height;
    const tailH = rect(sheet.querySelector(".cont-cover")).bottom - totalTop;
    const breaks = [];
    const fills = {};
    let used = tops[0].top - bodyTop;
    rows.forEach((r, k) => {
      const need = r.h + (k === rows.length - 1 ? tailH : 0);
      if (k > 0 && used + need > avail) {
        fills[rows[k - 1].i] = avail - used;
        breaks.push(r.i);
        used = itemsHeadH;
      }
      used += r.h;
    });
    if (!breaks.length) return null;
    const rest = avail - used - tailH;
    if (rest > 0) fills[rows.at(-1).i] = rest;
    return { breaks, fills };
  } finally {
    style.remove();
    if (responsive) app.classList.add("responsive");
    sheet.style.width = "";
    sheet.style.zoom = "";
  }
}

export function usePrintLayout(sheetRef) {
  const [printLayout, setPrintLayout] = useState(null);
  useEffect(() => {
    const onBefore = () => {
      flushSync(() => setPrintLayout(null));
      const layout = measurePages(sheetRef.current);
      if (layout) flushSync(() => setPrintLayout(layout));
    };
    const onAfter = () => setPrintLayout(null);
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, [sheetRef]);
  return printLayout;
}

export function usePreview(preview, onExit) {
  useEffect(() => {
    if (!preview) return;
    const style = document.createElement("style");
    style.media = "screen";
    style.textContent = printRulesCss();
    document.head.appendChild(style);
    window.scrollTo(0, 0);
    const root = document.documentElement;
    const fit = () => {
      const a4 = (210 * 96) / 25.4;
      root.style.setProperty("--preview-zoom", String(Math.min(1, (root.clientWidth - 24) / a4)));
    };
    fit();
    const onKey = (e) => e.key === "Escape" && onExit();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", fit);
    return () => {
      style.remove();
      root.style.removeProperty("--preview-zoom");
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", fit);
    };
  }, [preview, onExit]);
}

export function upiLinkFor(inv, total) {
  const upiId = inv?.business.upiId?.trim() ?? "";
  if (!inv || !upiId || !(total > 0)) return "";
  return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(inv.business.name || upiId)}&am=${total.toFixed(
    2
  )}&cu=INR&tn=${encodeURIComponent(`Invoice ${inv.number}`)}`;
}

export function useQr(link) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!link) {
      setQr("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: 300, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(""));
    return () => {
      cancelled = true;
    };
  }, [link]);
  return qr;
}

// Returns a function that calls the print off (if it has not opened yet).
export function printWithTitle(title) {
  const prevTitle = document.title;
  const restore = () => (document.title = prevTitle);
  document.title = title || prevTitle;
  window.addEventListener("afterprint", restore, { once: true });
  const timer = setTimeout(() => window.print(), 100);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("afterprint", restore);
    restore();
  };
}
