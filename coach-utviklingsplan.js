import { auth, db } from "./firebase-refleksjon.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

let utviklingsbank = {};
let requestCounter = 0;
let isProgrammaticChange = false;

async function loadUtviklingsbank() {
  const response = await fetch("utviklingsbank.json");
  utviklingsbank = await response.json();
}

const playerSelect = document.getElementById("playerSelect");
const backBtn = document.getElementById("backBtn");
const savePlanBtn = document.getElementById("savePlanBtn");

const mainFocus = document.getElementById("mainFocus");
const trainingGoal = document.getElementById("trainingGoal");
const matchBehaviour = document.getElementById("matchBehaviour");
const measurement = document.getElementById("measurement");
const utviklingsmaalField = document.getElementById("utviklingsmaal");




backBtn.addEventListener("click", () => {
  window.history.back();
});

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  await loadUtviklingsbank();
  await loadPlayers();
});

async function loadPlayers() {
  const snapshot = await getDocs(collection(db, "spillere"));

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    const option = document.createElement("option");
    option.value = docSnap.id;
    option.textContent = data.navn;
    option.dataset.posisjon = data.posisjon; // 🔥 viktig
	option.dataset.uid = data.uid;

    playerSelect.appendChild(option);
  });
}

function fillMainFocusDropdown(posisjon) {
  mainFocus.innerHTML = '<option value="">Velg utviklingsområde</option>';

  if (!utviklingsbank[posisjon]) return;

  const rolleOmrader = utviklingsbank[posisjon] || [];
  const fellesOmrader = utviklingsbank["felles_utvikling"] || [];

  const alleOmrader = [...rolleOmrader, ...fellesOmrader];

  alleOmrader.forEach((omrade) => {
    const option = document.createElement("option");
    option.value = omrade.id;
    option.textContent = omrade.title;
    mainFocus.appendChild(option);
  });
}

async function loadHistorikk(spillerUid) {
  const historikkContainer = document.getElementById("historikkContainer");
  historikkContainer.innerHTML = "";

  const snapshot = await getDocs(
    collection(db, "utviklingsplan", spillerUid, "historikk")
  );

  if (snapshot.empty) {
    historikkContainer.innerHTML = "<p style='opacity:0.6;'>Ingen tidligere versjoner</p>";
    return;
  }

  // Sorter etter archivedAt (nyeste først)
  const docs = snapshot.docs.sort((a, b) => {
    const aTime = a.data().archivedAt?.seconds || 0;
    const bTime = b.data().archivedAt?.seconds || 0;
    return bTime - aTime;
  });

  docs.forEach((docSnap) => {
    const data = docSnap.data();

    const card = document.createElement("div");
    card.style.border = "1px solid rgba(255,255,255,0.1)";
    card.style.borderRadius = "10px";
    card.style.padding = "10px";
    card.style.marginBottom = "10px";
    card.style.cursor = "pointer";
    card.style.background = "rgba(255,255,255,0.03)";

    const date = data.archivedAt
      ? new Date(data.archivedAt.seconds * 1000).toLocaleDateString("no-NO")
      : "Ukjent dato";

    card.innerHTML = `
      <strong>${date}</strong>
      <div style="display:none; margin-top:10px; opacity:0.8;" class="historikkDetails">
        <p><strong>Hovedfokus:</strong> ${data.mainFocus || ""}</p>
        <p><strong>Utviklingsmål:</strong><br>${(data.utviklingsmaal || "").replace(/\n/g, "<br>")}</p>
        <p><strong>Treningsmål:</strong><br>${(data.trainingGoal || "").replace(/\n/g, "<br>")}</p>
        <p><strong>Atferd i kamp:</strong><br>${(data.matchBehaviour || "").replace(/\n/g, "<br>")}</p>
      </div>
    `;

    card.addEventListener("click", () => {
      const details = card.querySelector(".historikkDetails");
      details.style.display =
        details.style.display === "none" ? "block" : "none";
    });

    historikkContainer.appendChild(card);
  });
}

function finnUtviklingsOmrade(omradeId, posisjon) {
  const rolleOmrader = utviklingsbank[posisjon] || [];
  const fellesOmrader = utviklingsbank["felles_utvikling"] || [];

  const alleOmrader = [...rolleOmrader, ...fellesOmrader];

  return alleOmrader.find(o => o.id === omradeId);
}

mainFocus.addEventListener("change", () => {

  if (isProgrammaticChange) return;
  const omradeId = mainFocus.value;
  if (!omradeId) return;

  const selectedOption = playerSelect.options[playerSelect.selectedIndex];
  const posisjon = selectedOption.dataset.posisjon;

  const omrade = finnUtviklingsOmrade(omradeId, posisjon);
  if (!omrade) return;

  // 🔹 Fyll utviklingsmål
  utviklingsmaalField.value = omrade.utviklingsmaal || "";

  // 🔹 Fyll treningsmål
  trainingGoal.value = "• " + omrade.trening.join("\n• ");

  // 🔹 Fyll kampatferd
  matchBehaviour.value = "• " + omrade.kamp.join("\n• ");
});

playerSelect.addEventListener("change", async () => {
	const currentRequest = ++requestCounter;

const selectedOption = playerSelect.options[playerSelect.selectedIndex];

// 🔹 NULLSTILL ALLTID FØRST
mainFocus.selectedIndex = 0;
trainingGoal.value = "";
matchBehaviour.value = "";
measurement.value = "";
utviklingsmaalField.value = "";

const planStatus = document.getElementById("planStatus");
planStatus.style.display = "none";

if (!selectedOption || !selectedOption.dataset.uid) return;

const spillerUid = selectedOption.dataset.uid;
const posisjon = selectedOption.dataset.posisjon;

  const lastUpdated = document.getElementById("lastUpdated");

  fillMainFocusDropdown(posisjon);
  await loadHistorikk(spillerUid);

  const planRef = doc(db, "utviklingsplan", spillerUid);
  const planSnap = await getDoc(planRef);
  if (currentRequest !== requestCounter) return;

  if (!planSnap.exists()) {
  mainFocus.value = "";
  trainingGoal.value = "";
  matchBehaviour.value = "";
  measurement.value = "";
  utviklingsmaalField.value = "";
  return;
}

  planStatus.style.display = "block";

  const plan = planSnap.data();

  if (plan.updatedAt) {
    const date = plan.updatedAt.toDate();
    lastUpdated.textContent =
      "Sist oppdatert: " + date.toLocaleDateString("no-NO");
  }

  isProgrammaticChange = true;
  mainFocus.value = plan.mainFocus || "";
  isProgrammaticChange = false;
  trainingGoal.value = plan.trainingGoal || "";
  matchBehaviour.value = plan.matchBehaviour || "";
  measurement.value = plan.measurement || "";
  utviklingsmaalField.value = plan.utviklingsmaal || "";
});

savePlanBtn.addEventListener("click", async () => {

  const selectedOption = playerSelect.options[playerSelect.selectedIndex];

  if (!selectedOption || !selectedOption.dataset.uid) {
    alert("Spilleren mangler uid");
    return;
  }

  const spillerUid = selectedOption.dataset.uid;
  
  // 🔹 Lagre gammel plan i historikk hvis den finnes
const existingRef = doc(db, "utviklingsplan", spillerUid);
const existingSnap = await getDoc(existingRef);

if (existingSnap.exists()) {
  const oldPlan = existingSnap.data();

  await addDoc(
    collection(db, "utviklingsplan", spillerUid, "historikk"),
    {
      ...oldPlan,
      archivedAt: serverTimestamp()
    }
  );
}

  await setDoc(doc(db, "utviklingsplan", spillerUid), {
    mainFocus: mainFocus.value,
    utviklingsmaal: utviklingsmaalField.value,
    trainingGoal: trainingGoal.value,
    matchBehaviour: matchBehaviour.value,
    measurement: measurement.value,
    updatedAt: serverTimestamp()
  });

  alert("Utviklingsplan lagret!");
});

