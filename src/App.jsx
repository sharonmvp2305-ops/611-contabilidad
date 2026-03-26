import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ══════════════════════════════════════════════════════════════
// CONFIG & HELPERS
// ══════════════════════════════════════════════════════════════
const APP_VERSION = "2.0";
const STORAGE_KEY = "611_app_v2";
const PIN_KEY = "611_pin";

const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "$0";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
};
const fmtShort = (n) => {
  if (!n || isNaN(n)) return "$0";
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return fmt(n);
};
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "";
const fmtDateFull = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().split("T")[0];
const thisMonth = () => new Date().toISOString().slice(0, 7);
const thisYear = () => new Date().getFullYear().toString();

const CATEGORIES = ["Materia Prima", "Sublimación", "Confección", "Insumos/Empaque", "Transporte", "Servicios", "Gasto Operativo", "Otro"];
const PAY_METHODS = ["Bancolombia", "Efectivo", "Nequi", "Daviplata", "Otro"];
const PRODUCT_TYPES = ["Licra", "Camiseta"];
const SIZES = ["4", "6", "8", "10", "12", "14", "16", "XS", "S", "M", "L", "XL"];
const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const defaultData = () => ({
  products: [],
  sales: [],
  expenses: [],
  settings: { bancolombia: 608146, efectivo: 0, apiUrl: "", lastSync: null },
});

// ══════════════════════════════════════════════════════════════
// GOOGLE SHEETS API LAYER
// ══════════════════════════════════════════════════════════════
const SheetsAPI = {
  baseUrl: "",
  setUrl(url) { this.baseUrl = url; },
  async call(action, payload = {}) {
    if (!this.baseUrl) return null;
    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action, ...payload }),
      });
      return await res.json();
    } catch (e) {
      console.error("Sheets API error:", e);
      return null;
    }
  },
  async loadAll() { return this.call("loadAll"); },
  async saveRecord(sheet, record) { return this.call("save", { sheet, record }); },
  async deleteRecord(sheet, id) { return this.call("delete", { sheet, id }); },
  async updateRecord(sheet, record) { return this.call("update", { sheet, record }); },
  async syncAll(data) { return this.call("syncAll", { data }); },
};

// ══════════════════════════════════════════════════════════════
// ICONS (SVG)
// ══════════════════════════════════════════════════════════════
const I = ({ d, size = 20, color = "currentColor", sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const icons = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  cart: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z",
  bag: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
  box: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  users: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  bank: "M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3",
  chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  plus: "M12 4v16m8-8H4",
  x: "M6 18L18 6M6 6l12 12",
  check: "M5 13l4 4L19 7",
  download: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  dollar: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  filter: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z",
  sync: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  arrowR: "M9 5l7 7-7 7",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  gear: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  trendUp: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  trendDown: "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6",
};
const Icon = ({ name, size = 20, color }) => <I d={icons[name]} size={size} color={color} />;

// ══════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ══════════════════════════════════════════════════════════════
const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", background: "rgba(0,0,0,0.75)", padding: "16px", paddingTop: "env(safe-area-inset-top, 16px)", overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111", border: "1px solid #222", borderRadius: 14, width: "100%", maxWidth: wide ? 780 : 540, padding: "20px", margin: "20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, position: "sticky", top: 0, background: "#111", paddingBottom: 8, borderBottom: "1px solid #1a1a1a" }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>{title}</h2>
          <button onClick={onClose} style={bBtn}><Icon name="x" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

const bBtn = { background: "none", border: "none", color: "#666", cursor: "pointer", padding: 4 };

const Input = ({ label, ...props }) => (
  <div style={{ marginBottom: 10 }}>
    {label && <label style={lbl}>{label}</label>}
    <input {...props} style={{ ...inputS, ...props.style }} />
  </div>
);
const lbl = { display: "block", fontSize: 11, color: "#666", marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 };
const inputS = { width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid #222", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" };

const Select = ({ label, options, placeholder = "Seleccionar...", ...props }) => (
  <div style={{ marginBottom: 10 }}>
    {label && <label style={lbl}>{label}</label>}
    <select {...props} style={{ ...inputS, ...props.style }}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Btn = ({ children, variant = "primary", small, full, ...props }) => {
  const s = {
    primary: { background: "#fff", color: "#000", fontWeight: 700 },
    secondary: { background: "#1a1a1a", color: "#ccc", border: "1px solid #2a2a2a" },
    danger: { background: "#1a0808", color: "#ef4444", border: "1px solid #3a1515" },
    ghost: { background: "transparent", color: "#666" },
  };
  return (
    <button {...props} style={{ padding: small ? "6px 12px" : "10px 18px", borderRadius: 8, border: "none", fontSize: small ? 12 : 14, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s", width: full ? "100%" : "auto", ...s[variant], ...props.style }}>{children}</button>
  );
};

const Chip = ({ children, active, onClick }) => (
  <button onClick={onClick} style={{ padding: "5px 14px", borderRadius: 20, border: active ? "1px solid #fff" : "1px solid #222", background: active ? "#fff" : "transparent", color: active ? "#000" : "#666", fontSize: 12, cursor: "pointer", fontWeight: active ? 600 : 400, whiteSpace: "nowrap", transition: "all 0.15s" }}>{children}</button>
);

// ── Date Filter Component ──
const DateFilter = ({ value, onChange }) => {
  const [mode, setMode] = useState("month"); // month | year | custom
  const curMonth = thisMonth();
  const curYear = thisYear();
  const setModeAndVal = (m) => {
    setMode(m);
    if (m === "month") onChange({ type: "month", value: value?.value?.slice(0, 7) || curMonth });
    if (m === "year") onChange({ type: "year", value: value?.value?.slice(0, 4) || curYear });
    if (m === "custom") onChange({ type: "custom", from: value?.from || curMonth + "-01", to: value?.to || today() });
  };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 4 }}>
        <Chip active={mode === "month"} onClick={() => setModeAndVal("month")}>Mes</Chip>
        <Chip active={mode === "year"} onClick={() => setModeAndVal("year")}>Año</Chip>
        <Chip active={mode === "custom"} onClick={() => setModeAndVal("custom")}>Rango</Chip>
      </div>
      {mode === "month" && <input type="month" value={value?.value || curMonth} onChange={(e) => onChange({ type: "month", value: e.target.value })} style={{ ...inputS, width: "auto", marginBottom: 0, padding: "5px 10px", fontSize: 13 }} />}
      {mode === "year" && <input type="number" min="2020" max="2040" value={value?.value || curYear} onChange={(e) => onChange({ type: "year", value: e.target.value })} style={{ ...inputS, width: 90, marginBottom: 0, padding: "5px 10px", fontSize: 13 }} />}
      {mode === "custom" && <>
        <input type="date" value={value?.from || ""} onChange={(e) => onChange({ ...value, type: "custom", from: e.target.value })} style={{ ...inputS, width: "auto", marginBottom: 0, padding: "5px 8px", fontSize: 12 }} />
        <span style={{ color: "#444", fontSize: 12 }}>a</span>
        <input type="date" value={value?.to || ""} onChange={(e) => onChange({ ...value, type: "custom", to: e.target.value })} style={{ ...inputS, width: "auto", marginBottom: 0, padding: "5px 8px", fontSize: 12 }} />
      </>}
    </div>
  );
};

const filterByDate = (items, filter, dateKey = "date") => {
  if (!filter) return items;
  return items.filter((item) => {
    const d = item[dateKey];
    if (!d) return false;
    if (filter.type === "month") return d.startsWith(filter.value);
    if (filter.type === "year") return d.startsWith(filter.value);
    if (filter.type === "custom") return d >= filter.from && d <= filter.to;
    return true;
  });
};

// ── Table ──
const Table = ({ columns, data, onRowClick, maxHeight }) => (
  <div style={{ overflowX: "auto", border: "1px solid #1a1a1a", borderRadius: 10, maxHeight: maxHeight || "none", overflowY: maxHeight ? "auto" : "visible" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead style={{ position: maxHeight ? "sticky" : "static", top: 0, background: "#111", zIndex: 2 }}>
        <tr>{columns.map((c) => <th key={c.key} style={{ padding: "10px 12px", textAlign: c.align || "left", color: "#555", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid #1a1a1a", whiteSpace: "nowrap" }}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr><td colSpan={columns.length} style={{ padding: 40, textAlign: "center", color: "#333", fontSize: 13 }}>Sin registros</td></tr>
        ) : data.map((row, i) => (
          <tr key={row.id || i} onClick={() => onRowClick?.(row)} style={{ cursor: onRowClick ? "pointer" : "default" }}>
            {columns.map((c) => <td key={c.key} style={{ padding: "10px 12px", color: "#bbb", textAlign: c.align || "left", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", borderBottom: "1px solid #111" }}>{c.render ? c.render(row) : row[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ══════════════════════════════════════════════════════════════
// AUTH SCREEN
// ══════════════════════════════════════════════════════════════
const AuthScreen = ({ onAuth }) => {
  const [pin, setPin] = useState("");
  const [isSetup, setIsSetup] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PIN_KEY);
      setIsSetup(!saved);
    } catch { setIsSetup(true); }
  }, []);

  const submit = () => {
    if (isSetup) {
      if (pin.length < 4) { setError("Mínimo 4 dígitos"); return; }
      if (pin !== confirmPin) { setError("Los PIN no coinciden"); return; }
      localStorage.setItem(PIN_KEY, pin);
      onAuth();
    } else {
      const saved = localStorage.getItem(PIN_KEY);
      if (pin === saved) onAuth();
      else setError("PIN incorrecto");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: "#fff", letterSpacing: -3, lineHeight: 1 }}>611</div>
          <div style={{ fontSize: 12, color: "#555", letterSpacing: 4, fontWeight: 600, marginTop: 4 }}>SEIS / ONCE</div>
          <div style={{ fontSize: 11, color: "#333", marginTop: 12 }}>CONTABILIDAD</div>
        </div>
        <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
            <Icon name="lock" size={18} color="#444" />
            <span style={{ color: "#888", fontSize: 14, fontWeight: 500 }}>{isSetup ? "Crear PIN de acceso" : "Ingresa tu PIN"}</span>
          </div>
          <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={8} placeholder="••••" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }} onKeyDown={(e) => e.key === "Enter" && !isSetup && submit()} style={{ ...inputS, textAlign: "center", fontSize: 24, letterSpacing: 12, padding: "14px", marginBottom: isSetup ? 8 : 16 }} autoFocus />
          {isSetup && <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={8} placeholder="Confirmar PIN" value={confirmPin} onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, "")); setError(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inputS, textAlign: "center", fontSize: 24, letterSpacing: 12, padding: "14px", marginBottom: 16 }} />}
          {error && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <Btn full onClick={submit}>{isSetup ? "Crear PIN y entrar" : "Entrar"}</Btn>
          {isSetup && <p style={{ color: "#444", fontSize: 11, marginTop: 12 }}>Este PIN protege el acceso a la app. Compártelo solo con las personas autorizadas.</p>}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PRODUCT FORM
// ══════════════════════════════════════════════════════════════
const ProductForm = ({ onSave, onClose, initial }) => {
  const [f, setF] = useState(initial || { name: "", type: "Licra", reference: "", sizes: [], costTela: 0, costSublimacion: 0, costConfeccion: 0, costInsumos: 0, costOtro: 0, salePrice: 0 });
  const cost = (Number(f.costTela) || 0) + (Number(f.costSublimacion) || 0) + (Number(f.costConfeccion) || 0) + (Number(f.costInsumos) || 0) + (Number(f.costOtro) || 0);
  const margin = f.salePrice > 0 ? ((f.salePrice - cost) / f.salePrice * 100).toFixed(1) : 0;
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const togSize = (s) => setF((p) => ({ ...p, sizes: p.sizes.includes(s) ? p.sizes.filter((x) => x !== s) : [...p.sizes, s] }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="Nombre" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej: Licra Focus" />
        <Select label="Tipo" options={PRODUCT_TYPES} value={f.type} onChange={(e) => set("type", e.target.value)} />
      </div>
      <Input label="Referencia" value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Ej: Power Azul" />
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>Tallas disponibles</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {SIZES.map((s) => <Chip key={s} active={f.sizes.includes(s)} onClick={() => togSize(s)}>{s}</Chip>)}
        </div>
      </div>
      <div style={{ background: "#0a0a0a", borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid #1a1a1a" }}>
        <label style={{ ...lbl, marginBottom: 10 }}>Costos de producción (por unidad)</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Input label="Tela" type="number" value={f.costTela || ""} onChange={(e) => set("costTela", +e.target.value)} />
          <Input label="Sublimación" type="number" value={f.costSublimacion || ""} onChange={(e) => set("costSublimacion", +e.target.value)} />
          <Input label="Confección" type="number" value={f.costConfeccion || ""} onChange={(e) => set("costConfeccion", +e.target.value)} />
          <Input label="Insumos/Empaque" type="number" value={f.costInsumos || ""} onChange={(e) => set("costInsumos", +e.target.value)} />
        </div>
        <Input label="Otros costos" type="number" value={f.costOtro || ""} onChange={(e) => set("costOtro", +e.target.value)} />
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #1a1a1a" }}>
          <span style={{ color: "#666", fontSize: 12 }}>Costo total/ud:</span>
          <span style={{ color: "#fff", fontWeight: 700 }}>{fmt(cost)}</span>
        </div>
      </div>
      <Input label="Precio de venta" type="number" value={f.salePrice || ""} onChange={(e) => set("salePrice", +e.target.value)} />
      {f.salePrice > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, padding: "8px 12px", background: "#0a0a0a", borderRadius: 8 }}>
        <span style={{ color: "#666", fontSize: 13 }}>Margen:</span>
        <span style={{ fontWeight: 700, color: margin >= 30 ? "#22c55e" : margin >= 15 ? "#f59e0b" : "#ef4444" }}>{margin}%</span>
      </div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={() => { if (!f.name) return; onSave({ ...f, id: f.id || uid(), costTotal: cost, margin: +margin }); onClose(); }}>Guardar</Btn>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// SALE FORM
// ══════════════════════════════════════════════════════════════
const SaleForm = ({ onSave, onClose, products, nextNum }) => {
  const [f, setF] = useState({ date: today(), client: "", phone: "", address: "", items: [{ productRef: "", size: "", qty: 1, unitPrice: 0 }], hasInvoice: false, invoiceNum: "", payments: [{ date: today(), amount: 0, method: "Bancolombia" }] });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setF((p) => ({ ...p, items: p.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  const addItem = () => setF((p) => ({ ...p, items: [...p.items, { productRef: "", size: "", qty: 1, unitPrice: 0 }] }));
  const rmItem = (i) => setF((p) => ({ ...p, items: p.items.length > 1 ? p.items.filter((_, j) => j !== i) : p.items }));
  const setPay = (i, k, v) => setF((p) => ({ ...p, payments: p.payments.map((py, j) => j === i ? { ...py, [k]: v } : py) }));
  const addPay = () => setF((p) => ({ ...p, payments: [...p.payments, { date: today(), amount: 0, method: "Bancolombia" }] }));
  const rmPay = (i) => setF((p) => ({ ...p, payments: p.payments.length > 1 ? p.payments.filter((_, j) => j !== i) : p.payments }));

  const selectProd = (i, ref) => {
    const p = products.find((x) => x.reference === ref || x.name === ref);
    if (p) setItem(i, "unitPrice", p.salePrice);
    setItem(i, "productRef", ref);
  };

  const sub = f.items.reduce((a, i) => a + (i.qty || 0) * (i.unitPrice || 0), 0);
  const iva = f.hasInvoice ? Math.round(sub * 0.19) : 0;
  const total = sub + iva;
  const paid = f.payments.reduce((a, p) => a + (+p.amount || 0), 0);
  const bal = total - paid;
  const orderNum = `PED-${String(nextNum).padStart(4, "0")}`;
  const prodRefs = [...new Set(products.map((p) => p.reference || p.name).filter(Boolean))];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="Fecha" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
        <Input label="# Pedido" value={orderNum} disabled />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <Input label="Cliente" value={f.client} onChange={(e) => set("client", e.target.value)} placeholder="Nombre" />
        <Input label="Teléfono" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
      </div>
      <Input label="Dirección de envío" value={f.address} onChange={(e) => set("address", e.target.value)} />

      <div style={{ background: "#0a0a0a", borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Productos</label>
          <Btn small variant="secondary" onClick={addItem}><Icon name="plus" size={14} /></Btn>
        </div>
        {f.items.map((item, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 60px 1fr auto", gap: 6, alignItems: "end", marginBottom: 6 }}>
            <Select options={prodRefs} value={item.productRef} onChange={(e) => selectProd(i, e.target.value)} placeholder="Producto" />
            <Select options={SIZES} value={item.size} onChange={(e) => setItem(i, "size", e.target.value)} placeholder="Talla" />
            <Input type="number" min="1" value={item.qty} onChange={(e) => setItem(i, "qty", +e.target.value)} />
            <Input type="number" value={item.unitPrice || ""} onChange={(e) => setItem(i, "unitPrice", +e.target.value)} placeholder="Precio" />
            <button onClick={() => rmItem(i)} style={{ ...bBtn, paddingBottom: 12 }}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#888", marginBottom: 10 }}>
        <input type="checkbox" checked={f.hasInvoice} onChange={(e) => set("hasInvoice", e.target.checked)} style={{ accentColor: "#fff" }} /> Factura Electrónica
        {f.hasInvoice && <input placeholder="# Factura" value={f.invoiceNum} onChange={(e) => set("invoiceNum", e.target.value)} style={{ ...inputS, width: 130, marginBottom: 0, padding: "5px 10px" }} />}
      </label>

      <div style={{ background: "#0a0a0a", borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Pagos</label>
          <Btn small variant="secondary" onClick={addPay}><Icon name="plus" size={14} /></Btn>
        </div>
        {f.payments.map((pay, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 6, alignItems: "end", marginBottom: 6 }}>
            <Input type="date" value={pay.date} onChange={(e) => setPay(i, "date", e.target.value)} />
            <Input type="number" value={pay.amount || ""} onChange={(e) => setPay(i, "amount", +e.target.value)} placeholder="Valor" />
            <Select options={PAY_METHODS} value={pay.method} onChange={(e) => setPay(i, "method", e.target.value)} />
            <button onClick={() => rmPay(i)} style={{ ...bBtn, paddingBottom: 12 }}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>

      <div style={{ background: "#151515", borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 4 }}><span>Subtotal</span><span style={{ color: "#ccc" }}>{fmt(sub)}</span></div>
        {f.hasInvoice && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 4 }}><span>IVA 19%</span><span style={{ color: "#ccc" }}>{fmt(iva)}</span></div>}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#fff", paddingTop: 6, borderTop: "1px solid #222" }}><span>Total</span><span>{fmt(total)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#22c55e", marginTop: 4 }}><span>Pagado</span><span>{fmt(paid)}</span></div>
        {bal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#f59e0b", marginTop: 2 }}><span>Saldo</span><span>{fmt(bal)}</span></div>}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={() => {
          if (!f.client) return;
          onSave({ ...f, id: uid(), orderNum, subtotal: sub, iva, total, totalPaid: paid, balance: Math.max(0, bal) });
          onClose();
        }}>Registrar Venta</Btn>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// EXPENSE FORM
// ══════════════════════════════════════════════════════════════
const ExpenseForm = ({ onSave, onClose }) => {
  const [f, setF] = useState({ date: today(), supplier: "", phone: "", category: "Materia Prima", items: [{ product: "", color: "", qty: 1, unit: "Unidades", unitPrice: 0 }], hasInvoice: false, invoiceNum: "", payments: [{ date: today(), amount: 0, method: "Bancolombia" }] });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setF((p) => ({ ...p, items: p.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  const addItem = () => setF((p) => ({ ...p, items: [...p.items, { product: "", color: "", qty: 1, unit: "Unidades", unitPrice: 0 }] }));
  const rmItem = (i) => setF((p) => ({ ...p, items: p.items.length > 1 ? p.items.filter((_, j) => j !== i) : p.items }));
  const setPay = (i, k, v) => setF((p) => ({ ...p, payments: p.payments.map((py, j) => j === i ? { ...py, [k]: v } : py) }));
  const addPay = () => setF((p) => ({ ...p, payments: [...p.payments, { date: today(), amount: 0, method: "Bancolombia" }] }));
  const rmPay = (i) => setF((p) => ({ ...p, payments: p.payments.length > 1 ? p.payments.filter((_, j) => j !== i) : p.payments }));

  const sub = f.items.reduce((a, i) => a + (i.qty || 0) * (i.unitPrice || 0), 0);
  const iva = f.hasInvoice ? Math.round(sub * 0.19) : 0;
  const total = sub + iva;
  const paid = f.payments.reduce((a, p) => a + (+p.amount || 0), 0);
  const bal = total - paid;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="Fecha" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
        <Select label="Categoría" options={CATEGORIES} value={f.category} onChange={(e) => set("category", e.target.value)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <Input label="Proveedor" value={f.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Nombre" />
        <Input label="Teléfono" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
      </div>

      <div style={{ background: "#0a0a0a", borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Ítems</label>
          <Btn small variant="secondary" onClick={addItem}><Icon name="plus" size={14} /></Btn>
        </div>
        {f.items.map((item, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 55px 80px 1fr auto", gap: 6, alignItems: "end", marginBottom: 6 }}>
            <Input value={item.product} onChange={(e) => setItem(i, "product", e.target.value)} placeholder="Producto" />
            <Input value={item.color} onChange={(e) => setItem(i, "color", e.target.value)} placeholder="Color" />
            <Input type="number" min="1" value={item.qty} onChange={(e) => setItem(i, "qty", +e.target.value)} />
            <Select options={["Unidades", "Metros", "Rollos", "Kg"]} value={item.unit} onChange={(e) => setItem(i, "unit", e.target.value)} />
            <Input type="number" value={item.unitPrice || ""} onChange={(e) => setItem(i, "unitPrice", +e.target.value)} placeholder="Precio" />
            <button onClick={() => rmItem(i)} style={{ ...bBtn, paddingBottom: 12 }}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#888", marginBottom: 10 }}>
        <input type="checkbox" checked={f.hasInvoice} onChange={(e) => set("hasInvoice", e.target.checked)} style={{ accentColor: "#fff" }} /> Factura Electrónica
        {f.hasInvoice && <input placeholder="# Factura" value={f.invoiceNum} onChange={(e) => set("invoiceNum", e.target.value)} style={{ ...inputS, width: 130, marginBottom: 0, padding: "5px 10px" }} />}
      </label>

      <div style={{ background: "#0a0a0a", borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Pagos</label>
          <Btn small variant="secondary" onClick={addPay}><Icon name="plus" size={14} /></Btn>
        </div>
        {f.payments.map((pay, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 6, alignItems: "end", marginBottom: 6 }}>
            <Input type="date" value={pay.date} onChange={(e) => setPay(i, "date", e.target.value)} />
            <Input type="number" value={pay.amount || ""} onChange={(e) => setPay(i, "amount", +e.target.value)} placeholder="Valor" />
            <Select options={PAY_METHODS} value={pay.method} onChange={(e) => setPay(i, "method", e.target.value)} />
            <button onClick={() => rmPay(i)} style={{ ...bBtn, paddingBottom: 12 }}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>

      <div style={{ background: "#151515", borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 4 }}><span>Subtotal</span><span style={{ color: "#ccc" }}>{fmt(sub)}</span></div>
        {f.hasInvoice && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 4 }}><span>IVA 19%</span><span style={{ color: "#ccc" }}>{fmt(iva)}</span></div>}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#fff", paddingTop: 6, borderTop: "1px solid #222" }}><span>Total</span><span>{fmt(total)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#22c55e", marginTop: 4 }}><span>Pagado</span><span>{fmt(paid)}</span></div>
        {bal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#f59e0b", marginTop: 2 }}><span>Saldo</span><span>{fmt(bal)}</span></div>}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={() => {
          if (!f.supplier) return;
          onSave({ ...f, id: uid(), subtotal: sub, iva, total, totalPaid: paid, balance: Math.max(0, bal) });
          onClose();
        }}>Registrar Gasto</Btn>
      </div>
    </div>
  );
};

// ── Add Payment Modal ──
const AddPaymentModal = ({ open, onClose, record, onSave }) => {
  const [pay, setPay] = useState({ date: today(), amount: 0, method: "Bancolombia" });
  if (!open || !record) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Agregar pago — ${record.client || record.supplier}`}>
      <div style={{ padding: 12, background: "#0a0a0a", borderRadius: 8, border: "1px solid #1a1a1a", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 3 }}><span>Total</span><span style={{ color: "#fff" }}>{fmt(record.total)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 3 }}><span>Pagado</span><span style={{ color: "#22c55e" }}>{fmt(record.totalPaid)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#f59e0b" }}><span>Saldo</span><span>{fmt(record.balance)}</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Input label="Fecha" type="date" value={pay.date} onChange={(e) => setPay((p) => ({ ...p, date: e.target.value }))} />
        <Input label="Valor" type="number" value={pay.amount || ""} onChange={(e) => setPay((p) => ({ ...p, amount: +e.target.value }))} />
        <Select label="Medio" options={PAY_METHODS} value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={() => {
          if (pay.amount <= 0) return;
          const np = record.totalPaid + pay.amount;
          onSave({ ...record, payments: [...record.payments, pay], totalPaid: np, balance: Math.max(0, record.total - np) });
          onClose();
        }}>Registrar Pago</Btn>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// PAGE: DASHBOARD (clickable cards)
// ══════════════════════════════════════════════════════════════
const Dashboard = ({ data, goTo }) => {
  const cm = thisMonth();
  const mSales = data.sales.filter((s) => s.date?.startsWith(cm));
  const mExp = data.expenses.filter((e) => e.date?.startsWith(cm));
  const totalSales = mSales.reduce((a, s) => a + (s.total || 0), 0);
  const totalExp = mExp.reduce((a, e) => a + (e.total || 0), 0);
  const units = mSales.reduce((a, s) => a + (s.items?.reduce((b, i) => b + (i.qty || 0), 0) || 0), 0);
  const profit = totalSales - totalExp;
  const paidIn = data.sales.reduce((a, s) => a + (s.totalPaid || 0), 0);
  const paidOut = data.expenses.reduce((a, e) => a + (e.totalPaid || 0), 0);
  const cash = (data.settings.bancolombia || 0) + (data.settings.efectivo || 0) + paidIn - paidOut;
  const pending = data.sales.reduce((a, s) => a + (s.balance || 0), 0);
  const payable = data.expenses.reduce((a, e) => a + (e.balance || 0), 0);

  const topProds = useMemo(() => {
    const m = {};
    mSales.forEach((s) => s.items?.forEach((i) => { const k = i.productRef || "?"; m[k] = (m[k] || 0) + (i.qty || 0) * (i.unitPrice || 0); }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [mSales]);

  const Card = ({ label, value, sub, color, icon, target, style: st }) => (
    <div onClick={() => goTo(target)} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all 0.15s", flex: 1, minWidth: 155, ...st }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
        <Icon name={icon} size={16} color="#333" />
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#444", marginTop: 3 }}>{sub}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 11, color: "#444" }}>
        <span>Ver detalle</span>
        <Icon name="arrowR" size={12} color="#444" />
      </div>
    </div>
  );

  const recent = [...data.sales].reverse().slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>Hola, Steven</h1>
        <p style={{ color: "#444", fontSize: 13 }}>{new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10, marginBottom: 16 }}>
        <Card label="Ventas del Mes" value={fmtShort(totalSales)} sub={`${units} uds · ${mSales.length} pedidos`} icon="cart" target="sales" />
        <Card label="Gastos del Mes" value={fmtShort(totalExp)} sub={`${mExp.length} registros`} icon="bag" target="expenses" />
        <Card label="Utilidad" value={fmtShort(profit)} color={profit >= 0 ? "#22c55e" : "#ef4444"} icon={profit >= 0 ? "trendUp" : "trendDown"} target="reports" sub={totalSales > 0 ? `Margen ${((profit / totalSales) * 100).toFixed(0)}%` : ""} />
        <Card label="Saldo Disponible" value={fmtShort(cash)} icon="bank" target="bank" sub="Bancos + Efectivo" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10, marginBottom: 20 }}>
        <Card label="Por Cobrar" value={fmtShort(pending)} color={pending > 0 ? "#f59e0b" : "#555"} icon="dollar" target="clients" sub="Cartera clientes" />
        <Card label="Por Pagar" value={fmtShort(payable)} color={payable > 0 ? "#f59e0b" : "#555"} icon="alert" target="expenses" sub="Deudas proveedores" />
        <Card label="Productos" value={data.products.length} icon="box" target="products" sub="En catálogo" />
        <Card label="Clientes" value={[...new Set(data.sales.map((s) => s.client).filter((c) => c && c !== "Intereses"))].length} icon="users" target="clients" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: 0.6 }}>Top Productos</span>
            <button onClick={() => goTo("reports")} style={{ ...bBtn, fontSize: 11, color: "#444" }}>Ver todo <Icon name="arrowR" size={12} /></button>
          </div>
          {topProds.length === 0 ? <p style={{ color: "#333", fontSize: 13 }}>Sin ventas este mes</p> : topProds.map(([n, v], i) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #151515" }}>
              <span style={{ color: "#999", fontSize: 13 }}>{i + 1}. {n}</span>
              <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{fmtShort(v)}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: 0.6 }}>Últimas Ventas</span>
            <button onClick={() => goTo("sales")} style={{ ...bBtn, fontSize: 11, color: "#444" }}>Ver todo <Icon name="arrowR" size={12} /></button>
          </div>
          {recent.length === 0 ? <p style={{ color: "#333", fontSize: 13 }}>Sin ventas</p> : recent.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #151515", alignItems: "center" }}>
              <div><div style={{ color: "#ccc", fontSize: 13 }}>{s.client}</div><div style={{ color: "#444", fontSize: 11 }}>{fmtDate(s.date)}</div></div>
              <div style={{ textAlign: "right" }}><div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{fmtShort(s.total)}</div>
                {s.balance > 0 && <div style={{ color: "#f59e0b", fontSize: 11 }}>Saldo {fmtShort(s.balance)}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PAGE: SALES
// ══════════════════════════════════════════════════════════════
const SalesPage = ({ data, setData }) => {
  const [showForm, setShowForm] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [filter, setFilter] = useState({ type: "month", value: thisMonth() });
  const add = (s) => setData((d) => ({ ...d, sales: [...d.sales, s] }));
  const upd = (s) => setData((d) => ({ ...d, sales: d.sales.map((x) => x.id === s.id ? s : x) }));
  const del = (id) => { if (confirm("¿Eliminar esta venta?")) setData((d) => ({ ...d, sales: d.sales.filter((x) => x.id !== id) })); };
  const filtered = filterByDate(data.sales, filter).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const totalF = filtered.reduce((a, s) => a + (s.total || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Ventas</h1>
        <Btn onClick={() => setShowForm(true)}><Icon name="plus" size={16} /> Nueva Venta</Btn>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <DateFilter value={filter} onChange={setFilter} />
        <span style={{ fontSize: 13, color: "#555" }}>{filtered.length} registros · {fmt(totalF)}</span>
      </div>
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva Venta" wide>
        <SaleForm onSave={add} onClose={() => setShowForm(false)} products={data.products} nextNum={data.sales.length + 1} />
      </Modal>
      <AddPaymentModal open={!!payModal} onClose={() => setPayModal(null)} record={payModal} onSave={upd} />
      <Table maxHeight="65vh" columns={[
        { key: "orderNum", label: "#" },
        { key: "date", label: "Fecha", render: (r) => fmtDate(r.date) },
        { key: "client", label: "Cliente" },
        { key: "items", label: "Productos", render: (r) => r.items?.map((i) => `${i.productRef}×${i.qty}`).join(", ") },
        { key: "total", label: "Total", align: "right", render: (r) => fmt(r.total) },
        { key: "balance", label: "Saldo", align: "right", render: (r) => <span style={{ color: r.balance > 0 ? "#f59e0b" : "#333" }}>{r.balance > 0 ? fmt(r.balance) : "—"}</span> },
        { key: "a", label: "", align: "right", render: (r) => (
          <div style={{ display: "flex", gap: 4 }}>
            {r.balance > 0 && <button onClick={(e) => { e.stopPropagation(); setPayModal(r); }} style={{ ...bBtn, color: "#22c55e" }} title="Agregar pago"><Icon name="dollar" size={16} /></button>}
            <button onClick={(e) => { e.stopPropagation(); del(r.id); }} style={{ ...bBtn, color: "#333" }} title="Eliminar"><Icon name="trash" size={15} /></button>
          </div>
        )},
      ]} data={filtered} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PAGE: EXPENSES
// ══════════════════════════════════════════════════════════════
const ExpensesPage = ({ data, setData }) => {
  const [showForm, setShowForm] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [filter, setFilter] = useState({ type: "month", value: thisMonth() });
  const add = (e) => setData((d) => ({ ...d, expenses: [...d.expenses, e] }));
  const upd = (e) => setData((d) => ({ ...d, expenses: d.expenses.map((x) => x.id === e.id ? e : x) }));
  const del = (id) => { if (confirm("¿Eliminar este gasto?")) setData((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== id) })); };
  const filtered = filterByDate(data.expenses, filter).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const totalF = filtered.reduce((a, e) => a + (e.total || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Compras y Gastos</h1>
        <Btn onClick={() => setShowForm(true)}><Icon name="plus" size={16} /> Nuevo Gasto</Btn>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <DateFilter value={filter} onChange={setFilter} />
        <span style={{ fontSize: 13, color: "#555" }}>{filtered.length} registros · {fmt(totalF)}</span>
      </div>
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva Compra / Gasto" wide>
        <ExpenseForm onSave={add} onClose={() => setShowForm(false)} />
      </Modal>
      <AddPaymentModal open={!!payModal} onClose={() => setPayModal(null)} record={payModal} onSave={upd} />
      <Table maxHeight="65vh" columns={[
        { key: "date", label: "Fecha", render: (r) => fmtDate(r.date) },
        { key: "supplier", label: "Proveedor" },
        { key: "category", label: "Cat.", render: (r) => <span style={{ padding: "2px 8px", background: "#151515", borderRadius: 4, fontSize: 11, color: "#888" }}>{r.category}</span> },
        { key: "total", label: "Total", align: "right", render: (r) => fmt(r.total) },
        { key: "balance", label: "Saldo", align: "right", render: (r) => <span style={{ color: r.balance > 0 ? "#f59e0b" : "#333" }}>{r.balance > 0 ? fmt(r.balance) : "—"}</span> },
        { key: "a", label: "", align: "right", render: (r) => (
          <div style={{ display: "flex", gap: 4 }}>
            {r.balance > 0 && <button onClick={(e) => { e.stopPropagation(); setPayModal(r); }} style={{ ...bBtn, color: "#22c55e" }}><Icon name="dollar" size={16} /></button>}
            <button onClick={(e) => { e.stopPropagation(); del(r.id); }} style={{ ...bBtn, color: "#333" }}><Icon name="trash" size={15} /></button>
          </div>
        )},
      ]} data={filtered} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PAGE: PRODUCTS
// ══════════════════════════════════════════════════════════════
const ProductsPage = ({ data, setData }) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const save = (p) => { setData((d) => ({ ...d, products: editing ? d.products.map((x) => x.id === p.id ? p : x) : [...d.products, p] })); setEditing(null); };
  const del = (id) => { if (confirm("¿Eliminar producto?")) setData((d) => ({ ...d, products: d.products.filter((x) => x.id !== id) })); };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Productos</h1>
        <Btn onClick={() => { setEditing(null); setShowForm(true); }}><Icon name="plus" size={16} /> Nuevo</Btn>
      </div>
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar Producto" : "Nuevo Producto"}>
        <ProductForm onSave={save} onClose={() => setShowForm(false)} initial={editing} />
      </Modal>
      {data.products.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#333" }}><Icon name="box" size={40} /><p style={{ marginTop: 12, color: "#555" }}>Agrega tu primer producto</p><Btn style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>Agregar producto</Btn></div>
      ) : (
        <Table columns={[
          { key: "name", label: "Producto" },
          { key: "type", label: "Tipo" },
          { key: "reference", label: "Ref." },
          { key: "costTotal", label: "Costo", align: "right", render: (r) => fmt(r.costTotal) },
          { key: "salePrice", label: "Venta", align: "right", render: (r) => fmt(r.salePrice) },
          { key: "margin", label: "Margen", align: "right", render: (r) => <span style={{ color: r.margin >= 30 ? "#22c55e" : r.margin >= 15 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>{r.margin?.toFixed(0)}%</span> },
          { key: "a", label: "", render: (r) => (
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => { setEditing(r); setShowForm(true); }} style={bBtn}><Icon name="edit" size={15} color="#555" /></button>
              <button onClick={() => del(r.id)} style={bBtn}><Icon name="trash" size={15} color="#333" /></button>
            </div>
          )},
        ]} data={data.products} />
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PAGE: CLIENTS
// ══════════════════════════════════════════════════════════════
const ClientsPage = ({ data }) => {
  const clients = useMemo(() => {
    const m = {};
    data.sales.forEach((s) => {
      if (!s.client || s.client === "Intereses") return;
      if (!m[s.client]) m[s.client] = { name: s.client, phone: "", total: 0, paid: 0, balance: 0, orders: 0 };
      m[s.client].total += s.total || 0;
      m[s.client].paid += s.totalPaid || 0;
      m[s.client].balance += s.balance || 0;
      m[s.client].orders++;
      if (s.phone) m[s.client].phone = s.phone;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [data.sales]);
  const totalBal = clients.reduce((a, c) => a + c.balance, 0);
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Clientes</h1>
        <p style={{ color: "#555", fontSize: 13 }}>{clients.length} clientes · Cartera: {fmt(totalBal)}</p>
      </div>
      <Table maxHeight="70vh" columns={[
        { key: "name", label: "Cliente" },
        { key: "phone", label: "Tel." },
        { key: "orders", label: "Pedidos", align: "center" },
        { key: "total", label: "Comprado", align: "right", render: (r) => fmt(r.total) },
        { key: "paid", label: "Pagado", align: "right", render: (r) => <span style={{ color: "#22c55e" }}>{fmt(r.paid)}</span> },
        { key: "balance", label: "Saldo", align: "right", render: (r) => <span style={{ color: r.balance > 0 ? "#f59e0b" : "#444", fontWeight: r.balance > 0 ? 700 : 400 }}>{r.balance > 0 ? fmt(r.balance) : "—"}</span> },
      ]} data={clients} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PAGE: BANK
// ══════════════════════════════════════════════════════════════
const BankPage = ({ data }) => {
  const [filter, setFilter] = useState({ type: "month", value: thisMonth() });
  const allMovs = useMemo(() => {
    const movs = [];
    if (data.settings.bancolombia) movs.push({ id: "ib", date: "2026-03-15", account: "Bancolombia", concept: "Saldo Inicial", name: "", debit: data.settings.bancolombia, credit: 0 });
    if (data.settings.efectivo) movs.push({ id: "ie", date: "2026-03-15", account: "Efectivo", concept: "Saldo Inicial", name: "", debit: data.settings.efectivo, credit: 0 });
    data.sales.forEach((s) => s.payments?.forEach((p, i) => { if (p.amount > 0) movs.push({ id: `s${s.id}${i}`, date: p.date, account: p.method, concept: "Venta", name: s.client, debit: p.amount, credit: 0 }); }));
    data.expenses.forEach((e) => e.payments?.forEach((p, i) => { if (p.amount > 0) movs.push({ id: `e${e.id}${i}`, date: p.date, account: p.method, concept: "Compra", name: e.supplier, debit: 0, credit: p.amount }); }));
    movs.sort((a, b) => a.date.localeCompare(b.date));
    let bal = 0;
    movs.forEach((m) => { bal += m.debit - m.credit; m.balance = bal; });
    return movs;
  }, [data]);
  const filtered = filterByDate(allMovs, filter);
  const totalBal = allMovs.length > 0 ? allMovs[allMovs.length - 1].balance : 0;

  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Libro de Bancos</h1>
        <p style={{ color: "#444", fontSize: 12 }}>Generado automáticamente · Saldo total: <span style={{ color: "#fff", fontWeight: 700 }}>{fmt(totalBal)}</span></p>
      </div>
      <div style={{ marginBottom: 16 }}><DateFilter value={filter} onChange={setFilter} /></div>
      <Table maxHeight="65vh" columns={[
        { key: "date", label: "Fecha", render: (r) => fmtDate(r.date) },
        { key: "account", label: "Cuenta" },
        { key: "concept", label: "Concepto", render: (r) => <span style={{ padding: "2px 8px", background: r.concept === "Venta" ? "#071a07" : r.concept === "Compra" ? "#1a0707" : "#111", borderRadius: 4, fontSize: 11, color: r.concept === "Venta" ? "#22c55e" : r.concept === "Compra" ? "#ef4444" : "#888" }}>{r.concept}</span> },
        { key: "name", label: "Nombre" },
        { key: "debit", label: "Ingreso", align: "right", render: (r) => r.debit ? <span style={{ color: "#22c55e" }}>{fmt(r.debit)}</span> : "" },
        { key: "credit", label: "Egreso", align: "right", render: (r) => r.credit ? <span style={{ color: "#ef4444" }}>{fmt(r.credit)}</span> : "" },
        { key: "balance", label: "Saldo", align: "right", render: (r) => <span style={{ fontWeight: 600 }}>{fmt(r.balance)}</span> },
      ]} data={filtered} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PAGE: REPORTS
// ══════════════════════════════════════════════════════════════
const ReportsPage = ({ data }) => {
  const monthly = useMemo(() => {
    const m = {};
    data.sales.forEach((s) => { const k = s.date?.slice(0, 7); if (!k) return; if (!m[k]) m[k] = { month: k, sales: 0, exp: 0, units: 0, orders: 0 }; m[k].sales += s.total || 0; m[k].units += s.items?.reduce((a, i) => a + (i.qty || 0), 0) || 0; m[k].orders++; });
    data.expenses.forEach((e) => { const k = e.date?.slice(0, 7); if (!k) return; if (!m[k]) m[k] = { month: k, sales: 0, exp: 0, units: 0, orders: 0 }; m[k].exp += e.total || 0; });
    return Object.values(m).sort((a, b) => b.month.localeCompare(a.month));
  }, [data]);

  const prodProfit = useMemo(() => {
    const m = {};
    data.sales.forEach((s) => s.items?.forEach((i) => {
      const ref = i.productRef || "?";
      if (!m[ref]) m[ref] = { ref, rev: 0, units: 0, cost: 0 };
      m[ref].rev += (i.qty || 0) * (i.unitPrice || 0); m[ref].units += i.qty || 0;
      const p = data.products.find((x) => x.reference === ref || x.name === ref);
      if (p) m[ref].cost += (i.qty || 0) * (p.costTotal || 0);
    }));
    return Object.values(m).sort((a, b) => (b.rev - b.cost) - (a.rev - a.cost));
  }, [data]);

  const expByCat = useMemo(() => {
    const m = {};
    data.expenses.forEach((e) => { m[e.category] = (m[e.category] || 0) + (e.total || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const exportCSV = (name, headers, rows) => {
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = `611_${name}_${today()}.csv`; a.click();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Reportes</h1>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn variant="secondary" small onClick={() => exportCSV("ventas", ["Pedido", "Fecha", "Cliente", "Total", "Pagado", "Saldo"], data.sales.map((s) => [s.orderNum, s.date, s.client, s.total, s.totalPaid, s.balance]))}><Icon name="download" size={14} /> Ventas</Btn>
          <Btn variant="secondary" small onClick={() => exportCSV("gastos", ["Fecha", "Proveedor", "Categoría", "Total", "Pagado", "Saldo"], data.expenses.map((e) => [e.date, e.supplier, e.category, e.total, e.totalPaid, e.balance]))}><Icon name="download" size={14} /> Gastos</Btn>
        </div>
      </div>

      <h3 style={{ ...lbl, marginBottom: 10, fontSize: 12 }}>Resumen Mensual</h3>
      <div style={{ marginBottom: 24 }}>
        <Table columns={[
          { key: "month", label: "Mes" },
          { key: "orders", label: "Pedidos", align: "center" },
          { key: "units", label: "Uds.", align: "center" },
          { key: "sales", label: "Ventas", align: "right", render: (r) => fmt(r.sales) },
          { key: "exp", label: "Gastos", align: "right", render: (r) => fmt(r.exp) },
          { key: "p", label: "Utilidad", align: "right", render: (r) => { const p = r.sales - r.exp; return <span style={{ color: p >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{fmt(p)}</span>; } },
          { key: "m", label: "Margen", align: "right", render: (r) => { const m = r.sales > 0 ? ((r.sales - r.exp) / r.sales * 100).toFixed(0) : 0; return <span style={{ color: m >= 20 ? "#22c55e" : "#f59e0b" }}>{m}%</span>; } },
        ]} data={monthly} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <div>
          <h3 style={{ ...lbl, marginBottom: 10, fontSize: 12 }}>Rentabilidad por Producto</h3>
          <Table columns={[
            { key: "ref", label: "Referencia" },
            { key: "units", label: "Uds.", align: "center" },
            { key: "rev", label: "Ingresos", align: "right", render: (r) => fmt(r.rev) },
            { key: "cost", label: "Costos", align: "right", render: (r) => fmt(r.cost) },
            { key: "p", label: "Utilidad", align: "right", render: (r) => { const p = r.rev - r.cost; return <span style={{ color: p >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{fmt(p)}</span>; } },
          ]} data={prodProfit} />
        </div>

        <div>
          <h3 style={{ ...lbl, marginBottom: 10, fontSize: 12 }}>Gastos por Categoría</h3>
          <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 10, padding: 16 }}>
            {expByCat.length === 0 ? <p style={{ color: "#333", fontSize: 13 }}>Sin datos</p> : expByCat.map(([cat, val]) => {
              const tot = expByCat.reduce((a, [, v]) => a + v, 0);
              const pct = tot > 0 ? (val / tot * 100).toFixed(0) : 0;
              return (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999", marginBottom: 3 }}><span>{cat}</span><span style={{ fontWeight: 600, color: "#ccc" }}>{fmt(val)} ({pct}%)</span></div>
                  <div style={{ height: 5, background: "#0a0a0a", borderRadius: 3 }}><div style={{ height: "100%", width: `${pct}%`, background: "#fff", borderRadius: 3 }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PAGE: SETTINGS
// ══════════════════════════════════════════════════════════════
const SettingsPage = ({ data, setData }) => {
  const set = (k, v) => setData((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const exportJSON = () => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = `611_backup_${today()}.json`; a.click();
  };
  const importJSON = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => { try { const d = JSON.parse(ev.target.result); if (d.products && d.sales && d.expenses) { setData(d); setSyncMsg("Datos restaurados correctamente"); } } catch { setSyncMsg("Archivo inválido"); } };
    r.readAsText(file);
  };
  const syncSheets = async () => {
    if (!data.settings.apiUrl) { setSyncMsg("Configura la URL del Google Apps Script primero"); return; }
    setSyncing(true); setSyncMsg("Sincronizando...");
    SheetsAPI.setUrl(data.settings.apiUrl);
    const res = await SheetsAPI.syncAll(data);
    if (res?.success) { setSyncMsg(`Sincronizado: ${new Date().toLocaleTimeString("es-CO")}`); set("lastSync", new Date().toISOString()); }
    else setSyncMsg("Error al sincronizar. Verifica la URL.");
    setSyncing(false);
  };
  const loadFromSheets = async () => {
    if (!data.settings.apiUrl) { setSyncMsg("Configura la URL primero"); return; }
    setSyncing(true); setSyncMsg("Cargando desde Google Sheets...");
    SheetsAPI.setUrl(data.settings.apiUrl);
    const res = await SheetsAPI.loadAll();
    if (res?.success && res.data) { setData((d) => ({ ...res.data, settings: { ...d.settings, ...res.data.settings } })); setSyncMsg("Datos cargados desde Google Sheets"); }
    else setSyncMsg("Error al cargar. Verifica la URL.");
    setSyncing(false);
  };
  const changePin = () => {
    const np = prompt("Nuevo PIN (mínimo 4 dígitos):");
    if (np && np.length >= 4 && /^\d+$/.test(np)) { localStorage.setItem(PIN_KEY, np); alert("PIN actualizado"); }
    else if (np) alert("El PIN debe ser mínimo 4 dígitos numéricos");
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 20 }}>Configuración</h1>

      <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: 18, marginBottom: 16, maxWidth: 500 }}>
        <h3 style={{ ...lbl, marginBottom: 12, fontSize: 12 }}>Saldos Iniciales</h3>
        <Input label="Bancolombia" type="number" value={data.settings.bancolombia || ""} onChange={(e) => set("bancolombia", +e.target.value)} />
        <Input label="Efectivo" type="number" value={data.settings.efectivo || ""} onChange={(e) => set("efectivo", +e.target.value)} />
      </div>

      <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: 18, marginBottom: 16, maxWidth: 500 }}>
        <h3 style={{ ...lbl, marginBottom: 12, fontSize: 12 }}>Google Sheets (Sincronización)</h3>
        <Input label="URL del Google Apps Script" value={data.settings.apiUrl || ""} onChange={(e) => set("apiUrl", e.target.value)} placeholder="https://script.google.com/macros/s/..." />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <Btn variant="secondary" small onClick={syncSheets} disabled={syncing}><Icon name="sync" size={14} /> Enviar a Sheets</Btn>
          <Btn variant="secondary" small onClick={loadFromSheets} disabled={syncing}><Icon name="download" size={14} /> Cargar desde Sheets</Btn>
        </div>
        {syncMsg && <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>{syncMsg}</p>}
        {data.settings.lastSync && <p style={{ fontSize: 11, color: "#444", marginTop: 4 }}>Última sync: {new Date(data.settings.lastSync).toLocaleString("es-CO")}</p>}
      </div>

      <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: 18, marginBottom: 16, maxWidth: 500 }}>
        <h3 style={{ ...lbl, marginBottom: 12, fontSize: 12 }}>Respaldo Local</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="secondary" small onClick={exportJSON}><Icon name="download" size={14} /> Descargar JSON</Btn>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "#1a1a1a", color: "#ccc", fontSize: 12, cursor: "pointer", border: "1px solid #2a2a2a" }}>
            <Icon name="box" size={14} /> Restaurar
            <input type="file" accept=".json" onChange={importJSON} style={{ display: "none" }} />
          </label>
        </div>
        <p style={{ fontSize: 11, color: "#444", marginTop: 8 }}>Resumen: {data.products.length} productos · {data.sales.length} ventas · {data.expenses.length} gastos</p>
      </div>

      <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: 18, maxWidth: 500 }}>
        <h3 style={{ ...lbl, marginBottom: 12, fontSize: 12 }}>Seguridad</h3>
        <Btn variant="secondary" small onClick={changePin}><Icon name="lock" size={14} /> Cambiar PIN</Btn>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// NAVIGATION CONFIG
// ══════════════════════════════════════════════════════════════
const NAV = [
  { id: "dashboard", label: "Inicio", icon: "home" },
  { id: "sales", label: "Ventas", icon: "cart" },
  { id: "expenses", label: "Gastos", icon: "bag" },
  { id: "products", label: "Productos", icon: "box" },
  { id: "clients", label: "Clientes", icon: "users" },
  { id: "bank", label: "Bancos", icon: "bank" },
  { id: "reports", label: "Reportes", icon: "chart" },
  { id: "settings", label: "Ajustes", icon: "gear" },
];

// Bottom nav shows only first 5 items on mobile
const BOTTOM_NAV = NAV.slice(0, 5);

// ══════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [data, setData] = useState(defaultData());
  const [loaded, setLoaded] = useState(false);

  // Load data from persistent storage
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) setData(JSON.parse(r.value));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // Save data to persistent storage on every change
  useEffect(() => {
    if (!loaded) return;
    (async () => { try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch {} })();
  }, [data, loaded]);

  // Auto-sync to Google Sheets on data change (if configured)
  useEffect(() => {
    if (!loaded || !data.settings.apiUrl) return;
    const t = setTimeout(() => {
      SheetsAPI.setUrl(data.settings.apiUrl);
      SheetsAPI.syncAll(data).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [data, loaded]);

  const goTo = useCallback((p) => { setPage(p); window.scrollTo(0, 0); }, []);

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard data={data} goTo={goTo} />;
      case "sales": return <SalesPage data={data} setData={setData} />;
      case "expenses": return <ExpensesPage data={data} setData={setData} />;
      case "products": return <ProductsPage data={data} setData={setData} />;
      case "clients": return <ClientsPage data={data} />;
      case "bank": return <BankPage data={data} />;
      case "reports": return <ReportsPage data={data} />;
      case "settings": return <SettingsPage data={data} setData={setData} />;
      default: return <Dashboard data={data} goTo={goTo} />;
    }
  };

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, fontWeight: 900, color: "#fff", letterSpacing: -3 }}>611</div>
        <div style={{ color: "#333", fontSize: 12, marginTop: 8 }}>Cargando...</div>
      </div>
    </div>
  );

  if (!authed) return <AuthScreen onAuth={() => setAuthed(true)} />;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0a0a", fontFamily: "'DM Sans', -apple-system, sans-serif", color: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 3px; }
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input[type="number"] { -moz-appearance: textfield; }
        button:active { transform: scale(0.97); }
        tr:hover td { background: #0f0f0f; }
        .desktop-sidebar { display: flex; }
        .bottom-nav { display: none; }
        .main-area { margin-left: 200px; padding: 24px 28px; padding-bottom: 24px; }
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .bottom-nav { display: flex !important; }
          .main-area { margin-left: 0 !important; padding: 16px !important; padding-bottom: 80px !important; }
        }
      `}</style>

      {/* ── Desktop Sidebar ── */}
      <div className="desktop-sidebar" style={{ width: 200, background: "#0a0a0a", borderRight: "1px solid #131313", position: "fixed", top: 0, bottom: 0, flexDirection: "column", padding: "20px 10px", zIndex: 50 }}>
        <div style={{ padding: "6px 14px", marginBottom: 28 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", letterSpacing: -2, lineHeight: 1 }}>611</div>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 3, fontWeight: 600, marginTop: 2 }}>SEIS / ONCE</div>
        </div>
        <div style={{ flex: 1 }}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => goTo(n.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", background: page === n.id ? "#141414" : "transparent", border: page === n.id ? "1px solid #1a1a1a" : "1px solid transparent", borderRadius: 8, color: page === n.id ? "#fff" : "#444", fontSize: 13, cursor: "pointer", fontWeight: page === n.id ? 600 : 400, marginBottom: 1, transition: "all 0.1s" }}>
              <Icon name={n.icon} size={17} /> {n.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid #111", fontSize: 10, color: "#222" }}>v{APP_VERSION}</div>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <div className="bottom-nav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0a0a0a", borderTop: "1px solid #151515", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "6px 0 env(safe-area-inset-bottom, 6px)", zIndex: 50 }}>
        {BOTTOM_NAV.map((n) => (
          <button key={n.id} onClick={() => goTo(n.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", color: page === n.id ? "#fff" : "#444", cursor: "pointer", padding: "4px 8px", fontSize: 10, fontWeight: page === n.id ? 600 : 400, transition: "color 0.15s" }}>
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </button>
        ))}
        <button onClick={() => goTo(page === "settings" ? "dashboard" : ["bank", "reports", "settings"].find((p) => p !== page) ? "bank" : "bank")} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", color: ["bank", "reports", "settings"].includes(page) ? "#fff" : "#444", cursor: "pointer", padding: "4px 8px", fontSize: 10 }}>
          <Icon name="chart" size={20} />
          <span>Más</span>
        </button>
      </div>

      {/* ── Main Content ── */}
      <div className="main-area" style={{ flex: 1, minHeight: "100vh" }}>
        {renderPage()}
      </div>
    </div>
  );
}
