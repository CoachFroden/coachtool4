import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const userLine = document.getElementById("userLine");
const roleLine = document.getElementById("roleLine");
const logoutBtn = document.getElementById("logoutBtn");
const errorMsg = document.getElementById("errorMsg");
const tabPlayers = document.getElementById("tabPlayers");
const tabMatch = document.getElementById("tabMatch");
const playersPanel = document.getElementById("playersPanel");
const matchPanel = document.getElementById("matchPanel");
const matchSelect = document.getElementById("matchSelect");
const matchArea = document.getElementById("matchArea");

const playersSelect = document.getElementById("playersSelect");const entriesEl = document.getElementById("entries");
const selectedPlayerEl = document.getElementById("selectedPlayer");



let utviklingsbank = {};

async function loadUtviklingsbank() {
  const response = await fetch("utviklingsbank.json");
  utviklingsbank = await response.json();
}

const rightPanel = document.getElementById("rightPanel");
const rightTitle = document.getElementById("rightTitle");

function hideRightPanel() {
  rightPanel?.classList.add("isHidden");
}

function showRightPanel(title, hintText = "") {
  if (rightTitle) rightTitle.textContent = title;
  if (hintText && selectedPlayerEl) selectedPlayerEl.textContent = hintText;
  rightPanel?.classList.remove("isHidden");
}

let currentUid = null;

function setError(msg) {
  errorMsg.textContent = msg || "";
}

logoutBtn.onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html"; // tilbake til login
};

async function loadPlayers() {
  playersSelect.innerHTML = `<option value="">Laster spillere…</option>`;

  try {
    const snap = await getDocs(collection(db, "spillere"));

    if (snap.empty) {
      playersSelect.innerHTML = `<option value="">Ingen spillere funnet</option>`;
      return;
    }

    const rows = [];
snap.forEach(d => {
  const data = d.data() || {};
  const navn = data.navn || data.name || d.id;

  // Bruk uid hvis det finnes, ellers fallback til docId
  const uid = data.uid;

  rows.push({ id: uid || d.id, navn });
});

    rows.sort((a, b) => a.navn.localeCompare(b.navn, "no"));

    playersSelect.innerHTML = `<option value="">Velg spiller…</option>`;

    rows.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.navn;
      opt.dataset.name = p.navn;
      playersSelect.appendChild(opt);
    });

  } catch (e) {
    playersSelect.innerHTML = `<option value="">Feil ved lasting</option>`;
    setError(String(e?.message || e));
  }
}

playersSelect.addEventListener("change", (e) => {
  const playerId = e.target.value;
  const selectedOption = e.target.selectedOptions[0];
  const playerName = selectedOption?.dataset?.name;

  if (!playerId) {
    selectedPlayerEl.textContent = "Velg en spiller.";
    entriesEl.innerHTML = "";
    return;
  }
  showRightPanel("Refleksjoner", `Valgt: ${playerName || ""}`);
  initReflections(playerId, playerName);
});

async function initReflections(playerId, playerName) {
  setError("");
  selectedPlayerEl.textContent = `Valgt: ${playerName}`;
  entriesEl.innerHTML = `<div class="item">Laster uker…</div>`;

  try {
    const weeks = await loadAvailableWeeks(playerId);

    if (weeks.length === 0) {
      entriesEl.innerHTML = `<div class="item">Ingen refleksjoner funnet for denne spilleren.</div>`;
      return;
    }

    renderPlayerTabs(playerId, playerName, weeks);

  } catch (e) {
    entriesEl.innerHTML = `<div class="item">Kunne ikke hente refleksjoner.</div>`;
    setError(String(e?.message || e));
  }
}

function renderPlayerTabs(playerId, playerName, weeks) {

  entriesEl.innerHTML = `
<div class="tabRow">
  <button id="tabReflection" class="tabBtn tabBtnActive" type="button">
    Refleksjoner
  </button>
  <button id="tabPlan" class="tabBtn" type="button">
    Utviklingsplan
  </button>
</div>

    <div id="playerContent"></div>
  `;

  const reflectionBtn = document.getElementById("tabReflection");
  const planBtn = document.getElementById("tabPlan");

reflectionBtn.addEventListener("click", () => {
  reflectionBtn.classList.add("tabBtnActive");
  planBtn.classList.remove("tabBtnActive");

  document.getElementById("rightTitle").textContent = "Refleksjoner";

  renderReflectionView(playerId, weeks);
});

planBtn.addEventListener("click", () => {
  planBtn.classList.add("tabBtnActive");
  reflectionBtn.classList.remove("tabBtnActive");

  document.getElementById("rightTitle").textContent = "Utviklingsplan";

  renderDevelopmentPlan(playerId);
});

  // Default = refleksjon
  renderReflectionView(playerId, weeks);
}

function finnUtviklingsOmradeGlobal(omradeId) {
  for (const kategori in utviklingsbank) {
    const liste = utviklingsbank[kategori];
    const match = liste.find(item => item.id === omradeId);
    if (match) return match;
  }
  return null;
}

async function loadAvailableWeeks(playerId) {
  // Hent en bunt entries og bygg liste over unike (year, week)
  const entriesRef = collection(db, `refleksjoner/${playerId}/entries`);

  // Prøver createdAt-sorting hvis den finnes, men vi tåler også at den mangler.
  let snap;
  try {
    const q = query(entriesRef, orderBy("createdAt", "desc"), limit(50));
    snap = await getDocs(q);
  } catch (_) {
    // fallback hvis createdAt/orderBy gir index/field-feil
    const q = query(entriesRef, limit(50));
    snap = await getDocs(q);
  }

  const seen = new Set();
  const weeks = [];

  snap.forEach(d => {
    const data = d.data() || {};
    const week = Number(data.week);
    const year = Number(data.year);

    if (!Number.isFinite(week) || !Number.isFinite(year)) return;

    const key = `${year}-${week}`;
    if (seen.has(key)) return;

    seen.add(key);
    weeks.push({ year, week });
  });

  // Sorter: nyeste først
  weeks.sort((a, b) => (b.year - a.year) || (b.week - a.week));

  return weeks;
}

function renderReflectionView(playerId, weeks) {

  const content = document.getElementById("playerContent");

  const options = [
    `<option value="" selected disabled>Velg uke…</option>`,
    ...weeks.map(w => {
      const label = `Uke ${w.week} (${w.year})`;
      const value = `${w.year}|${w.week}`;
      return `<option value="${value}">${label}</option>`;
    })
  ].join("");

  content.innerHTML = `
    <div class="item">
      <div class="itemTitle">Velg uke</div>
      <select id="weekSelect" class="playerSelect statsSelect">
        ${options}
      </select>
    </div>

    <div id="reflectionView">
      <div class="item">Velg uke for å se refleksjonen.</div>
    </div>
  `;

  const weekSelect = document.getElementById("weekSelect");

  weekSelect.addEventListener("change", async () => {
    if (!weekSelect.value) return;

    const [yearStr, weekStr] = weekSelect.value.split("|");
    const year = Number(yearStr);
    const week = Number(weekStr);

    await loadAndRenderReflection(playerId, year, week);
  });
}

async function renderDevelopmentPlan(playerId) {

  const content = document.getElementById("playerContent");
  content.innerHTML = `<div class="item">Laster utviklingsplan…</div>`;

  try {
    const snap = await getDoc(doc(db, "utviklingsplan", playerId));

    if (!snap.exists()) {
      content.innerHTML = `<div class="item">Ingen utviklingsplan funnet.</div>`;
      return;
    }

    const data = snap.data();
	
	const omrade = finnUtviklingsOmradeGlobal(data.mainFocus);
    const focusTitle = omrade?.title || data.mainFocus || "";
	
	const treningHtml = omrade?.trening
  ? `<ul class="planList">${omrade.trening.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
  : escapeHtml(data.trainingGoal || "");

const kampHtml = omrade?.kamp
  ? `<ul class="planList">${omrade.kamp.map(k => `<li>${escapeHtml(k)}</li>`).join("")}</ul>`
  : escapeHtml(data.matchBehaviour || "");

    content.innerHTML = `
      <div class="item">
        <div class="itemTitle">Hovedfokus</div>
        <div class="itemSub">${escapeHtml(focusTitle)}</div>
      </div>

      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Utviklingsmål</div>
        <div class="itemSub">${escapeHtml(data.utviklingsmaal || "")}</div>
      </div>

      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Treningsmål</div>
        <div class="itemSub">${treningHtml}</div>
      </div>

      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Kampatferd</div>
        <div class="itemSub">${kampHtml}</div>
      </div>
    `;

  } catch (e) {
    content.innerHTML = `<div class="item">Kunne ikke hente utviklingsplan.</div>`;
    setError(String(e?.message || e));
  }
}

async function loadAndRenderReflection(playerId, year, week) {
  const view = document.getElementById("reflectionView");
  if (!view) return;

  view.innerHTML = `<div class="item">Laster refleksjon…</div>`;
  setError("");

  try {
    const entry = await getReflectionByWeek(playerId, year, week);

    if (!entry) {
      view.innerHTML = `<div class="item">Ingen refleksjon funnet for uke ${week} (${year}).</div>`;
      return;
    }

    view.innerHTML = renderReflection(entry, { playerId, year, week });
setupCoachFeedbackButton(entry);

  } catch (e) {
    view.innerHTML = `<div class="item">Kunne ikke hente refleksjon for valgt uke.</div>`;
    setError(String(e?.message || e));
  }
}

async function setupCoachFeedbackButton(entry) {
  const btn = document.getElementById("toggleCoachFbBtn");
  const box = document.getElementById("coachFeedbackBox");
  if (!btn || !box) return;

  btn.addEventListener("click", async () => {

    const isHidden = box.style.display === "none";
    box.style.display = isHidden ? "block" : "none";
    if (!isHidden) return;

    box.innerHTML = `<div class="itemSub">Laster tilbakemelding…</div>`;

    try {
      const fb = await loadCoachFeedback(entry.playerId || entry.uid || playersSelect.value);

      if (!fb) {
        box.innerHTML = `<div class="itemSub">Ingen tilbakemelding fra trener for denne uken.</div>`;
        return;
      }

      box.innerHTML = renderCoachFeedback(fb);

    } catch (e) {
      box.innerHTML = `<div class="itemSub">Kunne ikke hente tilbakemelding.</div>`;
      setError(String(e?.message || e));
    }
  });
}

async function loadCoachFeedback(playerId) {
  const fbRef = collection(db, "feedback");

  const q = query(
    fbRef,
    where("playerId", "==", playerId),
    where("type", "==", "weekly"),
    where("status", "==", "sent"),
    limit(20)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // sorter på updatedAt (nyeste først)
  rows.sort((a, b) => {
    const aT = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
    const bT = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
    return bT - aT;
  });

  return rows[0];
}

function renderCoachFeedback(fb) {
  const text = fb?.editedText || "";

  if (!text) {
    return `<div class="itemSub">Ingen tilbakemelding fra trener for denne uken.</div>`;
  }

  return `
    <div class="itemSub" style="opacity:.95;">
      ${escapeHtml(text)}
    </div>
  `;
}

async function getReflectionByWeek(playerId, year, week) {
  const entriesRef = collection(db, `refleksjoner/${playerId}/entries`);

  // Vi bruker kun equality-filters + limit og velger “nyeste” i minnet
  // (unngår orderBy+where som ofte trigger composite index).
  const q = query(
    entriesRef,
    where("year", "==", year),
    where("week", "==", week),
    limit(10)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  // Hvis det finnes flere docs samme uke, velg den med høyest createdAt (om feltet finnes)
const rows = [];
snap.forEach(d => {
  const data = d.data() || {};
  rows.push({ id: d.id, ...data });
});

  rows.sort((a, b) => {
    const aT = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const bT = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return bT - aT;
  });

  return rows[0];
}

function renderReflection(data, ctx) {
  const createdAt =
    data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString("no-NO") : "";

  const type = data.type || "";
  const effort = data.effort ?? "";
  const energy = data.energy ?? "";
  const goodThing = data.goodThing || "";
  const improveThing = data.improveThing || "";
  const workedOnSeasonGoal = data.workedOnSeasonGoal || "";

  const coachNote = data.coachNote || "";
  const coachEffort = data.coachEffort ?? "";
  const coachEnergy = data.coachEnergy ?? "";

  return `
    <div class="item">
      <div class="itemTitle">Refleksjon</div>
      <div class="itemSub">${createdAt}${type ? " · " + escapeHtml(type) : ""}</div>
    </div>

    <div class="item" style="margin-top:10px;">
      <div class="itemTitle">Oppsummering</div>
      <div class="itemSub" style="margin-top:6px;">
        Innsats: <b>${escapeHtml(String(effort))}</b> · Energi: <b>${escapeHtml(String(energy))}</b>
      </div>
      ${workedOnSeasonGoal ? `<div class="itemSub" style="margin-top:6px;">Jobbet med sesongmål: <b>${escapeHtml(workedOnSeasonGoal)}</b></div>` : ""}
    </div>

    ${goodThing ? `
      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Dette fungerte bra</div>
        <div class="itemSub" style="margin-top:6px; opacity:.9;">${escapeHtml(goodThing)}</div>
      </div>
    ` : ""}

    ${improveThing ? `
      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Dette kan forbedres</div>
        <div class="itemSub" style="margin-top:6px; opacity:.9;">${escapeHtml(improveThing)}</div>
      </div>
    ` : ""}
	
	  ${ctx ? `
    <div class="item" style="margin-top:10px;">
      <button id="toggleCoachFbBtn" class="statsSelect" style="width:100%;">
        Tilbakemelding fra trener
      </button>
      <div id="coachFeedbackBox" style="display:none; margin-top:10px;"></div>
    </div>
  ` : ""}

  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function placeLabelFromVenue(venue) {
  if (venue === "home") return "Hjemme";
  if (venue === "away") return "Borte";
  return "Ukjent sted";
}

function formatDateStringNo(isoDate) {
  // isoDate: "2026-01-31"
  if (!isoDate || typeof isoDate !== "string") return "(ukjent dato)";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

async function loadPlayedMatches(coachUid) {
  setError("");
  selectedPlayerEl.textContent = "Spilte kamper";
  entriesEl.innerHTML = `<div class="item">Laster spilte kamper…</div>`;

  try {
    const matchesRef = collection(db, "matches");
    const q = query(matchesRef, limit(50));
    const snap = await getDocs(q);

    const rows = [];
    snap.forEach(d => {
      const m = d.data() || {};

      const opponent = m?.meta?.opponent || "(ukjent motstander)";
      const date = m?.meta?.date || null;
      const venue = m?.meta?.venue || null;

      const our = m?.score?.our;
      const their = m?.score?.their;

      const hasScore = Number.isFinite(our) && Number.isFinite(their);
      if (!hasScore) return; // bare ferdige kamper

      rows.push({ opponent, date, venue, our, their, result: m.result });
    });
	
    rows.sort((a, b) => (b.date || "").localeCompare(a.date || "")); 
    if (rows.length === 0) {
      entriesEl.innerHTML = `<div class="item">Ingen spilte kamper funnet.</div>`;
      return;
    }

    entriesEl.innerHTML = "";
    rows.forEach(m => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="itemTitle">${m.opponent}</div>
<div class="itemSub">
  ${formatDateStringNo(m.date)} · 
  ${placeLabelFromVenue(m.venue)} · 
  ${m.our}–${m.their}
  ${m.our > m.their ? " · Seier" :
    m.our < m.their ? " · Tap" :
    " · Uavgjort"}
</div>
      `;
      entriesEl.appendChild(div);
    });

  } catch (e) {
    entriesEl.innerHTML = `<div class="item">Kunne ikke hente spilte kamper.</div>`;
    setError(String(e?.message || e));
  }
}

function showPlayersView() {
  tabPlayers.classList.add("isActive");
  tabMatch.classList.remove("isActive");
  tabPlayers.setAttribute("aria-selected", "true");
  tabMatch.setAttribute("aria-selected", "false");

  playersPanel.classList.remove("isHidden");
  matchPanel.classList.add("isHidden");
  
  playersSelect.value = "";
  hideRightPanel();
  document.getElementById("rightTitle").textContent = "Refleksjoner";
  selectedPlayerEl.textContent = "Velg en spiller.";
  entriesEl.innerHTML = "";
  setError("");
}

function showMatchView() {
  tabMatch.classList.add("isActive");
  tabPlayers.classList.remove("isActive");
  tabMatch.setAttribute("aria-selected", "true");
  tabPlayers.setAttribute("aria-selected", "false");

  matchPanel.classList.remove("isHidden");
  playersPanel.classList.add("isHidden");

  // ✅ Nullstill kampvalg og skjul høyre panel til noe velges
  matchSelect.value = "";
  hideRightPanel();
  document.getElementById("rightTitle").textContent = "Kamp";
  selectedPlayerEl.textContent = "Velg kamp.";
  entriesEl.innerHTML = "";
  setError("");
}

tabPlayers.addEventListener("click", showPlayersView);
tabMatch.addEventListener("click", showMatchView);

matchSelect.addEventListener("change", async () => {
  const v = matchSelect.value;

  if (!v) return;
  showRightPanel("Kamp");

  if (v === "played") {
    await loadPlayedMatches(currentUid);

  } else if (v === "upcoming") {
    await loadUpcomingMatches();

  } else if (v === "stats") {
    selectedPlayerEl.textContent = "Statistikk";
    const matches = await loadAllEndedMatches();
    renderStatsSelector(matches);
  }
});

async function loadUpcomingMatches() {
  setError("");
  selectedPlayerEl.textContent = "Kommende kamper";
  entriesEl.innerHTML = `<div class="item">Laster kommende kamper…</div>`;

  try {
    const matchesRef = collection(db, "matches");
    const snap = await getDocs(matchesRef);

    const rows = [];
    snap.forEach(d => {
      const m = d.data() || {};
      if (m.status === "UPCOMING") {
        rows.push({
          opponent: m?.meta?.opponent || "(ukjent)",
          date: m?.meta?.date || null,
          venue: m?.meta?.venue || null
        });
      }
    });

    // sorter alfabetisk på motstander (siden dato ofte mangler)
    rows.sort((a, b) => (a.opponent || "").localeCompare(b.opponent || "", "no"));

    if (rows.length === 0) {
      entriesEl.innerHTML = `<div class="item">Ingen kommende kamper funnet.</div>`;
      return;
    }

    entriesEl.innerHTML = "";
    rows.forEach(m => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="itemTitle">${m.opponent}</div>
        <div class="itemSub">
          ${m.date ? formatDateStringNo(m.date) : "Dato ikke satt"} ·
          ${m.venue ? placeLabelFromVenue(m.venue) : "Sted ikke satt"}
        </div>
      `;
      entriesEl.appendChild(div);
    });

  } catch (e) {
    entriesEl.innerHTML = `<div class="item">Kunne ikke hente kommende kamper.</div>`;
    setError(String(e?.message || e));
  }
}

function renderStatsSelector(matches) {

  if (!matches.length) {
    entriesEl.innerHTML = `<div class="item">Ingen kamper funnet.</div>`;
    return;
  }

  // Bygg dropdown
  let html = `
    <div class="item">
      <select id="statsMatchSelect" class="playerSelect statsSelect">
        <option value="total">Total</option>
  `;

  matches.forEach(m => {
    const date = m.meta?.date || "";
    const opponent = m.meta?.opponent || "";
    html += `
      <option value="${m.id}">
        ${date} - ${opponent}
      </option>
    `;
  });

 html += `
      </select>
    </div>
    <div id="statsContent"></div>
    <div id="matchDetailsArea"></div>
  `;

  entriesEl.innerHTML = html;

  const select = document.getElementById("statsMatchSelect");

  // Vis total først
  renderStatsContent(matches);

select.addEventListener("change", () => {

  const detailsArea = document.getElementById("matchDetailsArea");
  if (detailsArea) detailsArea.innerHTML = "";

  if (select.value === "total") {
    renderStatsContent(matches);
  } else {
    const singleMatch = matches.filter(m => m.id === select.value);
    renderStatsContent(singleMatch);

    renderDetailsButton(singleMatch[0]); // 🔥 ny linje
  }

});
}

function renderStatsContent(matches) {
  const stats = calculateStats(matches);
  renderStatsTable(stats, "statsContent");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  userLine.textContent = `Innlogget: ${user.email || user.uid}`;
  currentUid = user.uid;

  // Les rolle fra users/{uid}
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  const role = snap.data()?.role;
if (roleLine) {
  roleLine.textContent = `Rolle: ${role || "ukjent"}`;
}

  // Tillat assistantCoach og coach (praktisk for deg å teste)
  if (role !== "assistantCoach" && role !== "coach") {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

 await loadUtviklingsbank();
await loadPlayers();
showPlayersView();
});

async function loadAllEndedMatches() {
  const matchesRef = collection(db, "matches");
  const snap = await getDocs(matchesRef);

  const matches = [];

  snap.forEach(d => {
    const data = d.data();
    if (data.status === "ENDED") {
      matches.push({
        id: d.id,
        ...data
      });
    }
  });

  return matches;
}

function calculateStats(matches) {
  const stats = {};

  matches.forEach(match => {

    // 🔹 Spillertid + kort
    (match.playingTime || []).forEach(p => {

      if (!stats[p.id]) {
        stats[p.id] = {
          name: p.name,
          matches: 0,
          minutes: 0,
          goals: 0,
          yellow: 0,
          red: 0
        };
      }

      stats[p.id].matches += 1;
      stats[p.id].minutes += p.minutes || 0;

      (p.cards || []).forEach(c => {
        if (c.type === "yellow") stats[p.id].yellow += 1;
        if (c.type === "red") stats[p.id].red += 1;
      });
    });

    // 🔹 Mål
    (match.events || []).forEach(e => {
      if (e.type === "goal" && e.team === "home" && e.playerId) {
        if (stats[e.playerId]) {
          stats[e.playerId].goals += 1;
        }
      }
    });

  });

  return stats;
}

function renderStatsTable(stats, targetId = null) {

  const container = targetId
    ? document.getElementById(targetId)
    : entriesEl;

  const players = Object.values(stats);

  if (players.length === 0) {
    container.innerHTML = `<div class="item">Ingen statistikk funnet.</div>`;
    return;
  }

  players.sort((a, b) => b.minutes - a.minutes);

  let html = `
    <table class="statsTable">
      <thead>
        <tr>
          <th>Spiller</th>
          <th title="Kamper spilt">👟</th>
          <th title="Mål">⚽</th>
          <th title="Gule kort">🟨</th>
          <th title="Røde kort">🟥</th>
          <th title="Totale minutter">⏱</th>

        </tr>
      </thead>
      <tbody>
  `;

  players.forEach(p => {
    html += `
      <tr>
  <td>${p.name}</td>
  <td>${p.matches}</td>
  <td>${p.goals}</td>
  <td>${p.yellow}</td>
  <td>${p.red}</td>
  <td>${p.minutes}</td>
</tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

function renderDetailsButton(match) {
  const area = document.getElementById("matchDetailsArea");
  if (!match || !area) return;

  area.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <button id="showMatchDetailsBtn" class="btn" style="width:100%;">
        Detaljer
      </button>
      <div id="matchDetailsBox" style="display:none; margin-top:10px;"></div>
    </div>
  `;

  const btn = document.getElementById("showMatchDetailsBtn");
  const box = document.getElementById("matchDetailsBox");

  btn.addEventListener("click", () => {
    const isHidden = box.style.display === "none";
    box.style.display = isHidden ? "block" : "none";

    if (!isHidden) return;

    box.innerHTML = renderMatchDetails(match);
  });
}

function renderMatchDetails(match) {

  const events = match.events || [];

  if (!events.length) {
    return `<div class="itemSub">Ingen hendelser registrert.</div>`;
  }

  let html = `<div class="itemSub" style="opacity:.95;">`;

  // Vi viser hendelsene i kronologisk rekkefølge (eldst først)
  const sorted = [...events].reverse();

  sorted.forEach(e => {
    html += `
      <div style="margin-bottom:6px;">
        ${escapeHtml(e.text || "")}
      </div>
    `;
  });

  html += `</div>`;

  return html;
}

document.addEventListener("click", (e) => {
  const rightPanel = document.getElementById("rightPanel");
  const weekSelect = document.getElementById("weekSelect");
  const reflectionView = document.getElementById("reflectionView");

  if (!rightPanel || rightPanel.classList.contains("isHidden")) return;

  // Hvis vi klikker utenfor høyre panel
  if (!rightPanel.contains(e.target)) {

    // Nullstill uke
    if (weekSelect) {
      weekSelect.selectedIndex = 0;
    }

    // Lukk refleksjon
    if (reflectionView) {
      reflectionView.innerHTML =
        `<div class="item">Velg uke for å se refleksjonen.</div>`;
    }
  }
});