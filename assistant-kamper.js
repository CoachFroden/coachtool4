import { auth, db } from "./firebase-refleksjon.js";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const subLine = document.getElementById("subLine");
const listEl = document.getElementById("list");
const assistantSelect = document.getElementById("assistantSelect");
const statusSelect = document.getElementById("statusSelect");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");

let coachUid = null;
let assistants = []; // [{ uid, name/email }]
let allRows = [];    // flattened matches

logoutBtn.onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};

refreshBtn.onclick = async () => {
  await loadEverything();
  render();
};

assistantSelect.onchange = render;
statusSelect.onchange = render;

function safeText(v) {
  return (v ?? "").toString().trim();
}

function fmtMatchTitle(m) {
  const date = safeText(m.meta?.date) || "Ukjent dato";
  const time = safeText(m.meta?.startTime);
  const opponent = safeText(m.meta?.opponent) || "Ukjent motstander";
  const timePart = time ? ` ${time}` : "";
  return `${date}${timePart} • ${opponent}`;
}

function fmtSub(m) {
  const type = safeText(m.meta?.type) || "type?";
  const venue = safeText(m.meta?.venue) || "venue?";
  const score = (m.score && typeof m.score.our === "number" && typeof m.score.their === "number")
    ? `${m.score.our}-${m.score.their}`
    : "—";
  const status = safeText(m.status) || "—";
  return `${type} • ${venue} • ${score} • ${status}`;
}

function statusTagClass(status) {
  if (status === "ENDED") return "ok";
  if (status === "UPCOMING") return "warn";
  return "bad";
}

async function ensureCoach(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) return false;
  return snap.data()?.role === "coach";
}

async function loadAssistants() {
  // users where role == assistantCoach
  const q = query(collection(db, "users"), where("role", "==", "assistantCoach"));
  const snap = await getDocs(q);

  const out = [];
  snap.forEach(d => {
    const u = d.data() || {};
    const name = u.name || u.navn || u.email || d.id;
    out.push({ uid: d.id, name });
  });

  out.sort((a, b) => a.name.localeCompare(b.name, "no"));
  assistants = out;

  assistantSelect.innerHTML = `
  <option value="all">Alle assistenter</option>
  <option value="official">Kun official matches</option>
`;
  out.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.uid;
    opt.textContent = a.name;
    assistantSelect.appendChild(opt);
  });
}

async function loadAssistantMatches(assistantUid) {
  const snap = await getDocs(collection(db, "assistantMatches", assistantUid, "matches"));

  const rows = [];
  snap.forEach(d => {
    rows.push({
      id: d.id,
      assistantUid,
      ...d.data()
    });
  });

  // sort by date desc, fallback updatedAt
  rows.sort((a, b) => {
    const da = safeText(a.meta?.date);
    const dbb = safeText(b.meta?.date);
    if (da && dbb) return dbb.localeCompare(da);
    return 0;
  });

  return rows;
}

async function loadOfficialMatches() {
  const snap = await getDocs(collection(db, "matches"));

  const rows = [];
  snap.forEach(d => {
    rows.push({
      id: d.id,
      source: "official",
      ...d.data()
    });
  });

  return rows;
}

async function loadEverything() {
  subLine.textContent = "Laster assistenter…";
  await loadAssistants();

  subLine.textContent = "Laster kamper…";
allRows = [];

// 1️⃣ AssistantMatches
for (const a of assistants) {
  const matches = await loadAssistantMatches(a.uid);
  matches.forEach(m =>
    allRows.push({
      ...m,
      source: "assistant"
    })
  );
}

// 2️⃣ Official matches
const officialMatches = await loadOfficialMatches();
officialMatches.forEach(m => allRows.push(m));

  subLine.textContent = `Fant ${allRows.length} kamp(er) fra ${assistants.length} assistent(er).`;
}

function render() {

  const aFilter = assistantSelect.value;
  const sFilter = statusSelect.value;

  console.log("Status filter:", sFilter);

  let rows = [...allRows];
  
  console.log("ALL ROWS:", allRows);
console.log("Archive candidates:",
  allRows.filter(r => r.source === "assistant" && r.approvedToMatches)
);
  
  if (sFilter === "all") {
  rows = rows.filter(r => !(r.source === "assistant" && r.approvedToMatches));
}
  
// --- FILTER START ---

// 1. Assistant filter (ikke bruk på arkiv)
if (sFilter !== "ARCHIVE") {
  if (aFilter === "official") {
    rows = rows.filter(r => r.source === "official");
  } 
  else if (aFilter !== "all") {
    rows = rows.filter(r =>
      (r.source === "assistant" && r.assistantUid === aFilter) ||
      (r.source === "official" && r.approvedFromAssistant === aFilter)
    );
  }
}

// 2. Status filter
if (sFilter === "PENDING") {
  rows = rows.filter(r => r.source === "assistant" && !r.approvedToMatches);
}
else if (sFilter === "APPROVED") {
  // anbefalt: kun matches (ferdigbehandlet)
  rows = rows.filter(r => r.source === "official");
}

else if (sFilter === "UPCOMING") {
  rows = rows.filter(r =>
    r.source === "official" && r.status === "UPCOMING"
  );
}
else if (sFilter === "ENDED") {
  rows = rows.filter(r =>
    r.source === "official" && r.status === "ENDED"
  );
}
else if (sFilter === "ARCHIVE") {
	
	
  const officialIds = new Set(
    allRows
      .filter(r => r.source === "official")
      .map(r => r.id)
  );
  
  

  rows = rows.filter(r =>
    r.source === "assistant" && officialIds.has(r.id)
  );
}

// --- FILTER END ---

if (!rows.length) {
  listEl.innerHTML = `<div class="empty">Ingen kamper for valgt filter.</div>`;
  return;
}

  listEl.innerHTML = "";

  rows.forEach(m => {
    const assistantName = assistants.find(a => a.uid === m.assistantUid)?.name || m.assistantUid;
const approved = (m.source === "official" || !!m.approvedToMatches);

    const card = document.createElement("div");
    card.className = "card";

card.innerHTML = `
  <div class="row">
    <div class="meta">
      <div class="line1">${fmtMatchTitle(m)}</div>
      <div class="line2">${fmtSub(m)}</div>
    </div>
  </div>

<div class="tags">
  <span class="tag ${m.source === "official" ? "ok" : "blue"}">
    ${m.source === "official" ? "Official match" : "Assistant match"}
  </span>

  <span class="tag blue">Assistent: ${assistantName || "—"}</span>
  <span class="tag warn">
    Status: ${safeText(m.status) || "—"}
  </span>
  <span class="tag ${approved ? "ok" : "bad"}">
    ${approved ? "Godkjent" : "Ikke godkjent"}
  </span>
</div>

  <div class="actions">
    <button class="actionBtn ghost" data-act="edit">Rediger</button>
  </div>
`;

const editBtn = card.querySelector('[data-act="edit"]');

if (m.source === "official") {
  editBtn.onclick = () => {
    const url = `edit-match.html?source=official&matchId=${encodeURIComponent(m.id)}`;
    window.location.href = url;
  };
} else {
  editBtn.onclick = () => {
    const url = `edit-match.html?source=assistant&assistantUid=${encodeURIComponent(m.assistantUid)}&matchId=${encodeURIComponent(m.id)}`;
    window.location.href = url;
  };
}

    listEl.appendChild(card);
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const ok = await ensureCoach(user);
  if (!ok) {
    alert("Kun coach har tilgang.");
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

coachUid = user.uid;

await loadEverything();

statusSelect.value = "all";
assistantSelect.value = "all";

render();;
});