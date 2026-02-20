const { onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { OpenAI } = require("openai");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({
  secrets: ["OPENAI_API_KEY"],
});

/* =====================================================
   AI ANALYSE (TIL TRENER)
===================================================== */
exports.generatePlayerAnalysis = onCall(async (request) => {
  try {
    const context = request.auth;
    const { playerId } = request.data;

    if (!context) throw new Error("Må være innlogget.");
    if (!playerId) throw new Error("playerId mangler.");

    const userDoc = await db.collection("users").doc(context.uid).get();
    if (!userDoc.exists || userDoc.data().role !== "coach") {
      throw new Error("Kun trener kan kjøre analyse.");
    }

    const snapshot = await db
      .collection("refleksjoner")
      .doc(playerId)
      .collection("entries")
      .get();

    const reflections = snapshot.docs.map((doc) => doc.data());

    if (reflections.length === 0) {
      throw new Error("Ingen refleksjoner funnet.");
    }

const reflectionHistory = reflections.map((r, i) => {

  let text = `
Refleksjon ${i + 1}:
Type: ${r.type === "match" ? "Kamp" : "Trening"}
Innsats: ${r.effort}
Energi: ${r.energy}
`;

  if (r.type === "training") {
    text += `
God ting: ${r.goodThing || ""}
Forbedre: ${r.improveThing || ""}
Coach-notat: ${r.coachNote || ""}
`;
  }

if (r.type === "match") {
  text += `
Situasjon: ${r.matchSituation || ""}
Gjorde bra: ${r.matchGood || ""}
Vil prøve neste gang: ${r.matchImprove || ""}
`;
}

  return text;

}).join("\n");

const avgEffort =
  reflections.reduce((sum, r) => sum + (Number(r.effort) || 0), 0) /
  reflections.length;

const avgEnergy =
  reflections.reduce((sum, r) => sum + (Number(r.energy) || 0), 0) /
  reflections.length;

const avgEffortRounded = avgEffort.toFixed(2);
const avgEnergyRounded = avgEnergy.toFixed(2);

const reflectionsWithCoach = reflections.filter(
  r => r.coachEffort !== undefined && r.coachEnergy !== undefined
);

let avgEffortDelta = 0;
let avgEnergyDelta = 0;

if (reflectionsWithCoach.length > 0) {
  avgEffortDelta =
    reflectionsWithCoach.reduce(
      (sum, r) => sum + (Number(r.coachEffort) - Number(r.effort)),
      0
    ) / reflectionsWithCoach.length;

  avgEnergyDelta =
    reflectionsWithCoach.reduce(
      (sum, r) => sum + (Number(r.coachEnergy) - Number(r.energy)),
      0
    ) / reflectionsWithCoach.length;
}


const prompt = `
Du er en erfaren og strukturert fotballfaglig analyseassistent for en ungdomstrener (G14).

Du skal analysere både:
1) Spillerens skriftlige refleksjoner
2) Kvantitative data for innsats og energi

Data:
- Antall refleksjoner: ${reflections.length}
- Snitt innsats: ${avgEffortRounded}
- Snitt energi: ${avgEnergyRounded}
- Antall refleksjoner med trener-score: ${reflectionsWithCoach.length}
- Snitt avvik innsats (trener - spiller): ${avgEffortDelta.toFixed(2)}
- Snitt avvik energi (trener - spiller): ${avgEnergyDelta.toFixed(2)}

Retningslinjer:
- Kommenter alltid alle feltene.
- Bruk trenerfaglig og presist språk.
- Integrer tallene aktivt i vurderingen.
- Vurder om det er samsvar eller avvik mellom tekst og tall.
- Ikke spekuler i personlighet.
- Ikke finn opp nye problemområder som ikke har grunnlag i refleksjonene.
- Dersom datagrunnlaget er begrenset, presiser det.

Viktig om refleksjonstype:

- Hvis refleksjonen gjelder Kamp:
  Fokuser på situasjoner, beslutninger under press,
  rolleforståelse og reaksjon på motgang.

- Hvis refleksjonen gjelder Trening:
  Fokuser på læring, innsats, utvikling av ferdigheter
  og progresjon over tid.
  
  Hvis både Kamp og Trening finnes i datagrunnlaget:

- Analyser kamprefleksjoner og treningsrefleksjoner separat før du gir en samlet vurdering.
- Beskriv eventuelle forskjeller mellom hvordan spilleren opplever seg selv i kamp vs trening.
- Hvis det kun finnes én type, gjør dette eksplisitt i vurderingen.

Ta hensyn til typen når du analyserer mønstre og utvikling.

Svar KUN i gyldig JSON:

{
  "summary": "",
  "performanceTrend": "",
  "mentalProfile": "",
  "calibrationAnalysis": "",
  "riskFlags": [],
  "coachingFocus": ""
}

Forklaring på feltene:

summary:
Helhetlig og presis oppsummering av hvordan spilleren beskriver egne prestasjoner.

performanceTrend:
Kommenter utvikling, stabilitet eller gjentakende mønstre i refleksjonene.
Integrer vurdering av snitt innsats og energi.
Hvis det finnes få refleksjoner, presiser at vurderingen bygger på begrenset grunnlag.

mentalProfile:
Beskriv mentale signaler som eksplisitt fremkommer i teksten
(for eksempel selvtillit, selvkritikk, motivasjon, ansvarlighet, frustrasjon).
Ikke tolk personlighet – hold deg til observerbare signaler i refleksjonene.

calibrationAnalysis:
Analyser samsvar mellom spillerens egenvurdering og trenerens vurdering.
Bruk avvikstallene aktivt.

- Hvis avviket er positivt over tid, betyr det at spilleren undervurderer seg selv.
- Hvis avviket er negativt over tid, betyr det at spilleren overvurderer seg selv.
- Hvis avviket er nær null, betyr det god kalibrering.

Kommenter hva dette kan bety for utvikling.
Hvis det finnes få trener-scorer, presiser at grunnlaget er begrenset.

riskFlags:
List konkrete forhold trener bør være oppmerksom på.
Dette kan være:
- Vedvarende lav innsats eller energi
- Gjentakende negativ selvvurdering
- Manglende ansvarstaking
Hvis ingen tydelige risikofaktorer fremkommer, returner en tom liste [].

coachingFocus:
Gi konkrete trenergrep basert på både refleksjonene og tallene.
Tiltakene skal være praktiske og gjennomførbare i treningshverdagen.

Refleksjoner:
${reflectionHistory}
`;


    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du er en strukturert og presis fotballanalytiker." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
    });

    const raw = response.choices?.[0]?.message?.content || "";

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("AI svarte ikke med JSON.");
    }

    const parsed = JSON.parse(raw.slice(start, end + 1));

    await db.collection("aiAnalysis").doc(playerId).set({
  summary: parsed.summary || "",
  keyPatterns: {
    performanceTrend: parsed.performanceTrend || "",
    mentalProfile: parsed.mentalProfile || "",
  },
  calibrationAnalysis: parsed.calibrationAnalysis || "",
  riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [],
  coachingFocus: parsed.coachingFocus || "",
  generatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

    return { success: true };

  } catch (error) {
    console.error(error);
    throw new Error(error.message || "Noe gikk galt.");
  }
});   // ← DENNE MANGLET HOS DEG


/* =====================================================
   AI TILBAKEMELDING (TIL SPILLER)
===================================================== */
exports.generatePlayerFeedback = onCall(async (request) => {
  try {
    const context = request.auth;
    const { playerId } = request.data;

    if (!context) throw new Error("Må være innlogget.");
    if (!playerId) throw new Error("playerId mangler.");

    const userDoc = await db.collection("users").doc(context.uid).get();
    if (!userDoc.exists || userDoc.data().role !== "coach") {
      throw new Error("Kun trener kan generere tilbakemelding.");
    }

    const snapshot = await db
      .collection("refleksjoner")
      .doc(playerId)
      .collection("entries")
      .get();

    const reflections = snapshot.docs.map((doc) => doc.data());

    if (reflections.length === 0) {
      throw new Error("Ingen refleksjoner funnet.");
    }

const reflectionHistory = reflections.map((r, i) => `
Refleksjon ${i + 1}:
Type: ${r.type === "match" ? "Kamp" : "Trening"}
God ting: ${r.goodThing}
Forbedre: ${r.improveThing}
Coach-notat: ${r.coachNote}
Innsats: ${r.effort}
Energi: ${r.energy}
`).join("\n");

    const prompt = `
Du er en fotballtrener som gir en konkret og motiverende tilbakemelding til en 14 år gammel spiller.

Basert på følgende refleksjoner:
${reflectionHistory}

Skriv maks 100 ord.
`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du skriver konkrete og motiverende trener-tilbakemeldinger." },
        { role: "user", content: prompt }
      ],
      temperature: 0.6,
    });

    const feedbackText = response.choices[0].message.content;

    const feedbackDoc = await db.collection("feedback").add({
      playerId,
      type: "weekly",
      generatedText: feedbackText,
      editedText: feedbackText,
      status: "draft",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      feedbackId: feedbackDoc.id,
      feedback: feedbackText
    };

  } catch (error) {
    console.error(error);
    throw new Error("Kunne ikke generere tilbakemelding.");
  }
});
