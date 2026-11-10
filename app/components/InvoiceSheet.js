"use client";

import { Fragment } from "react";
import {
  CANCEL_REASONS,
  COPY_LABELS,
  GST_RATES,
  amountInWords,
  emptyItem,
  formatDate,
  formatIST,
  isBlankItem,
  isValidGstin,
  money,
  num,
  panFromGstin,
  stateFromGstin,
  stateLabel,
  stateName,
} from "../lib/invoice";
import { AutoTextarea, DateField, Field, ImageUpload, Input, StateSelect, TextArea, TimeField } from "./fields";

export const BANK_FIELDS = [
  ["accountName", "Account Name"],
  ["bankName", "Bank Name"],
  ["accountNumber", "Account No."],
  ["ifsc", "IFSC"],
  ["branch", "Branch"],
  ["upiId", "UPI ID"],
];

const TRANSPORT_MODES = ["By Road", "By Hand", "M. Bike", "Tempo", "Truck", "Courier", "Rail", "Air"];

const GSTIN_HINT = "GSTIN looks incorrect (15 characters, e.g. 29ABCDE1234F1Z5)";

function PhoneIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        fill="currentColor"
        d="M9.1 6.6c.3-.3.8-.3 1 .1l1.1 1.9c.2.3.1.7-.1 1l-.8.8a7.4 7.4 0 0 0 3.3 3.3l.8-.8c.3-.3.7-.3 1-.1l1.9 1.1c.4.2.4.7.1 1l-.9.9c-.6.6-1.5.8-2.3.5a10.6 10.6 0 0 1-6.4-6.4c-.3-.8-.1-1.7.5-2.3z"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
      />
    </svg>
  );
}

function DetailRow({ label, show = true, full, children }) {
  return (
    <div className={`detail-row ${full ? "full" : ""} ${show ? "" : "screen-only"}`}>
      <span className="detail-label">{label}</span>
      <span className="detail-colon">:</span>
      <div className="detail-value">{children}</div>
    </div>
  );
}

function ReceiverBox({ picker, party, onChange, gst, required, err }) {
  const gstinInvalid = gst && party.gstin && !isValidGstin(party.gstin);
  const mark = required ? " *" : "";

  return (
    <div className="box rounded receiver">
      {picker}
      <div className="detail-grid">
        <DetailRow label="Name" full>
          <Field
            value={party.name}
            onChange={(v) => onChange("name", v)}
            placeholder={`Customer / Company Name${mark}`}
            className={`strong ${err("client.name") ? "invalid" : ""}`}
            printClassName="strong"
          />
        </DetailRow>
        <DetailRow label="Address" full show={Boolean(party.address)}>
          <TextArea
            value={party.address}
            onChange={(v) => onChange("address", v)}
            placeholder="Street / building / area"
          />
        </DetailRow>
        <DetailRow label="City" show={Boolean(party.city)}>
          <Field value={party.city} onChange={(v) => onChange("city", v)} placeholder="City / Village" />
        </DetailRow>
        <DetailRow label="PIN Code" show={Boolean(party.pincode)}>
          <Field
            value={party.pincode}
            onChange={(v) => onChange("pincode", v.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit PIN"
            inputMode="numeric"
          />
        </DetailRow>
        <DetailRow label="State" show={Boolean(party.state)}>
          <StateSelect value={party.state} onChange={(v) => onChange("state", v)} />
          {party.state ? <span className="print-only">{stateName(party.state)}</span> : null}
        </DetailRow>
        <DetailRow label="State Code" show={Boolean(party.state)}>
          <span className={`static-value ${party.state ? "" : "muted"}`}>{party.state || "—"}</span>
        </DetailRow>
        {gst ? (
          <DetailRow label="GSTIN" show={Boolean(party.gstin)}>
            <Field
              value={party.gstin}
              onChange={(v) => onChange("gstin", v)}
              placeholder="GSTIN (optional)"
              maxLength={15}
              className={gstinInvalid ? "invalid" : ""}
              printClassName="strong"
            />
            {gstinInvalid ? <div className="hint error screen-only">{GSTIN_HINT}</div> : null}
          </DetailRow>
        ) : null}
        <DetailRow label="Mob." show={Boolean(party.phone)}>
          <Field
            value={party.phone}
            onChange={(v) => onChange("phone", v)}
            placeholder={`Mobile${mark}`}
            inputMode="tel"
            className={err("client.phone") ? "invalid" : ""}
          />
        </DetailRow>
        <DetailRow label="Email" full show={Boolean(party.email)}>
          <Field value={party.email} onChange={(v) => onChange("email", v)} placeholder="Email" inputMode="email" />
        </DetailRow>
      </div>
    </div>
  );
}

function TaxPair({ group }) {
  return (
    <>
      <tr>
        <th>Output CGST {group.rate / 2} %</th>
        <td className="num">{money(group.cgst)}</td>
      </tr>
      <tr>
        <th>Output SGST {group.rate / 2} %</th>
        <td className="num">{money(group.sgst)}</td>
      </tr>
    </>
  );
}

function StaticImage({ src, alt, className }) {
  if (!src) return null;
  return (
    <div className={`image-upload has-image ${className}`}>
      <img src={src} alt={alt} />
    </div>
  );
}

// One bill laid out as it prints. In GST mode the business comes from a
// registered profile and is shown as text; Non-GST bills type it in place.
// `readOnly` locks every field, `lockDate` only the invoice date.
export default function InvoiceSheet({
  inv,
  calc,
  setInv,
  sheetRef,
  printLayout,
  qr,
  bizEditable = false,
  bankEditable = bizEditable,
  bizPicker = null,
  clientPicker = null,
  readOnly = false,
  lockDate = false,
  errors = null,
  cancel = null,
  numberPlaceholder = "Number will generate after you save this bill",
}) {
  const gst = inv.gstEnabled;
  const b = inv.business;
  const c = inv.client;
  const err = (key) => Boolean(errors?.has(key));
  const hasBank = BANK_FIELDS.some(([k]) => b[k]?.trim());
  const filledItems = inv.items.filter((it) => !isBlankItem(it));
  const totalQty = filledItems.reduce((s, it) => s + num(it.qty), 0);
  const units = [...new Set(filledItems.map((it) => it.unit.trim()).filter(Boolean))];
  const qtyUnit = units.length === 1 ? units[0] : "";
  const termLines = b.terms
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  const tailStart = Math.max(
    inv.items.findLastIndex((it) => !isBlankItem(it)),
    0
  );

  const update = (patch) => setInv((p) => ({ ...p, ...patch }));

  const updateParty = (party) => (field, value) =>
    setInv((p) => {
      const next = { ...p[party], [field]: value };
      if (field === "gstin") {
        next.gstin = value.toUpperCase().replace(/\s/g, "");
        const st = stateFromGstin(next.gstin);
        if (st && !p[party].state) next.state = st;
        const prev = p[party];
        if ("pan" in prev && (!prev.pan || prev.pan === panFromGstin(prev.gstin))) next.pan = panFromGstin(next.gstin);
      }
      return { ...p, [party]: next };
    });
  const setBiz = updateParty("business");
  const setClient = updateParty("client");

  const setItem = (id, field, value) =>
    setInv((p) => ({ ...p, items: p.items.map((it) => (it.id === id ? { ...it, [field]: value } : it)) }));
  const addItem = () =>
    setInv((p) => ({
      ...p,
      items: [...p.items, { ...emptyItem(), gstRate: p.items.at(-1)?.gstRate ?? "18" }],
    }));
  const removeItem = (id) =>
    setInv((p) => ({
      ...p,
      items: p.items.length > 1 ? p.items.filter((it) => it.id !== id) : [emptyItem()],
    }));

  const bizAddressLine = [
    b.address
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(", "),
    [b.city, b.pincode].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join(", ");
  const bizExtras = [
    b.state && `State: ${stateLabel(b.state)}`,
    b.pan && `PAN: ${b.pan}`,
    b.email && `Email: ${b.email}`,
  ].filter(Boolean);
  const showBank = bankEditable || hasBank || (qr && inv.showQr);

  const itemRow = (it, i) => {
    const l = calc.lines[i];
    const fill = printLayout?.fills[i];
    const rowClass = [
      isBlankItem(it) && "blank-row",
      err(`item.${it.id}`) && "row-invalid",
      printLayout?.breaks.includes(i) && "page-start",
      printLayout && i in printLayout.fills && !(fill > 0) && "page-end",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <Fragment key={it.id}>
        <tr data-row={i} className={rowClass}>
          <td className="c-sn">{i + 1}</td>
          <td className="c-desc" data-label="Product Name">
            <TextArea
              value={it.description}
              onChange={(v) => setItem(it.id, "description", v)}
              placeholder="Product name / description"
            />
          </td>
          <td className="c-serial" data-label="Product Serial No.">
            <TextArea value={it.serial} onChange={(v) => setItem(it.id, "serial", v)} placeholder="Serial no." />
          </td>
          <td className="c-qty" data-label="Qty / Unit">
            <div className="qty-unit screen-only">
              <Input numeric value={it.qty} onChange={(v) => setItem(it.id, "qty", v)} placeholder="0" />
              <Input value={it.unit} onChange={(v) => setItem(it.id, "unit", v)} placeholder="Unit" />
            </div>
            <span className="print-only">
              {it.qty} {it.unit}
            </span>
          </td>
          {gst ? (
            <td className="c-hsn" data-label="HSN/SAC">
              <Field value={it.hsn} onChange={(v) => setItem(it.id, "hsn", v)} placeholder="HSN" />
            </td>
          ) : null}
          {gst ? (
            <td className="c-gst" data-label="GST">
              <select
                className="field select screen-only"
                value={it.gstRate}
                onChange={(e) => setItem(it.id, "gstRate", e.target.value)}
              >
                {GST_RATES.map((r) => (
                  <option key={r} value={String(r)}>
                    {r} %
                  </option>
                ))}
              </select>
              <span className="print-only">{l.rate} %</span>
            </td>
          ) : null}
          <td className="c-rate num" data-label="Unit Price">
            <Field
              numeric
              value={it.rate}
              printValue={money(num(it.rate))}
              onChange={(v) => setItem(it.id, "rate", v)}
              placeholder="0.00"
            />
          </td>
          <td className="c-amt num" data-label={gst ? "Total Taxable Value" : "Amount"}>
            {money(l.taxable)}
          </td>
          <td className="c-del screen-only">
            <button
              type="button"
              className="icon-btn"
              onClick={() => removeItem(it.id)}
              title="Remove item"
              aria-label={`Remove item ${i + 1}`}
            >
              ×
            </button>
          </td>
        </tr>
        {fill ? (
          <tr className="fill-row print-only" aria-hidden="true">
            <td className="c-sn" style={{ height: fill }} />
            <td className="c-desc" />
            <td className="c-serial" />
            <td className="c-qty" />
            {gst ? <td className="c-hsn" /> : null}
            {gst ? <td className="c-gst" /> : null}
            <td className="c-rate" />
            <td className="c-amt" />
          </tr>
        ) : null}
      </Fragment>
    );
  };

  const bizHead = bizEditable ? (
    <>
      <div className="inv-head-bar">
        <div className="head-gstin" />
        <DocTab inv={inv} update={update} gst={gst} />
        <div className="head-phone">
          <span className={b.phone ? "" : "screen-only"}>
            <PhoneIcon />
          </span>
          <Field value={b.phone} onChange={(v) => setBiz("phone", v)} placeholder="Phone" inputMode="tel" />
        </div>
      </div>
      <div className="inv-head-body">
        <ImageUpload
          value={b.logo}
          onChange={(v) => setBiz("logo", v)}
          label="Upload Logo"
          hint="PNG / JPG"
          className="logo"
          maxW={600}
          maxH={300}
        />
        <div className="inv-head-main">
          <Field
            value={b.name}
            onChange={(v) => setBiz("name", v)}
            placeholder="YOUR BUSINESS NAME"
            className="biz-title"
            printClassName="biz-title"
          />
          <Field
            value={b.tagline}
            onChange={(v) => setBiz("tagline", v)}
            placeholder="What you deal in, e.g. PLYWOOD, LAMINATES, FLUSH DOOR ETC."
            className="biz-tagline"
            printClassName="biz-tagline"
          />
          <div className="detail-grid biz-form screen-only">
            <DetailRow label="Address" full>
              <AutoTextarea value={b.address} onChange={(v) => setBiz("address", v)} placeholder="Street / building / area" />
            </DetailRow>
            <DetailRow label="City">
              <Input value={b.city} onChange={(v) => setBiz("city", v)} placeholder="City / Village" />
            </DetailRow>
            <DetailRow label="PIN Code">
              <Input
                value={b.pincode}
                onChange={(v) => setBiz("pincode", v.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit PIN"
                inputMode="numeric"
              />
            </DetailRow>
            <DetailRow label="State">
              <StateSelect value={b.state} onChange={(v) => setBiz("state", v)} />
            </DetailRow>
            <DetailRow label="State Code">
              <span className={`static-value ${b.state ? "" : "muted"}`}>{b.state || "—"}</span>
            </DetailRow>
            <DetailRow label="PAN">
              <Input
                value={b.pan}
                onChange={(v) => setBiz("pan", v.toUpperCase().replace(/\s/g, ""))}
                placeholder="Optional (auto from GSTIN)"
                maxLength={10}
              />
            </DetailRow>
            <DetailRow label="Email">
              <Input value={b.email} onChange={(v) => setBiz("email", v)} placeholder="Optional" inputMode="email" />
            </DetailRow>
          </div>
          {bizAddressLine ? (
            <div className="print-only">
              <div className="biz-address">
                <PinIcon />
                <span>{bizAddressLine}</span>
              </div>
            </div>
          ) : null}
          {bizExtras.length ? <div className="print-only biz-extra">{bizExtras.join("  |  ")}</div> : null}
        </div>
      </div>
    </>
  ) : (
    <>
      <div className="inv-head-bar">
        <div className="head-gstin">
          {b.gstin ? (
            <>
              <span>GSTIN :</span>
              <span>{b.gstin}</span>
            </>
          ) : null}
        </div>
        <DocTab inv={inv} update={update} gst={gst} />
        <div className="head-phone">
          {b.phone ? (
            <>
              <PhoneIcon />
              <span>{b.phone}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="inv-head-body">
        <StaticImage src={b.logo} alt="Logo" className="logo" />
        <div className="inv-head-main">
          {b.name ? (
            <div className="biz-title">{b.name}</div>
          ) : (
            <div className={`biz-empty screen-only ${err("business") ? "invalid" : ""}`}>
              Select a registered business above to fill these details.
            </div>
          )}
          {b.tagline ? <div className="biz-tagline">{b.tagline}</div> : null}
          {bizAddressLine ? (
            <div className="biz-address">
              <PinIcon />
              <span>{bizAddressLine}</span>
            </div>
          ) : null}
          {bizExtras.length ? <div className="biz-extra">{bizExtras.join("  |  ")}</div> : null}
        </div>
      </div>
    </>
  );

  return (
    <main className="paper-wrap">
      <article className={`paper ${readOnly ? "locked" : ""}`}>
        {cancel ? (
          <div className="watermark print-only" aria-hidden="true">
            CANCELLED
          </div>
        ) : null}
        <table className={`sheet ${bizEditable ? "" : "gst-bill"}`} ref={sheetRef}>
          <thead>
            <tr>
              <td>
                <fieldset className="sheet-lock" disabled={readOnly}>
                  <header className="box rounded inv-head">
                    {bizPicker}
                    {bizHead}
                  </header>
                  <div className="cont-strip print-only">
                    <div className="cont-bar">
                      <span>
                        <b>Invoice No.:</b> {inv.number}
                        {inv.date ? (
                          <>
                            {"  |  "}
                            <b>Date:</b> {formatDate(inv.date)}
                          </>
                        ) : null}
                      </span>
                      {c.name ? (
                        <span className="cont-client">
                          <b>Bill To:</b> {c.name}
                        </span>
                      ) : null}
                      <span className="cont-note">Continued from previous page</span>
                    </div>
                  </div>
                </fieldset>
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <fieldset className="sheet-lock" disabled={readOnly}>
                  <section className="top-details">
                    <ReceiverBox
                      picker={clientPicker}
                      party={c}
                      onChange={setClient}
                      gst={gst}
                      required={!bizEditable}
                      err={err}
                    />
                    <div className="box rounded meta-box">
                      <DetailRow label="Invoice No.">
                        {bizEditable ? (
                          <Field
                            value={inv.number}
                            onChange={(v) => update({ number: v })}
                            placeholder="INV-0001"
                            className="inv-no"
                            printClassName="inv-no"
                          />
                        ) : (
                          <div className="inv-no-line">
                            {inv.number ? (
                              <span className="inv-no issued">{inv.number}</span>
                            ) : (
                              <span className="inv-no-pending screen-only">{numberPlaceholder}</span>
                            )}
                          </div>
                        )}
                      </DetailRow>
                      <DetailRow label="Date">
                        <DateField
                          value={inv.date}
                          onChange={(v) => update({ date: v })}
                          disabled={lockDate}
                          className={err("date") ? "invalid" : ""}
                        />
                        {lockDate && !readOnly ? <div className="hint screen-only">Locked after the number is issued.</div> : null}
                      </DetailRow>
                      <DetailRow label="Vehicle No." show={Boolean(inv.vehicleNo)}>
                        <Field
                          value={inv.vehicleNo}
                          onChange={(v) => update({ vehicleNo: v.toUpperCase() })}
                          placeholder="e.g. HR05AB1234"
                        />
                      </DetailRow>
                      <DetailRow label="Transportation Mode" show={Boolean(inv.transportMode)}>
                        <Field
                          value={inv.transportMode}
                          onChange={(v) => update({ transportMode: v })}
                          placeholder="e.g. By Road, M. Bike"
                          list="transport-modes"
                        />
                        <datalist id="transport-modes">
                          {TRANSPORT_MODES.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      </DetailRow>
                      <DetailRow label="Time" show={Boolean(inv.time)}>
                        <TimeField value={inv.time} onChange={(v) => update({ time: v })} />
                      </DetailRow>
                      <DetailRow label="Challan No." show={Boolean(inv.challanNo)}>
                        <Field value={inv.challanNo} onChange={(v) => update({ challanNo: v })} placeholder="Challan no." />
                      </DetailRow>
                    </div>
                  </section>
                  {gst ? (
                    <div className={`supply-type screen-only ${calc.inter ? "inter" : ""}`}>
                      {!b.state || !c.state
                        ? "Select the sender's and receiver's state to decide CGST+SGST or IGST."
                        : calc.inter
                          ? "Inter-state supply: IGST applies"
                          : "Intra-state supply: CGST + SGST apply"}
                    </div>
                  ) : null}

                  <table className="items">
                    <thead>
                      <tr>
                        <th className="c-sn">S.No.</th>
                        <th className="c-desc">Product Name</th>
                        <th className="c-serial">Product Serial No.</th>
                        <th className="c-qty">Qty</th>
                        {gst ? <th className="c-hsn">HSN/SAC</th> : null}
                        {gst ? <th className="c-gst">GST</th> : null}
                        <th className="c-rate">Unit Price</th>
                        <th className="c-amt">{gst ? "Total Taxable Value" : "Amount"}</th>
                        <th className="c-del screen-only" />
                      </tr>
                    </thead>
                    {tailStart > 0 ? <tbody>{inv.items.slice(0, tailStart).map((it, i) => itemRow(it, i))}</tbody> : null}
                    <tbody className="items-tail">
                      {inv.items.slice(tailStart).map((it, i) => itemRow(it, tailStart + i))}
                      <tr className="items-total">
                        <td colSpan={3} className="qty-label">
                          Total Quantity
                        </td>
                        <td className="c-qty">
                          {totalQty} {qtyUnit}
                        </td>
                        <td colSpan={gst ? 4 : 2} />
                        <td className="c-del screen-only" />
                      </tr>
                    </tbody>
                  </table>
                  {err("items") ? <div className="hint error screen-only items-hint">Add at least one item.</div> : null}
                  <button type="button" className="add-line screen-only" onClick={addItem}>
                    + Add Line Item
                  </button>

                  <section className="box summary-box">
                    <div className="summary-left">
                      <div className="words-cell">
                        <div className="strong">Total Invoice Amount in Words</div>
                        <div>{amountInWords(calc.total)}</div>
                      </div>
                      {showBank ? (
                        <div className={`bank ${hasBank ? "" : "screen-only"}`}>
                          <div className="label">Payment Details</div>
                          {bankEditable ? (
                            <div className="bank-edit screen-only">
                              {BANK_FIELDS.map(([key, label]) => (
                                <label key={key}>
                                  <span>{label}</span>
                                  <Input
                                    value={b[key]}
                                    onChange={(v) => setBiz(key, key === "ifsc" ? v.toUpperCase() : v)}
                                    placeholder={key === "upiId" ? "yourname@upi" : label}
                                  />
                                </label>
                              ))}
                              <div className="hint">
                                {bizEditable
                                  ? "Saved with your business profile."
                                  : "Changes apply to this bill only; the business profile stays the same."}
                              </div>
                            </div>
                          ) : null}
                          <div className="bank-body">
                            <table className={`bank-print ${bankEditable ? "print-only" : ""}`}>
                              <tbody>
                                {BANK_FIELDS.filter(([k]) => b[k]?.trim()).map(([key, label]) => (
                                  <tr key={key}>
                                    <th>{label}</th>
                                    <td>{b[key]}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {qr && inv.showQr ? (
                              <div className="qr">
                                <img src={qr} alt="UPI payment QR code" />
                                <div>Scan to pay with any UPI app</div>
                              </div>
                            ) : null}
                          </div>
                          {b.upiId?.trim() ? (
                            <label className="check screen-only">
                              <input
                                type="checkbox"
                                checked={inv.showQr}
                                onChange={(e) => update({ showQr: e.target.checked })}
                              />
                              Show UPI QR code for ₹ {money(calc.total)}
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="summary-right">
                      <table className="totals">
                        <tbody>
                          <tr>
                            <th>Sub Total</th>
                            <td className="num">{money(calc.gross)}</td>
                          </tr>
                          <tr className={calc.discount > 0 ? "" : "screen-only"}>
                            <th>Discount</th>
                            <td className="num">
                              <Input numeric value={inv.discount} onChange={(v) => update({ discount: v })} placeholder="0.00" />
                              <span className="print-only">(-) {money(calc.discount)}</span>
                            </td>
                          </tr>
                          <tr className={calc.shipping > 0 ? "" : "screen-only"}>
                            <th>Shipping Charges</th>
                            <td className="num">
                              <Input numeric value={inv.shipping} onChange={(v) => update({ shipping: v })} placeholder="0.00" />
                              <span className="print-only">{money(calc.shipping)}</span>
                            </td>
                          </tr>
                          {calc.discount > 0 || calc.shipping > 0 ? (
                            <tr>
                              <th>{gst ? "Taxable Value" : "Net Amount"}</th>
                              <td className="num">{money(calc.taxable)}</td>
                            </tr>
                          ) : null}
                          {calc.taxGroups.map((g) =>
                            calc.inter ? (
                              <tr key={g.rate}>
                                <th>Output IGST {g.rate} %</th>
                                <td className="num">{money(g.igst)}</td>
                              </tr>
                            ) : (
                              <TaxPair key={g.rate} group={g} />
                            )
                          )}
                          {calc.roundOff !== 0 ? (
                            <tr>
                              <th>Round Off</th>
                              <td className="num">
                                {calc.roundOff > 0 ? "(+)" : "(-)"} {money(Math.abs(calc.roundOff))}
                              </td>
                            </tr>
                          ) : null}
                          <tr className="grand">
                            <th>Total</th>
                            <td className="num">₹ {money(calc.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="sign">
                        <div className="strong">For {b.name || "Your Business"}</div>
                        <div className="sign-images">
                          {bizEditable ? (
                            <>
                              <ImageUpload
                                value={b.stamp}
                                onChange={(v) => setBiz("stamp", v)}
                                label="Upload Stamp"
                                className="stamp"
                                maxW={360}
                                maxH={360}
                              />
                              <ImageUpload
                                value={b.signature}
                                onChange={(v) => setBiz("signature", v)}
                                label="Upload Signature"
                                className="signature"
                                maxW={600}
                                maxH={240}
                              />
                            </>
                          ) : (
                            <>
                              <StaticImage src={b.stamp} alt="Stamp" className="stamp" />
                              <StaticImage src={b.signature} alt="Signature" className="signature" />
                            </>
                          )}
                        </div>
                        <div className="sign-line">Authorised Signatory</div>
                      </div>
                    </div>
                  </section>

                  <section className={`box terms-box ${termLines.length ? "" : "screen-only"}`}>
                    <div className="box-title">Terms &amp; Conditions</div>
                    <ol>
                      {termLines.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ol>
                  </section>
                  <div className="cont-cover print-only" />
                </fieldset>
              </td>
            </tr>
          </tbody>
          <tfoot className="print-only">
            <tr>
              <td>
                <div className="sheet-foot-text">Continued on next page…</div>
              </td>
            </tr>
          </tfoot>
        </table>
        {cancel ? <CancelPage inv={inv} cancel={cancel} total={calc.total} /> : null}
      </article>
    </main>
  );
}

function DocTab({ inv, update, gst }) {
  return (
    <div className="doc-tab">
      <div className="copy-label">
        <select
          className="field select screen-only"
          value={inv.copyLabel}
          onChange={(e) => update({ copyLabel: e.target.value })}
          aria-label="Invoice copy"
        >
          {COPY_LABELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <span className="print-only">{inv.copyLabel}</span>
      </div>
      <div className="doc-title">{gst ? "TAX INVOICE" : "INVOICE"}</div>
    </div>
  );
}

function CancelPage({ inv, cancel, total }) {
  const reason = CANCEL_REASONS.includes(cancel.reason) ? cancel.reason : cancel.reason || "—";
  return (
    <section className="cancel-page print-only">
      <h2>Cancellation Details</h2>
      <table>
        <tbody>
          <tr>
            <th>Invoice No.</th>
            <td>{inv.number}</td>
          </tr>
          <tr>
            <th>Invoice Date</th>
            <td>{formatDate(inv.date)}</td>
          </tr>
          <tr>
            <th>Customer</th>
            <td>{inv.client.name}</td>
          </tr>
          <tr>
            <th>Invoice Amount</th>
            <td>₹ {money(total)}</td>
          </tr>
          <tr>
            <th>Cancelled On</th>
            <td>{formatIST(cancel.at)}</td>
          </tr>
          <tr>
            <th>Cancel Reason</th>
            <td>{reason}</td>
          </tr>
          <tr>
            <th>Details</th>
            <td className="pre">{cancel.note || "—"}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
