import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  getMessaging,
  getToken
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging.js";

/* ==============================
   Navigasjon
============================== */
function go(page) {
  window.location.href = page;
}
window.go = go;

/* ==============================
   Push (kun coach)
============================== */
const VAPID_KEY = "BMliWkFTxc-mlxFygGosVuvYirsguGa-lpUiYUhWwpkmwkP_bJXFZRtpUetZ3NSa4YY7sig2ikaVoTTtlTg0x8o";

async function setupCoachPush(user) {
  try {
    if (!("serviceWorker" in navigator)) return;

const swReg = await navigator.serviceWorker.getRegistration("/coachtool4/")
  || await navigator.serviceWorker.register("/coachtool4/firebase-messaging-sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (!token) return;

    await setDoc(doc(db, "adminTokens", user.uid), {
      token,
      platform: "web",
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log("✅ Push aktivert og token lagret");
  } catch (err) {
    console.error("Push-feil:", err);
  }
}

/* ==============================
   Auth-sjekk (kun coach)
============================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./fremside.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    window.location.href = "./fremside.html";
    return;
  }

  const data = snap.data();

  if (data.role !== "coach") {
    alert("Kun trener har tilgang.");
    window.location.href = "./fremside.html";
    return;
  }
  
  // ==============================
// Push-status indikator (diskré)
// ==============================

function renderPushStatus(user) {
  let badge = document.getElementById("pushStatusBadge");

  if (!badge) {
    badge = document.createElement("button");
    badge.id = "pushStatusBadge";
    badge.style.position = "fixed";
    badge.style.bottom = "14px";
    badge.style.right = "14px";
    badge.style.padding = "8px 12px";
    badge.style.borderRadius = "20px";
    badge.style.fontSize = "0.85rem";
    badge.style.border = "none";
    badge.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    badge.style.zIndex = "9999";
    document.body.appendChild(badge);
  }

  const permission = Notification.permission;

  if (permission === "granted") {
    badge.textContent = "🟢 Varsler aktivert";
    badge.style.background = "#2ecc71";
    badge.style.color = "white";
    badge.style.cursor = "default";
    badge.disabled = true;
  }

  else if (permission === "denied") {
    badge.textContent = "🔴 Varsler blokkert";
    badge.style.background = "#e74c3c";
    badge.style.color = "white";
    badge.style.cursor = "not-allowed";
    badge.disabled = true;
  }

  else {
    badge.textContent = "🔴 Aktiver varsler";
    badge.style.background = "#e74c3c";
    badge.style.color = "white";
    badge.style.cursor = "pointer";
    badge.disabled = false;

    badge.onclick = async () => {
      await setupCoachPush(user);
      renderPushStatus(user); // oppdater etter klikk
    };
  }
}

// kall den
renderPushStatus(user);

  // ✅ Riktig sted: bare coach
 // await setupCoachPush(user);
 
 // iOS/PWA: permission må trigges av brukerhandling
if (!document.getElementById("enablePushBtn")) {
  const btn = document.createElement("button");
  btn.id = "enablePushBtn";
  btn.textContent = "Aktiver varsler";
  btn.style.padding = "10px 14px";
  btn.style.borderRadius = "10px";
  btn.style.cursor = "pointer";
  btn.style.margin = "12px";

  const status = document.createElement("div");
  status.id = "pushStatus";
  status.style.margin = "0 12px 12px";
  status.style.opacity = "0.8";
  status.style.fontSize = "0.95rem";
  status.textContent = `Status: Notification.permission = ${Notification.permission}`;

  document.body.prepend(status);
  document.body.prepend(btn);

  btn.addEventListener("click", async () => {
    status.textContent = "Status: prøver å aktivere varsler…";
    await setupCoachPush(user);
    status.textContent = `Status: Notification.permission = ${Notification.permission} (sjekk adminTokens)`;
  });
}
});

/* ==============================
   Logout
============================== */
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.href = "./index.html";
  };
}