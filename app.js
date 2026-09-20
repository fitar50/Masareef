"use strict";

const CATEGORIES = [
  { key: "food", label: "طعام", color: "var(--food)" },
  { key: "drinks", label: "مشروبات", color: "var(--drinks)" },
  { key: "transport", label: "مواصلات", color: "var(--transport)" },
  { key: "other", label: "أخرى", color: "var(--other)" },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
const AR_MONTHS = ["يناير","فبراير","مارس","ابريل","مايو","يونيو","يوليو","اغسطس","سبتمبر","اكتوبر","نوفمبر","ديسمبر"];

const PW_KEY = "masareef_pw";
let selectedAdd = "food";
let selectedEdit = "food";
let selectedRec = "other";
let editingId = null;
let deletingId = null;
let currentOffset = 0;
let lastSummary = null;

const $ = (id) => document.getElementById(id);
const getPw = () => localStorage.getItem(PW_KEY) || "";
const setPw = (v) => localStorage.setItem(PW_KEY, v);
const clearPw = () => localStorage.removeItem(PW_KEY);

function normalizeNumber(s) {
  if (s == null) return "";
  const map = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9","٫":".","،":".","," : "." };
  return String(s).replace(/[٠-٩٫،,]/g, (d) => map[d] ?? d).trim();
}
function fmtMoney(n) { return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function todayLocalISO() { return new Date().toLocaleDateString("en-CA"); }

function fmtDate(iso) {
  return new Intl.DateTimeFormat("ar-u-nu-latn", {
    timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}
function cycleLabel(startDate, endDate) {
  const s = startDate.split("-"), e = endDate.split("-");
  return `من ${Number(s[2])} ${AR_MONTHS[Number(s[1]) - 1]} لـ ${Number(e[2])} ${AR_MONTHS[Number(e[1]) - 1]}`;
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => (t.hidden = true), 200); }, 1600);
}

async function api(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json", Authorization: "Bearer " + getPw() }, opts.headers || {});
  const res = await fetch(BACKEND_URL + path, Object.assign({}, opts, { headers }));
  if (res.status === 401) { clearPw(); showLogin(); throw new Error("unauthorized"); }
  return res;
}

function showLogin() { $("app").hidden = true; $("login").hidden = false; $("pw").value = ""; $("pw").focus(); }
function showApp() { $("login").hidden = true; $("app").hidden = false; }

async function doLogin() {
  const pw = $("pw").value;
  if (!pw) return;
  $("loginErr").hidden = true;
  try {
    const res = await fetch(BACKEND_URL + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (res.ok) { setPw(pw); showApp(); switchView("add"); }
    else { $("loginErr").textContent = "كلمة السر غلط"; $("loginErr").hidden = false; }
  } catch (e) {
    $("loginErr").textContent = "مش قادر يوصل للسيرفر. اتأكد إنه شغال والرابط صح."; $("loginErr").hidden = false;
  }
}

function buildChips(container, selectedKey, onPick) {
  container.innerHTML = "";
  CATEGORIES.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (c.key === selectedKey ? " selected" : "");
    b.style.setProperty("--c", c.color);
    b.innerHTML = `<span class="dot"></span>${c.label}`;
    b.addEventListener("click", () => {
      onPick(c.key);
      [...container.children].forEach((ch) => ch.classList.remove("selected"));
      b.classList.add("selected");
    });
    container.appendChild(b);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

// ---- add ----------------------------------------------------------------
function resetDate() { $("date").value = todayLocalISO(); $("dateToday").hidden = true; }

async function saveTransaction() {
  const raw = normalizeNumber($("amount").value);
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount <= 0) { toast("اكتب مبلغ صح"); $("amount").focus(); return; }
  const note = $("note").value.trim();
  const dateVal = $("date").value;
  const body = { amount, category: selectedAdd };
  if (note) body.note = note;
  if (dateVal && dateVal !== todayLocalISO()) body.date = dateVal;

  const btn = $("saveBtn"); btn.disabled = true;
  try {
    const res = await api("/api/transactions", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) throw new Error("save failed");
    $("amount").value = ""; $("note").value = ""; resetDate(); $("amount").focus();
    toast("تم التسجيل");
  } catch (e) { if (e.message !== "unauthorized") toast("حصل خطأ، جرب تاني"); }
  finally { btn.disabled = false; }
}

// ---- stats --------------------------------------------------------------
function renderHeadline(s) {
  const h = $("headline");
  if (s.budget == null) {
    h.innerHTML = `<div class="hl-label">صرفت الدورة دي</div><div class="hl-num">${fmtMoney(s.total)} <span class="hl-cur">جنيه</span></div>`;
    return;
  }
  const over = s.remaining < 0;
  const daysLeft = s.isCurrent && s.daysLeft ? s.daysLeft : null;
  const safeDaily = over || !daysLeft ? 0 : Math.floor(s.remaining / daysLeft);
  let sub = "";
  if (s.isCurrent) {
    sub = `<div class="hl-sub">` +
      `<div class="hl-cell"><b>${fmtMoney(s.total)}</b><span>اتصرف</span></div>` +
      `<div class="hl-cell"><b>${daysLeft}</b><span>يوم باقي</span></div>` +
      `<div class="hl-cell"><b>${over ? "0" : fmtMoney(safeDaily)}</b><span>في اليوم</span></div>` +
      `</div>`;
  } else {
    sub = `<div class="hl-sub"><div class="hl-cell"><b>${fmtMoney(s.total)}</b><span>اتصرف</span></div>` +
      `<div class="hl-cell"><b>${fmtMoney(s.budget)}</b><span>الميزانية</span></div></div>`;
  }
  const label = over ? `<span class="hl-over">عديت الميزانية بـ ${fmtMoney(Math.abs(s.remaining))}</span>` : "متبقي ليك";
  const numClass = over ? "hl-num hl-over" : "hl-num";
  h.innerHTML = `<div class="hl-label">${label}</div><div class="${numClass}">${fmtMoney(s.remaining)} <span class="hl-cur">جنيه</span></div>${sub}`;
}

async function loadStats() {
  let summary, txns;
  try {
    const [sRes, tRes] = await Promise.all([
      api("/api/summary?offset=" + currentOffset),
      api("/api/transactions?offset=" + currentOffset),
    ]);
    summary = await sRes.json(); txns = await tRes.json();
  } catch (e) { if (e.message !== "unauthorized") toast("مش قادر يحمّل البيانات"); return; }

  lastSummary = summary;
  $("cycleRange").textContent = cycleLabel(summary.cycleStart, summary.cycleEnd);
  $("nextCycle").disabled = currentOffset >= 0;
  renderHeadline(summary);

  const bd = $("breakdown"); bd.innerHTML = "";
  const max = Math.max(1, ...summary.byCategory.map((c) => c.total));
  summary.byCategory.slice().sort((a, b) => b.total - a.total).forEach((c) => {
    const meta = CAT[c.category] || { label: c.category, color: "var(--other)" };
    const row = document.createElement("div");
    row.className = "bd-row"; row.style.setProperty("--c", meta.color);
    row.innerHTML = `<div class="bd-top"><span class="bd-name"><span class="dot"></span>${meta.label}</span><span class="bd-amt">${fmtMoney(c.total)} ج</span></div><div class="bd-bar"><div class="bd-fill" style="width:${(c.total / max) * 100}%"></div></div>`;
    bd.appendChild(row);
  });

  const list = $("txList"); list.innerHTML = "";
  $("emptyState").hidden = txns.length > 0;
  txns.forEach((t) => {
    const meta = CAT[t.category] || { label: t.category, color: "var(--other)" };
    const el = document.createElement("div");
    el.className = "tx"; el.style.setProperty("--c", meta.color);
    const title = t.note ? t.note : meta.label;
    const tag = t.recurring_rule_id ? `<span class="tx-tag">ثابت</span> · ` : "";
    const metaText = t.note ? `${meta.label} · ${fmtDate(t.created_at)}` : fmtDate(t.created_at);
    el.innerHTML = `<span class="dot"></span><div class="tx-main"><div class="tx-note">${escapeHtml(title)}</div><div class="tx-meta">${tag}${escapeHtml(metaText)}</div></div><div class="tx-amt">${fmtMoney(t.amount)} ج</div><div class="tx-acts"></div>`;
    const acts = el.querySelector(".tx-acts");
    const edit = document.createElement("button"); edit.className = "icon-btn"; edit.textContent = "✎";
    edit.addEventListener("click", () => openEdit(t));
    const del = document.createElement("button"); del.className = "icon-btn"; del.textContent = "🗑";
    del.addEventListener("click", () => openDelete(t.id));
    acts.append(edit, del);
    list.appendChild(el);
  });
}

// ---- edit ---------------------------------------------------------------
function openEdit(t) {
  editingId = t.id; selectedEdit = t.category;
  $("editAmount").value = fmtMoney(t.amount);
  $("editNote").value = t.note || "";
  buildChips($("editChips"), selectedEdit, (k) => (selectedEdit = k));
  $("editSheet").hidden = false;
}
async function saveEdit() {
  const raw = normalizeNumber($("editAmount").value);
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount <= 0) { toast("اكتب مبلغ صح"); return; }
  try {
    const res = await api("/api/transactions/" + editingId, { method: "PUT", body: JSON.stringify({ amount, category: selectedEdit, note: $("editNote").value.trim() }) });
    if (!res.ok) throw new Error("edit failed");
    $("editSheet").hidden = true; editingId = null; toast("اتعدل"); loadStats();
  } catch (e) { if (e.message !== "unauthorized") toast("حصل خطأ"); }
}

// ---- delete -------------------------------------------------------------
function openDelete(id) { deletingId = id; $("confirm").hidden = false; }
async function doDelete() {
  try {
    const res = await api("/api/transactions/" + deletingId, { method: "DELETE" });
    if (!res.ok && res.status !== 204) throw new Error("delete failed");
    $("confirm").hidden = true; deletingId = null; toast("اتمسح"); loadStats();
  } catch (e) { if (e.message !== "unauthorized") toast("حصل خطأ"); }
}

// ---- settings -----------------------------------------------------------
async function openSettings() {
  buildChips($("recChips"), selectedRec, (k) => (selectedRec = k));
  // budget prefill: effective budget for the viewed cycle if known, else default
  let prefill = lastSummary && lastSummary.budget != null ? lastSummary.budget : null;
  if (prefill == null) {
    try { const st = await (await api("/api/settings")).json(); prefill = st.defaultBudget; } catch (e) {}
  }
  $("budgetInput").value = prefill != null ? fmtMoney(prefill) : "";
  await loadRecurring();
  $("settingsSheet").hidden = false;
}
async function saveBudget() {
  const raw = normalizeNumber($("budgetInput").value);
  const amount = raw === "" ? 0 : Number(raw);
  try {
    const res = await api("/api/budget", { method: "PUT", body: JSON.stringify({ offset: currentOffset, amount, makeDefault: $("budgetDefault").checked }) });
    if (!res.ok) throw new Error("budget failed");
    toast("اتحفظت"); loadStats();
  } catch (e) { if (e.message !== "unauthorized") toast("حصل خطأ"); }
}
async function loadRecurring() {
  let rules = [];
  try { rules = await (await api("/api/recurring")).json(); } catch (e) { return; }
  const box = $("recurringList"); box.innerHTML = "";
  if (rules.length === 0) { box.innerHTML = `<div class="rec-sub">مفيش مصاريف ثابتة.</div>`; return; }
  rules.forEach((r) => {
    const meta = CAT[r.category] || { label: r.category, color: "var(--other)" };
    const el = document.createElement("div");
    el.className = "rec-item"; el.style.setProperty("--c", meta.color);
    el.innerHTML = `<span class="dot"></span><div class="rec-main"><div>${escapeHtml(r.note || meta.label)} · ${fmtMoney(r.amount)} ج</div><div class="rec-sub">${meta.label} · يوم ${r.day_of_month} من كل شهر</div></div><button class="icon-btn" data-id="${r.id}">🗑</button>`;
    el.querySelector("button").addEventListener("click", async () => {
      try { await api("/api/recurring/" + r.id, { method: "DELETE" }); toast("اتمسح"); loadRecurring(); loadStats(); }
      catch (e) { if (e.message !== "unauthorized") toast("حصل خطأ"); }
    });
    box.appendChild(el);
  });
}
async function addRecurring() {
  const raw = normalizeNumber($("recAmount").value);
  const amount = Number(raw);
  const day = Number(normalizeNumber($("recDay").value));
  if (!raw || !Number.isFinite(amount) || amount <= 0) { toast("اكتب مبلغ صح"); return; }
  if (!Number.isInteger(day) || day < 1 || day > 28) { toast("اليوم لازم من 1 لـ 28"); return; }
  try {
    const res = await api("/api/recurring", { method: "POST", body: JSON.stringify({ amount, category: selectedRec, note: $("recNote").value.trim() || undefined, day_of_month: day }) });
    if (!res.ok) throw new Error("rec failed");
    $("recAmount").value = ""; $("recDay").value = ""; $("recNote").value = "";
    toast("اتزود"); loadRecurring(); loadStats();
  } catch (e) { if (e.message !== "unauthorized") toast("حصل خطأ"); }
}
async function exportCsv() {
  try {
    const res = await api("/api/export.csv");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "masareef.csv"; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  } catch (e) { if (e.message !== "unauthorized") toast("حصل خطأ في التصدير"); }
}

// ---- nav ----------------------------------------------------------------
function switchView(view) {
  const isAdd = view === "add";
  $("viewAdd").hidden = !isAdd; $("viewStats").hidden = isAdd;
  $("tabAdd").classList.toggle("active", isAdd);
  $("tabStats").classList.toggle("active", !isAdd);
  if (isAdd) $("amount").focus();
  else { currentOffset = 0; loadStats(); }
}

function init() {
  buildChips($("chips"), selectedAdd, (k) => (selectedAdd = k));
  resetDate();

  $("loginBtn").addEventListener("click", doLogin);
  $("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  $("saveBtn").addEventListener("click", saveTransaction);
  $("amount").addEventListener("keydown", (e) => { if (e.key === "Enter") saveTransaction(); });
  $("date").addEventListener("change", () => { $("dateToday").hidden = $("date").value === todayLocalISO(); });
  $("dateToday").addEventListener("click", resetDate);

  $("tabAdd").addEventListener("click", () => switchView("add"));
  $("tabStats").addEventListener("click", () => switchView("stats"));
  $("prevCycle").addEventListener("click", () => { currentOffset -= 1; loadStats(); });
  $("nextCycle").addEventListener("click", () => { if (currentOffset < 0) { currentOffset += 1; loadStats(); } });

  $("editCancel").addEventListener("click", () => { $("editSheet").hidden = true; editingId = null; });
  $("editSave").addEventListener("click", saveEdit);
  $("confirmNo").addEventListener("click", () => { $("confirm").hidden = true; deletingId = null; });
  $("confirmYes").addEventListener("click", doDelete);

  $("gear").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", () => { $("settingsSheet").hidden = true; });
  $("budgetSave").addEventListener("click", saveBudget);
  $("recAdd").addEventListener("click", addRecurring);
  $("exportBtn").addEventListener("click", exportCsv);
  $("logoutBtn").addEventListener("click", () => { clearPw(); $("settingsSheet").hidden = true; showLogin(); });

  ["editSheet", "confirm", "settingsSheet"].forEach((id) => {
    $(id).addEventListener("click", (e) => { if (e.target.id === id) $(id).hidden = true; });
  });

  if (getPw()) {
    api("/api/summary").then((r) => { if (r.ok) { showApp(); switchView("add"); } }).catch(() => {});
  } else { showLogin(); }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
document.addEventListener("DOMContentLoaded", init);
