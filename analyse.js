import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { getFunctions, httpsCallable } 
from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

let uiInitialized = false;

/* =========================================
   AUTH – KUN COACH
========================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./index.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));

  if (!snap.exists() || snap.data().role !== "coach") {
    alert("Kun trener har tilgang.");
    window.location.href = "./fremside.html";
    return;
  }

  initAnalyseUI();
});

/* =========================================
   INIT UI
========================================= */

async function initAnalyseUI() {
	
	if (uiInitialized) return;
uiInitialized = true;

  const select = document.getElementById("analysisPlayerSelect");
  select.innerHTML = `<option value="">Velg spiller</option>`;

  const playersSnap = await getDocs(collection(db, "users"));

  const players = playersSnap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.role === "player" && u.approved === true);

  players.forEach(p => {
    const option = document.createElement("option");
    option.value = p.uid;
    option.textContent = p.name || p.email;
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    loadPlayerAnalysis(select.value);
  });
  
  const runBtn = document.getElementById("runAnalysisBtn");

runBtn.addEventListener("click", async () => {
  const playerId = select.value;

  if (!playerId) {
    alert("Velg en spiller først.");
    return;
  }

  runBtn.disabled = true;
  runBtn.textContent = "Genererer...";

  try {
  const functions = getFunctions();
const generatePlayerAnalysis = httpsCallable(functions, "generatePlayerAnalysis");

await generatePlayerAnalysis({ playerId });

    await loadPlayerAnalysis(playerId);

  } catch (err) {
    console.error(err);
    alert("Noe gikk galt under analyse.");
  }

  runBtn.disabled = false;
  runBtn.textContent = "Kjør ny analyse";
});

}

/* =========================================
   LOAD PLAYER DATA
========================================= */

async function loadPlayerAnalysis(playerId) {

  const statsDiv = document.getElementById("analysisStats");
  const resultDiv = document.getElementById("analysisResult");

  if (!playerId) {
    statsDiv.innerHTML = `<div class="stat-box">Ingen data valgt</div>`;
    resultDiv.innerHTML = "Velg en spiller for å se analyse.";
    return;
  }

  // Hent refleksjoner
  const snap = await getDocs(
    collection(db, "refleksjoner", playerId, "entries")
  );

  const entries = snap.docs.map(d => d.data());
  
  const lastDoc = snap.docs[snap.docs.length - 1];
const lastEntryId = lastDoc.id;

  if (!entries.length) {
    statsDiv.innerHTML = `<div class="stat-box">Ingen refleksjoner funnet</div>`;
    resultDiv.innerHTML = "Spilleren har ikke levert refleksjoner.";
    return;
  }

  // Beregn nøkkeltall
  const avgEffort =
    entries.reduce((sum, e) => sum + (Number(e.effort) || 0), 0) /
    entries.length;

  const avgEnergy =
    entries.reduce((sum, e) => sum + (Number(e.energy) || 0), 0) /
    entries.length;
	
	const entriesWithCoach = entries.filter(
  e => e.coachEffort !== undefined && e.coachEnergy !== undefined
);

let avgEffortDelta = 0;
let avgEnergyDelta = 0;

if (entriesWithCoach.length > 0) {
  avgEffortDelta =
    entriesWithCoach.reduce(
      (sum, e) => sum + (Number(e.coachEffort) - Number(e.effort)),
      0
    ) / entriesWithCoach.length;

  avgEnergyDelta =
    entriesWithCoach.reduce(
      (sum, e) => sum + (Number(e.coachEnergy) - Number(e.energy)),
      0
    ) / entriesWithCoach.length;
}

  statsDiv.innerHTML = `
  <div class="stat-box">Antall refleksjoner: ${entries.length}</div>
  <div class="stat-box">Snitt innsats (spiller): ${avgEffort.toFixed(2)}</div>
  <div class="stat-box">Snitt energi (spiller): ${avgEnergy.toFixed(2)}</div>

  <div class="stat-box">
    <strong>Sett trener-score (siste refleksjon)</strong><br><br>

    Innsats:
    <input type="number" id="coachEffortInput" min="1" max="5" step="1" style="width:60px;"><br><br>

    Energi:
    <input type="number" id="coachEnergyInput" min="1" max="5" step="1" style="width:60px;"><br><br>

    <button id="saveCoachScoreBtn">Lagre trener-score</button>
  </div>
`;

let calibrationText = "Ingen trener-score registrert enda.";

if (entriesWithCoach.length > 0) {
  const effortDeltaRounded = avgEffortDelta.toFixed(2);
  const energyDeltaRounded = avgEnergyDelta.toFixed(2);

  if (avgEffortDelta > 0.5 || avgEnergyDelta > 0.5) {
    calibrationText = `Spilleren undervurderer seg selv (snitt avvik innsats: +${effortDeltaRounded}, energi: +${energyDeltaRounded}).`;
  } 
  else if (avgEffortDelta < -0.5 || avgEnergyDelta < -0.5) {
    calibrationText = `Spilleren overvurderer seg selv (snitt avvik innsats: ${effortDeltaRounded}, energi: ${energyDeltaRounded}).`;
  } 
  else {
    calibrationText = `God kalibrering mellom spiller og trener (snitt avvik innsats: ${effortDeltaRounded}, energi: ${energyDeltaRounded}).`;
  }
}

let calibrationClass = "calibration-neutral";

if (entriesWithCoach.length > 0) {
  const maxDelta = Math.max(
    Math.abs(avgEffortDelta),
    Math.abs(avgEnergyDelta)
  );

  if (maxDelta > 1) {
    calibrationClass = "calibration-red";
  } else if (maxDelta > 0.5) {
    calibrationClass = "calibration-yellow";
  } else {
    calibrationClass = "calibration-green";
  }
}

statsDiv.innerHTML += `
  <div class="stat-box ${calibrationClass}">
    <strong>Kalibrering</strong><br>
    ${calibrationText}
  </div>
`;

const saveBtn = document.getElementById("saveCoachScoreBtn");

saveBtn.addEventListener("click", async () => {
  const coachEffort = Number(document.getElementById("coachEffortInput").value);
  const coachEnergy = Number(document.getElementById("coachEnergyInput").value);

  if (!coachEffort || !coachEnergy) {
    alert("Fyll inn begge feltene.");
    return;
  }

  try {
    await updateDoc(
      doc(db, "refleksjoner", playerId, "entries", lastEntryId),
      {
        coachEffort,
        coachEnergy
      }
    );

    alert("Trener-score lagret.");

  } catch (err) {
    console.error(err);
    alert("Kunne ikke lagre trener-score.");
  }
});


  // Hent eventuell lagret AI-analyse
  const aiSnap = await getDoc(doc(db, "aiAnalysis", playerId));
  
  console.log("AI SNAP EXISTS:", aiSnap.exists());
console.log("PLAYER ID:", playerId);

  if (!aiSnap.exists()) {
    resultDiv.innerHTML = `
      <div class="analysis-empty">
        Ingen AI-analyse generert enda.
      </div>
    `;
    return;
  }

  const ai = aiSnap.data();

resultDiv.innerHTML = `
  <div class="analysis-block">
    <h3>Oppsummering</h3>
    <p>${ai.summary || "-"}</p>
  </div>

  <div class="analysis-block">
    <h3>Utvikling</h3>
    <p>${ai.keyPatterns?.performanceTrend || "-"}</p>
  </div>
  
    <div class="analysis-block">
    <h3>Kalibrering (spiller vs trener)</h3>
    <p>${ai.calibrationAnalysis || "Ingen kalibreringsanalyse tilgjengelig."}</p>
  </div>

  <div class="analysis-block">
    <h3>Risikofaktorer</h3>
${
  Array.isArray(ai.riskFlags) && ai.riskFlags.length > 0
    ? "<ul>" + ai.riskFlags.map(r => `<li>${r}</li>`).join("") + "</ul>"
    : "<p>Ingen tydelige risikofaktorer identifisert.</p>"
}


  </div>

  <div class="analysis-block">
    <h3>Coaching-fokus</h3>
    <p>${ai.coachingFocus || "-"}</p>
  </div>
`;

}

/* =========================================
   TILBAKE-KNAPP
========================================= */

document.addEventListener("DOMContentLoaded", () => {
  const backBtn = document.getElementById("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.history.back();
    });
  }
});

