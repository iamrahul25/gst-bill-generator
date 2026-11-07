"use client";

import { useLayoutEffect, useRef } from "react";
import { STATES, formatDate, formatTime } from "../lib/invoice";

export function Input({ value, onChange, className = "", numeric, ...rest }) {
  return (
    <input
      className={`field screen-only ${className}`}
      value={value ?? ""}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => {
        const v = e.target.value;
        if (numeric && !/^\d*\.?\d*$/.test(v)) return;
        onChange(v);
      }}
      {...rest}
    />
  );
}

export function AutoTextarea({ value, onChange, className = "", minRows = 1, ...rest }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      className={`field area screen-only ${className}`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function Field({ printClassName = "", printValue, ...props }) {
  return (
    <>
      <Input {...props} />
      {props.value ? <span className={`print-only ${printClassName}`}>{printValue ?? props.value}</span> : null}
    </>
  );
}

export function TextArea({ printClassName = "", ...props }) {
  return (
    <>
      <AutoTextarea {...props} />
      {props.value ? <div className={`print-only pre ${printClassName}`}>{props.value}</div> : null}
    </>
  );
}

export function DateField({ value, onChange, min }) {
  return (
    <>
      <input
        type="date"
        className="field screen-only"
        value={value || ""}
        min={min}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? <span className="print-only">{formatDate(value)}</span> : null}
    </>
  );
}

export function TimeField({ value, onChange }) {
  return (
    <>
      <input type="time" className="field screen-only" value={value || ""} onChange={(e) => onChange(e.target.value)} />
      {value ? <span className="print-only">{formatTime(value)}</span> : null}
    </>
  );
}

export function StateSelect({ value, onChange, placeholder = "Select state", className = "" }) {
  return (
    <select
      className={`field select screen-only ${className} ${value ? "" : "empty"}`}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {STATES.map(([code, name]) => (
        <option key={code} value={code}>
          {code} - {name}
        </option>
      ))}
    </select>
  );
}

async function fileToDataUrl(file, maxW, maxH) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImageUpload({ value, onChange, label, hint, maxW = 400, maxH = 400, className = "" }) {
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file (PNG or JPG).");
      return;
    }
    try {
      onChange(await fileToDataUrl(file, maxW, maxH));
    } catch {
      alert("Could not read that image. Try a PNG or JPG file.");
    }
  };

  return (
    <div className={`image-upload ${value ? "has-image" : "screen-only"} ${className}`}>
      {value ? (
        <>
          <img src={value} alt={label} />
          <div className="image-actions screen-only">
            <button type="button" onClick={() => inputRef.current?.click()}>
              Change
            </button>
            <button type="button" onClick={() => onChange("")}>
              Remove
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="image-placeholder" onClick={() => inputRef.current?.click()}>
          <span className="upload-icon">⬆</span>
          <span className="upload-label">{label}</span>
          {hint ? <span className="upload-hint">{hint}</span> : null}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFile} />
    </div>
  );
}
