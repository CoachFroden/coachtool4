import { auth, db } from "./firebase-refleksjon.js";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const hint = document.getElementById("hint");
const backBtn = document.getElementById("backBtn");
const logoutBtn = document.getElementById("logoutBtn");

const dateEl = document.getElementById("date");
const timeEl = document.getElementById("time");
const oppEl = document.getElementById("opponent");
const typeEl = document.getElementById("type");
const venueEl = document.getElementById("venue");
const ourEl = document.getElementById("our");
const theirEl = document.getElementById("their");
const statusEl = document.getElementById("status");

const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");

const params = new URLSearchParams(window.location.search);
const source = params.get("source"); // "assistant" | "official"
const assistantUid = params.get("assistantUid");
const matchId = params.get("matchId");

let coachUid = null;
let matchRef = null;

logoutBtn.onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};

function ensureParams() {
  if (!matchId) return false;
  if (source === "assistant" && !assistantUid) return false;
  if (source !== "assistant" && source !== "official") return false;
  return true;
}

function getRef() {
  if (source === "official") {
    return doc(db, "matches", matchId);
  }
  return doc(db, "assistantMatches", assistantUid, "matches", matchId);
}

function setBackTarget() {
  // Du kan endre dette senere hvis du ønsker mer avansert "tilbake"
  backBtn.onclick = () => window.location.href = "assistant-kamper.html";
}

function fillForm(data) {
  const meta = data.meta || {};
  const score = data.score || {};

  dateEl.value = meta.date || "";
  timeEl.value = meta.startTime || "";
  oppEl.value = meta.opponent || "";
  typeEl.value = meta.type || "";
  venueEl.value = meta.venue || "";
  ourEl.value = (typeof score.our === "number") ? score.our : "";
  theirEl.value = (typeof score.their === "number") ? score.their : "";
  statusEl.value = data.status || "ENDED";

  hint.textContent = `Kilde: ${source === "official" ? "matches" : "assistantMatches"} • ID: ${matchId}`;
}

function readForm(existing) {
  const meta = { ...(existing.meta || {}) };

  meta.date = dateEl.value || "";
  meta.startTime = timeEl.value || "";
  meta.opponent = oppEl.value || "";
  meta.type = typeEl.value || "";
  meta.venue = venueEl.value || "";

  const score = { ...(existing.score || {}) };

  const our = ourEl.value === "" ? null : Number(ourEl.value);
  const their = theirEl.value === "" ? null : Number(theirEl.value);

  if (our !== null && Number.isFinite(our)) score.our = our;
  if (their !== null && Number.isFinite(their)) score.their = their;

  return {
    meta,
    score,
    status: statusEl.value || existing.status || "ENDED"
  };
}

async function ensureCoach(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) return false;
  return snap.data()?.role === "coach";
}

async function loadMatch() {
  matchRef = getRef();

  const snap = await getDoc(matchRef);

const data = snap.data() || {};
fillForm(data);
renderEvents(data);

saveBtn.onclick = async () => {

  const newData = readForm(data);

  if (source === "assistant") {

    const snap2 = await getDoc(matchRef);
    if (!snap2.exists()) return;

    const d = snap2.data() || {};

    // 1️⃣ Oppdater original
    await updateDoc(matchRef, {
      ...newData,
      approvedToMatches: true,
      approvedAt: serverTimestamp(),
      approvedBy: coachUid,
      updatedAt: serverTimestamp(),
      editedBy: coachUid
    });

    // 2️⃣ Kopier til matches
await setDoc(doc(db, "matches", matchId), {
  ...d,
  ...newData,
  status: "ENDED",

  approved: true,
  approvedToMatches: true,   // ← LEGG TIL DENNE

  approvedAt: serverTimestamp(),
  approvedBy: auth.currentUser.uid,
  approvedFromAssistant: assistantUid, // hvis du har den tilgjengelig

  lastEditedAt: serverTimestamp()
}, { merge: true });

    alert("Lagret og godkjent ✅");
    window.location.href = "assistant-kamper.html";
    return;
  }

  // Official kamp
  await updateDoc(matchRef, {
    ...newData,
    updatedAt: serverTimestamp(),
    editedBy: coachUid
  });

  alert("Lagret ✅");
};


  deleteBtn.onclick = async () => {
    const ok = confirm("Sikker på at du vil slette kampen?");
    if (!ok) return;

    await deleteDoc(matchRef);
    alert("Slettet.");
    window.location.href = "assistant-kamper.html";
  };
}

onAuthStateChanged(auth, async (user) => {
  if (!ensureParams()) {
    hint.textContent = "Mangler parametre i URL.";
    return;
  }

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
  setBackTarget();
  await loadMatch();
});

function calculateScore(events){
  let our = 0;
  let their = 0;

  events.forEach(ev => {
    if(ev.type === "goal"){
      if(ev.team === "home") our++;
      if(ev.team === "away") their++;
    }
  });

  return { our, their };
}

function renderEvents(data){
	
	const toggleBtn = document.getElementById("toggleEventsBtn");
const count = (data.events || []).length;

if (toggleBtn) {
  const isHidden = document
    .getElementById("eventsSection")
    .classList.contains("hidden");

  toggleBtn.textContent = isHidden
    ? `Vis hendelser (${count})`
    : `Skjul hendelser (${count})`;
}
	
	const container = document.getElementById("eventsSection");

  const list = document.getElementById("eventsList");
  list.innerHTML = "";

  const events = data.events || [];

  if(events.length === 0){
    list.innerHTML = "<div>Ingen hendelser registrert.</div>";
    return;
  }

  events.forEach((ev, index) => {

    const row = document.createElement("div");
    row.className = "eventRow";

    const textSpan = document.createElement("span");
    textSpan.textContent = ev.text || "";

const editBtn = document.createElement("button");
editBtn.textContent = "✏️";

const deleteBtn = document.createElement("button");
deleteBtn.textContent = "🗑";
deleteBtn.classList.add("eventDeleteBtn");

    editBtn.onclick = () => {

      const input = document.createElement("input");
      input.type = "text";
      input.value = ev.text || "";

const saveBtn = document.createElement("button");
saveBtn.textContent = "✔";
saveBtn.classList.add("eventSaveBtn");

const cancelBtn = document.createElement("button");
cancelBtn.textContent = "✖";
cancelBtn.classList.add("eventCancelBtn");

      row.innerHTML = "";
      row.appendChild(input);
      row.appendChild(saveBtn);
      row.appendChild(cancelBtn);

      cancelBtn.onclick = () => renderEvents(data);

      saveBtn.onclick = async () => {

        const newText = input.value.trim();
        if(!newText) return;

        data.events[index].text = newText;

        const score = calculateScore(data.events);

        await updateDoc(matchRef, {
          events: data.events,
          score: score,
          updatedAt: serverTimestamp(),
          editedBy: coachUid
        });

        data.score = score;
        ourEl.value = score.our;
        theirEl.value = score.their;

        renderEvents(data);
      };
    };

    deleteBtn.onclick = async () => {

      const ok = confirm("Slette hendelsen?");
      if(!ok) return;

      data.events.splice(index, 1);

      const score = calculateScore(data.events);

      await updateDoc(matchRef, {
        events: data.events,
        score: score,
        updatedAt: serverTimestamp(),
        editedBy: coachUid
      });

      data.score = score;
      ourEl.value = score.our;
      theirEl.value = score.their;

      renderEvents(data);
    };

    row.appendChild(textSpan);
    row.appendChild(editBtn);
    row.appendChild(deleteBtn);

    list.appendChild(row);
  });
}

const toggleBtn = document.getElementById("toggleEventsBtn");
const eventsSection = document.getElementById("eventsSection");

if(toggleBtn && eventsSection){
  toggleBtn.onclick = () => {
    eventsSection.classList.toggle("hidden");

    toggleBtn.textContent =
      eventsSection.classList.contains("hidden")
        ? "Vis hendelser"
        : "Skjul hendelser";
  };
}