"use client";

import { useEffect, useId, useRef, useState } from "react";

// A dropdown of saved profiles with a search box. Each row can be edited
// (and deleted, when `onDelete` is given); `onNew` adds a profile.
export default function Picker({
  label,
  items,
  selectedId,
  placeholder,
  searchPlaceholder = "Search by name",
  newLabel,
  describe = () => "",
  onSelect,
  onNew,
  onEdit,
  onDelete,
  onClear,
  disabled = false,
  disabledNote = "",
  invalid = false,
}) {
  const listId = useId();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = items.find((p) => p.id === selectedId);
  const q = query.trim().toLowerCase();
  const rows = q ? items.filter((p) => `${p.name} ${describe(p)}`.toLowerCase().includes(q)) : items;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => setActive(0), [query, open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (item) => {
    close();
    onSelect(item);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (rows.length ? (i <= 0 ? rows.length - 1 : i - 1) : 0));
    } else if (event.key === "Enter" && rows[active]) {
      event.preventDefault();
      choose(rows[active]);
    }
  };

  return (
    <div className={`picker-bar screen-only ${invalid ? "invalid" : ""}`} ref={wrapRef}>
      <span className="picker-label">{label}</span>
      <button
        type="button"
        className="picker-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        title={disabled ? disabledNote : undefined}
      >
        <span className={selected ? "picker-value" : "picker-value muted"}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {onClear && selectedId && !disabled ? (
        <button type="button" className="picker-btn" onClick={onClear} title="Clear the selection">
          Clear
        </button>
      ) : null}
      <button type="button" className="picker-btn primary" onClick={onNew} disabled={disabled}>
        {newLabel}
      </button>
      {disabled && disabledNote ? <span className="picker-note">{disabledNote}</span> : null}
      {open ? (
        <div className="picker-menu">
          <input
            className="picker-search"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <ul className="picker-list" id={listId} role="listbox">
            {rows.map((item, index) => (
              <li
                key={item.id}
                className={`picker-row ${index === active ? "active" : ""} ${item.id === selectedId ? "selected" : ""}`}
                onMouseEnter={() => setActive(index)}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === selectedId}
                  className="picker-option"
                  onClick={() => choose(item)}
                >
                  <span className="picker-name">{item.name}</span>
                  {describe(item) ? <span className="picker-sub">{describe(item)}</span> : null}
                </button>
                {onEdit ? (
                  <button
                    type="button"
                    className="picker-act"
                    onClick={() => {
                      close();
                      onEdit(item);
                    }}
                  >
                    Edit
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    className="picker-act danger-text"
                    onClick={() => {
                      close();
                      onDelete(item);
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {!rows.length ? (
            <div className="picker-empty">{items.length ? "Nothing matches your search." : "Nothing saved yet."}</div>
          ) : null}
          <button
            type="button"
            className="picker-new-row"
            onClick={() => {
              close();
              onNew();
            }}
          >
            {newLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
