"use strict";

// ---- category config: stable key -> Arabic label + color ----------------
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
let editingId = null;
let deletingId = null;

// ---- helpers ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function getPw() { return localStorage.getItem(PW_KEY) || ""; }
function setPw(v) { localStorage.setItem(PW_KEY, v); }
function clearPw() { localStorage.removeItem(PW_KEY); }

// Convert Arabic-Indic digits and decimal marks to plain ASCII.
function normalizeNumber(s) {
  if (s == null) return "";
  const map = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9","٫":".","،":".","," : "." };
  return String(s).replace(/[٠-٩٫،,]/g, (d) => map[d] ?? d).trim();
}

function fmtMoney(n) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("ar-u-nu-latn", {
    timeZone: "Africa/Cairo",
    weekday: "short", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit",
  });
  return fmt.format(d);
}

function cycleLabel(startDate, endDate) {
  // startDate/endDate are "YYYY-MM-DD" local dates from the API.
  const s = startDate.split("-");
  const e = endDate.split("-");
  return `من ${Number(s[2])} ${AR_MONTHS[Number(s[1]) - 1]} لـ ${Number(e[2])} ${AR_MONTHS[Number(e[1]) - 1]}`;
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => (t.hidden = true), 200);
  }, 1600);
}

// ---- api ----------------------------------------------------------------
async function api(path, opts = {}) {
  const headers = Object.assign(
    { "Content-Type": "application/json", Authorization: "Bearer " + getPw() },
    opts.headers || {}
  );
  const res = await fetch(BACKEND_URL + path, Object.assign({}, opts, { headers }));
  if (res.status === 401) {
    clearPw();
    showLogin();
    throw new Error("unauthorized");
  }
  return res;
}

// ---- login --------------------------------------------------------------
function showLogin() {
  $("app").hidden = true;
  $("login").hidden = false;
  $("pw").value = "";
  $("pw").focus();
}
function showApp() {
  $("login").hidden = true;
  $("app").hidden = false;
}

async function doLogin() {
  const pw = $("pw").value;
  if (!pw) return;
  $("loginErr").hidden = true;
  try {
    const res = await fetch(BACKEND_URL + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      setPw(pw);
      showApp();
      $("amount").focus();
    } else {
      $("loginErr").hidden = false;
    }
  } catch (e) {
    $("loginErr").textContent = "مش قادر يوصل للسيرفر. اتأكد إنه شغال والرابط صح.";
    $("loginErr").hidden = false;
  }
}

// ---- chips --------------------------------------------------------------
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

// ---- add flow -----------------------------------------------------------
async function saveTransaction() {
  const raw = normalizeNumber($("amount").value);
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount <= 0) {
    toast("اكتب مبلغ صح");
    $("amount").focus();
    return;
  }
  const note = $("note").value.trim();
  const btn = $("saveBtn");
  btn.disabled = true;
  try {
    const res = await api("/api/transactions", {
      method: "POST",
      body: JSON.stringify({ amount, category: selectedAdd, note: note || undefined }),
    });
    if (!res.ok) throw new Error("save failed");
    $("amount").value = "";
    $("note").value = "";
    $("amount").focus();
    toast("تم التسجيل");
  } catch (e) {
    if (e.message !== "unauthorized") toast("حصل خطأ، جرب تاني");
  } finally {
    btn.disabled = false;
  }
}

// ---- stats flow ---------------------------------------------------------
async function loadStats() {
  let summary, txns;
  try {
    const [sRes, tRes] = await Promise.all([api("/api/summary"), api("/api/transactions")]);
    summary = await sRes.json();
    txns = await tRes.json();
  } catch (e) {
    if (e.message !== "unauthorized") toast("مش قادر يحمّل البيانات");
    return;
  }

  $("cycleRange").textContent = cycleLabel(summary.cycleStart, summary.cycleEnd);
  $("totalNum").textContent = fmtMoney(summary.total);

  // breakdown, largest first
  const bd = $("breakdown");
  bd.innerHTML = "";
  const max = Math.max(1, ...summary.byCategory.map((c) => c.total));
  summary.byCategory
    .slice()
    .sort((a, b) => b.total - a.total)
    .forEach((c) => {
      const meta = CAT[c.category] || { label: c.category, color: "var(--other)" };
      const row = document.createElement("div");
      row.className = "bd-row";
      row.style.setProperty("--c", meta.color);
      row.innerHTML =
        `<div class="bd-top">` +
        `<span class="bd-name"><span class="dot"></span>${meta.label}</span>` +
        `<span class="bd-amt">${fmtMoney(c.total)} ج</span>` +
        `</div>` +
        `<div class="bd-bar"><div class="bd-fill" style="width:${(c.total / max) * 100}%"></div></div>`;
      bd.appendChild(row);
    });

  // transaction list
  const list = $("txList");
  list.innerHTML = "";
  $("emptyState").hidden = txns.length > 0;
  txns.forEach((t) => {
    const meta = CAT[t.category] || { label: t.category, color: "var(--other)" };
    const el = document.createElement("div");
    el.className = "tx";
    el.style.setProperty("--c", meta.color);
    const title = t.note ? t.note : meta.label;
    const sub = t.note ? `${meta.label} · ${fmtDate(t.created_at)}` : fmtDate(t.created_at);
    el.innerHTML =
      `<span class="dot"></span>` +
      `<div class="tx-main"><div class="tx-note">${escapeHtml(title)}</div><div class="tx-meta">${escapeHtml(sub)}</div></div>` +
      `<div class="tx-amt">${fmtMoney(t.amount)} ج</div>` +
      `<div class="tx-acts"></div>`;
    const acts = el.querySelector(".tx-acts");
    const edit = document.createElement("button");
    edit.className = "icon-btn"; edit.title = "تعديل"; edit.textContent = "✎";
    edit.addEventListener("click", () => openEdit(t));
    const del = document.createElement("button");
    del.className = "icon-btn"; del.title = "مسح"; del.textContent = "🗑";
    del.addEventListener("click", () => openDelete(t.id));
    acts.append(edit, del);
    list.appendChild(el);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ---- edit ---------------------------------------------------------------
function openEdit(t) {
  editingId = t.id;
  selectedEdit = t.category;
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
    const res = await api("/api/transactions/" + editingId, {
      method: "PUT",
      body: JSON.stringify({ amount, category: selectedEdit, note: $("editNote").value.trim() }),
    });
    if (!res.ok) throw new Error("edit failed");
    $("editSheet").hidden = true;
    editingId = null;
    toast("اتعدل");
    loadStats();
  } catch (e) {
    if (e.message !== "unauthorized") toast("حصل خطأ");
  }
}

// ---- delete -------------------------------------------------------------
function openDelete(id) { deletingId = id; $("confirm").hidden = false; }
async function doDelete() {
  try {
    const res = await api("/api/transactions/" + deletingId, { method: "DELETE" });
    if (!res.ok && res.status !== 204) throw new Error("delete failed");
    $("confirm").hidden = true;
    deletingId = null;
    toast("اتمسح");
    loadStats();
  } catch (e) {
    if (e.message !== "unauthorized") toast("حصل خطأ");
  }
}

// ---- nav ----------------------------------------------------------------
function switchView(view) {
  const isAdd = view === "add";
  $("viewAdd").hidden = !isAdd;
  $("viewStats").hidden = isAdd;
  $("tabAdd").classList.toggle("active", isAdd);
  $("tabStats").classList.toggle("active", !isAdd);
  if (isAdd) $("amount").focus();
  else loadStats();
}

// ---- wire up ------------------------------------------------------------
function init() {
  buildChips($("chips"), selectedAdd, (k) => (selectedAdd = k));

  $("loginBtn").addEventListener("click", doLogin);
  $("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  $("saveBtn").addEventListener("click", saveTransaction);
  $("amount").addEventListener("keydown", (e) => { if (e.key === "Enter") saveTransaction(); });

  $("tabAdd").addEventListener("click", () => switchView("add"));
  $("tabStats").addEventListener("click", () => switchView("stats"));

  $("editCancel").addEventListener("click", () => { $("editSheet").hidden = true; editingId = null; });
  $("editSave").addEventListener("click", saveEdit);
  $("confirmNo").addEventListener("click", () => { $("confirm").hidden = true; deletingId = null; });
  $("confirmYes").addEventListener("click", doDelete);

  // close sheets when tapping the dim backdrop
  ["editSheet", "confirm"].forEach((id) => {
    $(id).addEventListener("click", (e) => { if (e.target.id === id) { $(id).hidden = true; } });
  });

  // decide first screen
  if (getPw()) {
    // verify the stored password still works; if not, api() will bounce to login
    api("/api/summary").then((r) => { if (r.ok) { showApp(); switchView("add"); } }).catch(() => {});
  } else {
    showLogin();
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

document.addEventListener("DOMContentLoaded", init);
