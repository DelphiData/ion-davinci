/* Thynk ROI Modeler
   - Conservative defaults
   - Capacity-aware robotics and ION
   - Service coverage gates
   - Source-linked modules
*/

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const fmtInt = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtMoney = (n) => `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const state = {
  inputs: {
    annualCts: 100000,
    monthlyLcs: 250,
    annualProstateMrs: 500,
    commercialPct: 10,
    retainedPct: 75,
    ionCount: 2,
    ionCapacity: 250,
    dvCount: 3,
    dvCapacity: 275,
    prices: {
      clinic: { medicare: 150, commercial: 280 },
      imaging: { medicare: 250, commercial: 520 },
      proc: { medicare: 5000, commercial: 11000 },
      rob: { medicare: 6500, commercial: 14000 },
    },
    services: {
      radOnc: true,
      chemo: true,
      vascular: true,
      ip: true,
      gyn: true,
      ctSurg: true,
      urology: true,
      giOnc: true,
    },
  },
  // capacity ledger computed each recalc:
  capacity: {
    ionRemaining: 0,
    dvRemaining: 0,
  },
  modules: [], // loaded below
};

// Modules catalog (enable/disable, default detection & conversion)
const MODULES = [
  {
    id: "lcs",
    name: "Lung Cancer Screening (LCS)",
    group: "Pulmonary",
    enabled: true,
    kind: "lcs",
    // Actionable rate approximation; editable per card:
    defaults: {
      lcsMonthlyOverride: null, // uses global monthlyLcs if null
      actionablePct: 12,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 35,
      ionShareOfProcedures: 55,
      roboticShareOfProcedures: 10,
      followupsPerProcedure: 1.1,
      specialists: 4,
      capacityPerSpecialist: 160,
    },
    requiredServices: ["ip", "ctSurg"],
    guidelines: [
      { label: "ACR Lung-RADS v2022", url: "https://www.acr.org/-/media/ACR/Files/RADS/Lung-RADS/Lung-RADS-2022.pdf" },
    ],
    blurb: "Captures LR3/4 follow‑ups, navigational bronch, and surgical resections via structured pathways.",
  },
  {
    id: "pulm",
    name: "Incidental Pulmonary Nodules",
    group: "Pulmonary",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.18, // 18% CT coverage overlap
      detectionPct: 4.5,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 28,
      ionShareOfProcedures: 50,
      roboticShareOfProcedures: 15,
      followupsPerProcedure: 1.2,
      specialists: 3,
      capacityPerSpecialist: 150,
    },
    requiredServices: ["ip", "ctSurg"],
    guidelines: [
      { label: "Fleischner (2017)", url: "https://pubs.rsna.org/doi/epdf/10.1148/radiol.2017161659" },
    ],
    blurb: "Automates Fleischner-based recall and escalates 8mm+ nodules to bronch/surgery per clinic protocol.",
  },
  {
    id: "renal",
    name: "Renal Mass",
    group: "Urology",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.17,
      detectionPct: 2.4,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 40,
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 70,
      followupsPerProcedure: 2.1,
      specialists: 4,
      capacityPerSpecialist: 135,
    },
    requiredServices: ["urology"],
    guidelines: [
      { label: "ACR Incidental Renal (Bosniak 2019)", url: "https://www.jacr.org/article/S1546-1440(17)30497-0/pdf" },
    ],
    blurb: "Tracks Bosniak III/IV and enhancing masses; routes to urology for ablation/partial nephrectomy.",
  },
  {
    id: "adrenal",
    name: "Adrenal Incidentaloma",
    group: "Endocrine",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.08,
      detectionPct: 1.0,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 16,
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 35,
      followupsPerProcedure: 1.1,
      specialists: 2,
      capacityPerSpecialist: 120,
    },
    requiredServices: ["urology"],
    guidelines: [
      { label: "ACR/ESE/AAES Adrenal", url: "https://www.jacr.org/article/S1546-1440(17)30551-3/pdf" },
    ],
    blurb: "Separates benign/managed vs 1–4cm indeterminate vs >4cm/high HU for endocrine/urology pathways.",
  },
  {
    id: "liver",
    name: "Liver Lesion",
    group: "HPB",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.10,
      detectionPct: 1.7,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 18,
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 15,
      followupsPerProcedure: 1.4,
      specialists: 3,
      capacityPerSpecialist: 140,
    },
    requiredServices: ["giOnc"],
    guidelines: [
      { label: "ACR LI‑RADS / AASLD", url: "https://www.jacr.org/article/S1546-1440(17)30889-X/pdf" },
    ],
    blurb: "LI‑RADS 4/5 prompt HPB consult, multiphasic MR/CT, and tumor board scheduling.",
  },
  {
    id: "pancreas",
    name: "Pancreatic Cyst/Mass",
    group: "HPB",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.07,
      detectionPct: 1.3,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 22,
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 10,
      followupsPerProcedure: 1.8,
      specialists: 3,
      capacityPerSpecialist: 130,
    },
    requiredServices: ["giOnc"],
    guidelines: [
      { label: "AGA / Fukuoka Cysts", url: "https://journals.lww.com/ajg/fulltext/2018/04000/acg_clinical_guideline__diagnosis_and_management.8.aspx" },
    ],
    blurb: "Triages IPMN/MCN per size and worrisome features; EUS/MRCP cadence with HPB oversight.",
  },
  {
    id: "thyroid",
    name: "Thyroid Nodule (TI‑RADS)",
    group: "Endocrine",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.12,
      detectionPct: 2.8,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 20,
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 20,
      followupsPerProcedure: 1.9,
      specialists: 3,
      capacityPerSpecialist: 150,
    },
    requiredServices: ["giOnc"], // ENT/endocrine surgery not explicit; mapped to specialty surgical coverage
    guidelines: [
      { label: "ACR TI‑RADS", url: "https://www.acr.org/Clinical-Resources/Reporting-and-Data-Systems/TI-RADS" },
    ],
    blurb: "Coordinates US/FNA for TR4-5; schedules endocrine/ENT surgery for appropriate cases.",
  },
  {
    id: "vascular",
    name: "Aneurysm (AAA/TAA)",
    group: "Vascular",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.06,
      detectionPct: 1.1,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 10, // elective endograft; most are surveillance
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 0,
      followupsPerProcedure: 1.0,
      specialists: 2,
      capacityPerSpecialist: 140,
    },
    requiredServices: ["vascular"],
    guidelines: [
      { label: "SVS / ACC/AHA", url: "https://vascular.org/" },
    ],
    blurb: "AAA 3.0–3.9cm annual US; 4.0–5.4cm semi‑annual; ≥5.5cm referral for repair evaluation.",
  },
  {
    id: "ovary",
    name: "Ovarian (O‑RADS)",
    group: "Gyn",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.05,
      detectionPct: 0.8,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 14,
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 20,
      followupsPerProcedure: 1.2,
      specialists: 2,
      capacityPerSpecialist: 130,
    },
    requiredServices: ["gyn"],
    guidelines: [
      { label: "ACR O‑RADS / SRU", url: "https://www.jacr.org/article/S1546-1440(18)30839-1/pdf" },
    ],
    blurb: "US follow‑up for simple cysts; O‑RADS 4–5 to gynecologic oncology.",
  },
  {
    id: "lymph",
    name: "Lymph Nodes",
    group: "General",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.14,
      detectionPct: 2.2,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 12,
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 0,
      followupsPerProcedure: 1.1,
      specialists: 3,
      capacityPerSpecialist: 140,
    },
    requiredServices: ["giOnc"], // oncology core, mapped to specialty surgical/onc
    guidelines: [
      { label: "ACR Incidental Lymph Nodes", url: "https://www.jacr.org/article/S1546-1440(13)00305-0/pdf" },
    ],
    blurb: "Biopsy planning for >1.5cm/necrotic nodes; 3‑month imaging for 1–1.5cm.",
  },
  {
    id: "prostate",
    name: "Prostate (PI‑RADS)",
    group: "Urology",
    enabled: true,
    kind: "mr", // uses annualProstateMrs
    defaults: {
      annualMrOverride: null,
      detectionPct: 20, // PI-RADS 4–5 proportion of MR indications
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 55, // biopsy / surgery / ablation
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 60,
      followupsPerProcedure: 1.0,
      specialists: 3,
      capacityPerSpecialist: 150,
    },
    requiredServices: ["urology"],
    guidelines: [
      { label: "AUA / NCCN / PI‑RADS", url: "https://www.auanet.org/guidelines" },
    ],
    blurb: "Routes PI‑RADS 4–5 for targeted biopsy and surgical consultation; da Vinci share adjustable.",
  },
  {
    id: "cac",
    name: "CAC / Valvular",
    group: "Cardio",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.10,
      detectionPct: 5.0, // actionable subset; majority is managed risk
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 6, // angiography/PCI candidates subset
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 0,
      followupsPerProcedure: 1.0,
      specialists: 4,
      capacityPerSpecialist: 180,
    },
    requiredServices: ["vascular"],
    guidelines: [
      { label: "ACC/AHA / SCCT", url: "https://www.jacc.org/" },
    ],
    blurb: "Risk management plus selective cath/PCI; focus on leakage reduction to in‑system cardiology.",
  },
  {
    id: "ila",
    name: "Interstitial Lung Abnormalities",
    group: "Pulmonary",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.10,
      detectionPct: 2.0, // non-fibrotic vs fibrotic mix
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 5, // BLVR/surgical lung biopsy minority
      ionShareOfProcedures: 10, // small share of bronch procedures
      roboticShareOfProcedures: 0,
      followupsPerProcedure: 1.0,
      specialists: 3,
      capacityPerSpecialist: 150,
    },
    requiredServices: ["ip"],
    guidelines: [
      { label: "ATS/ERS/JRS/ALAT", url: "https://www.thoracic.org/" },
    ],
    blurb: "Ensures pulmonology follow‑up and guideline HRCT cadence; selective advanced interventions.",
  },
  {
    id: "breast",
    name: "Incidental Breast (BI‑RADS)",
    group: "Breast",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.06,
      detectionPct: 0.7,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 18,
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 0,
      followupsPerProcedure: 1.0,
      specialists: 3,
      capacityPerSpecialist: 140,
    },
    requiredServices: ["giOnc"], // maps to surgical oncology service availability
    guidelines: [
      { label: "ACR BI‑RADS / SBI", url: "https://www.acr.org/Clinical-Resources/Reporting-and-Data-Systems/Bi-Rads" },
    ],
    blurb: "Short-interval diagnostic mammo for BI‑RADS 3; core needle biopsy and surgical referrals for 4–5.",
  },
  {
    id: "hernia",
    name: "Hernia (All Types)",
    group: "General Surgery",
    enabled: true,
    kind: "ct",
    defaults: {
      shareOfCts: 0.10,
      detectionPct: 3.0,
      captureThynk: 70,
      captureBaseline: 30,
      conversionToProcedure: 60,
      ionShareOfProcedures: 0,
      roboticShareOfProcedures: 75,
      followupsPerProcedure: 1.3,
      specialists: 4,
      capacityPerSpecialist: 150,
    },
    requiredServices: ["giOnc"],
    guidelines: [
        { label: "AHS / SAGES", url: "https://americasherniasociety.org/" },
    ],
    blurb: "Routes symptomatic or high-risk hernias (inguinal, ventral, hiatal) for surgical consultation and da Vinci repair.",
  },
];

// Build and init
function init() {
  // attach inputs
  const ids = [
    "annualCts","monthlyLcs","annualProstateMrs","commercialPct","retainedPct",
    "ionCount","ionCapacity","dvCount","dvCapacity",
    "priceClinicMedicare","priceClinicCommercial","priceImagingMedicare","priceImagingCommercial",
    "priceProcMedicare","priceProcCommercial","priceRobMedicare","priceRobCommercial",
  ];
  ids.forEach(id => {
    const el = $("#"+id);
    el.addEventListener("input", () => {
      setFromInputs();
      hydrateCtsIfTriggered(id);
      recalcAndRender();
    });
  });

  // services toggles
  [
    ["svcRadOnc","radOnc"], ["svcChemo","chemo"], ["svcVascular","vascular"], ["svcIP","ip"],
    ["svcGyn","gyn"], ["svcCTSurg","ctSurg"], ["svcUrology","urology"], ["svcGIOnc","giOnc"]
  ].forEach(([id,key]) => {
    $("#"+id).addEventListener("change", (e) => {
      state.inputs.services[key] = e.target.checked;
      recalcAndRender();
    });
  });

  // header actions
  $("#btnReset").addEventListener("click", resetAll);
  $("#btnSave").addEventListener("click", saveScenarioUrl);
  $("#btnExportCsv").addEventListener("click", exportCsv);
  $("#btnRehydrate").addEventListener("click", distributeCtsToModules);

  // create module cards
  const grid = $("#programGrid");
  state.modules = MODULES.map(m => ({...m, values: {...m.defaults}}));
  state.modules.forEach(m => {
    grid.appendChild(renderModuleCard(m));
  });

  // initial
  setFromInputs();
  distributeCtsToModules();
  loadScenarioFromUrl();
  recalcAndRender();
}

function setFromInputs(){
  const i = state.inputs;
  i.annualCts = +$("#annualCts").value || 0;
  i.monthlyLcs = +$("#monthlyLcs").value || 0;
  i.annualProstateMrs = +$("#annualProstateMrs").value || 0;
  i.commercialPct = clamp(+$("#commercialPct").value,0,100);
  i.retainedPct = clamp(+$("#retainedPct").value,0,100);
  i.ionCount = +$("#ionCount").value || 0;
  i.ionCapacity = +$("#ionCapacity").value || 0;
  i.dvCount = +$("#dvCount").value || 0;
  i.dvCapacity = +$("#dvCapacity").value || 0;

  i.prices.clinic.medicare = +$("#priceClinicMedicare").value || 0;
  i.prices.clinic.commercial = +$("#priceClinicCommercial").value || 0;
  i.prices.imaging.medicare = +$("#priceImagingMedicare").value || 0;
  i.prices.imaging.commercial = +$("#priceImagingCommercial").value || 0;
  i.prices.proc.medicare = +$("#priceProcMedicare").value || 0;
  i.prices.proc.commercial = +$("#priceProcCommercial").value || 0;
  i.prices.rob.medicare = +$("#priceRobMedicare").value || 0;
  i.prices.rob.commercial = +$("#priceRobCommercial").value || 0;

  $("#ionMaxNote").textContent = fmtInt(i.ionCount * i.ionCapacity);
  $("#dvMaxNote").textContent = fmtInt(i.dvCount * i.dvCapacity);
}

function clamp(n, min, max) {
  const num = parseFloat(n);
  // Return 0 if n is not a number, otherwise clamp it
  return isNaN(num) ? 0 : Math.max(min, Math.min(max, num));
}


function hydrateCtsIfTriggered(changedId){
  if (changedId === "annualCts") {
    distributeCtsToModules();
  }
}

// FIX: This function now updates the DOM to reflect the changes it makes to the state.
function distributeCtsToModules(){
  const annual = state.inputs.annualCts;
  state.modules.forEach(m => {
    if (m.kind === "ct") {
      const share = m.values.shareOfCts ?? m.defaults.shareOfCts ?? 0;
      const cts = Math.round(annual * share);
      setModuleField(m.id, "ctsPerYear", cts);
      
      // This is the added line: it finds the specific input box on the page
      // and updates its value, so the user sees the new number.
      const inputEl = document.querySelector(`.program[data-id="${m.id}"] [data-field="ctsPerYear"]`);
      if (inputEl) {
        inputEl.value = cts;
      }
    }
  });
  recalcAndRender();
}


function renderModuleCard(m){
  const card = document.createElement("article");
  card.className = "program";
  card.dataset.id = m.id;

  const guidelineLinks = m.guidelines.map(g => `<a href="${g.url}" target="_blank" rel="noopener">${g.label}</a>`).join(" • ");

  const head = `
    <div class="program__head">
      <div>
        <p class="eyebrow">${m.group}</p>
        <h3>${m.name}</h3>
        <p class="note">${m.blurb}</p>
        <p class="note">Guidelines: ${guidelineLinks}</p>
      </div>
      <div style="display:flex; flex-direction:column; gap:.4rem; align-items:flex-end">
        <label class="toggle">
          <input type="checkbox" ${m.enabled ? "checked" : ""} data-field="enabled" />
          <span>Enabled</span>
        </label>
        <span class="badge badge--ok" data-badge="capacity">OK</span>
      </div>
    </div>
  `;

  const perModuleInputs = (()=>{
    if (m.kind === "lcs"){
      return `
        <label class="field">
          <span>Monthly LCS (override)</span>
          <input type="number" min="0" step="1" data-field="lcsMonthlyOverride" placeholder="uses global if blank" />
        </label>
        <label class="field">
          <span>Actionable LCS %</span>
          <input type="number" min="0" max="100" step="0.1" data-field="actionablePct" value="${m.defaults.actionablePct}" />
        </label>
      `;
    }
    if (m.kind === "mr"){
      return `
        <label class="field">
          <span>Annual MRIs (override)</span>
          <input type="number" min="0" step="10" data-field="annualMrOverride" placeholder="uses global if blank" />
        </label>
        <label class="field">
          <span>Actionable MRI % (PI-RADS 4–5)</span>
          <input type="number" min="0" max="100" step="0.1" data-field="detectionPct" value="${m.defaults.detectionPct}" />
        </label>
      `;
    }
    // CT modules
    return `
      <label class="field">
        <span>CTs per year (module)</span>
        <input type="number" min="0" step="10" data-field="ctsPerYear" value="${Math.round((m.defaults.shareOfCts ?? 0)*state.inputs.annualCts)}" />
      </label>
      <label class="field">
        <span>Incidental detection %</span>
        <input type="number" min="0" max="100" step="0.1" data-field="detectionPct" value="${m.defaults.detectionPct}" />
      </label>
    `;
  })();

  const body = `
    <div class="program__body">
      <div class="grid grid--inputs">
        ${perModuleInputs}
        <label class="field">
          <span>Capture with Thynk %</span>
          <input type="number" min="0" max="100" step="1" data-field="captureThynk" value="${m.defaults.captureThynk}" />
        </label>
        <label class="field">
          <span>Baseline capture %</span>
          <input type="number" min="0" max="100" step="1" data-field="captureBaseline" value="${m.defaults.captureBaseline}" />
        </label>
        <label class="field">
          <span>Conversion to procedure %</span>
          <input type="number" min="0" max="100" step="1" data-field="conversionToProcedure" value="${m.defaults.conversionToProcedure}" />
        </label>
        <label class="field">
          <span>ION share of procedures %</span>
          <input type="number" min="0" max="100" step="1" data-field="ionShareOfProcedures" value="${m.defaults.ionShareOfProcedures}" />
        </label>
        <label class="field">
          <span>da Vinci share of procedures %</span>
          <input type="number" min="0" max="100" step="1" data-field="roboticShareOfProcedures" value="${m.defaults.roboticShareOfProcedures}" />
        </label>
        <label class="field">
          <span>Follow-ups per procedure</span>
          <input type="number" min="0" step="0.1" data-field="followupsPerProcedure" value="${m.defaults.followupsPerProcedure}" />
        </label>
        <label class="field">
          <span>Specialists supporting</span>
          <input type="number" min="0" step="1" data-field="specialists" value="${m.defaults.specialists}" />
        </label>
        <label class="field">
          <span>Cases per specialist FTE</span>
          <input type="number" min="0" step="5" data-field="capacityPerSpecialist" value="${m.defaults.capacityPerSpecialist}" />
        </label>
      </div>

      <div class="program__results">
        <div><p>On‑time follow-ups (Thynk)</p><strong data-out="clinics">0</strong></div>
        <div><p>Procedures (Thynk)</p><strong data-out="procedures">0</strong></div>
        <div><p>da Vinci (Thynk)</p><strong data-out="robotic">0</strong></div>
        <div><p>ION (Thynk)</p><strong data-out="ion">0</strong></div>
        <div><p>Revenue Δ</p><strong data-out="revenue">0</strong></div>
        <div><p>Leakage avoided</p><strong data-out="leakage">0</strong></div>
      </div>
    </div>
  `;

  card.innerHTML = head + body;

  // wire inputs to module values
  card.addEventListener("input", (e)=>{
    const t = e.target;
    const field = t.dataset.field;
    if (!field) return;

    const v = t.type === "checkbox" ? t.checked : t.value;
    setModuleField(m.id, field, v);
    recalcAndRender();
  });

  return card;
}

function setModuleField(id, field, rawValue){
  const mod = state.modules.find(x => x.id === id);
  if (!mod) return;
  let value = rawValue;
  if (typeof rawValue === "string" && rawValue.trim() === "") value = null;

  // FIX: Ensure all relevant fields are treated as numbers.
  const numericFields = [
    "ctsPerYear","detectionPct","actionablePct","captureThynk","captureBaseline","conversionToProcedure",
    "ionShareOfProcedures","roboticShareOfProcedures","followupsPerProcedure","specialists",
    "capacityPerSpecialist","lcsMonthlyOverride","annualMrOverride"
  ];
  if (numericFields.includes(field) && value !== null) {
      value = +value;
  }

  if (field === "enabled"){
    mod.enabled = !!value;
  } else {
    mod.values[field] = value;
  }
}

function recalcAndRender(){
  try {
    // reset capacity
    state.capacity.ionRemaining = state.inputs.ionCount * state.inputs.ionCapacity;
    state.capacity.dvRemaining = state.inputs.dvCount * state.inputs.dvCapacity;

    const summaryRows = [];
    let totals = { clinics:0, fups:0, procs:0, rob:0, ion:0, revenue:0 };

    // compute per module
    state.modules.forEach(mod => {
      const card = document.querySelector(`.program[data-id="${mod.id}"]`);
      const badge = card.querySelector('[data-badge="capacity"]');

      if (!mod.enabled){
        badge.textContent = "Off";
        badge.className = "badge badge--off";
        writeOutputs(card, { clinics:0, procs:0, rob:0, ion:0, revenue:0, leakage:0 });
        summaryRows.push({ id:mod.id, label: mod.name, clinics:0, fups:0, procs:0, rob:0, ion:0, revenue:0 });
        return;
      }

      const svcOkFactor = serviceCoverageFactor(mod.requiredServices);
      const retained = state.inputs.retainedPct / 100;

      // exposure
      let baseExams = 0;
      if (mod.kind === "lcs"){
        const monthly = mod.values.lcsMonthlyOverride ?? state.inputs.monthlyLcs;
        baseExams = monthly * 12;
      } else if (mod.kind === "mr"){
        const annual = mod.values.annualMrOverride ?? state.inputs.annualProstateMrs;
        baseExams = annual;
      } else {
        baseExams = mod.values.ctsPerYear ?? 0;
      }

      // detection & capture
      const detPct = (mod.values.detectionPct ?? mod.defaults.detectionPct) / 100;
      const actionable = (mod.kind === "lcs")
        ? baseExams * ((mod.values.actionablePct ?? mod.defaults.actionablePct) / 100)
        : baseExams * detPct;

      const capTh = (mod.values.captureThynk ?? 70) / 100;
      const capBl = (mod.values.captureBaseline ?? 30) / 100;

      const clinicsTh = actionable * capTh;
      const clinicsBl = actionable * capBl;

      // conversion to procedure with service coverage factor
      const conv = ((mod.values.conversionToProcedure ?? mod.defaults.conversionToProcedure) / 100) * svcOkFactor;

      // theoretical procedures (before capacity)
      const procThRaw = clinicsTh * conv;
      const procBlRaw = clinicsBl * conv;

      // specialist capacity
      const specialistCap = (mod.values.specialists ?? mod.defaults.specialists) * (mod.values.capacityPerSpecialist ?? mod.defaults.capacityPerSpecialist);

      const procThCapped = Math.min(procThRaw, specialistCap);
      const procBlCapped = Math.min(procBlRaw, specialistCap);

      // shares
      const robShare = (mod.values.roboticShareOfProcedures ?? mod.defaults.roboticShareOfProcedures) / 100;
      const ionShare = (mod.values.ionShareOfProcedures ?? mod.defaults.ionShareOfProcedures) / 100;

      let robTh = procThCapped * robShare;
      let ionTh = procThCapped * ionShare;

      // apply device capacity (global ledger)
      const robCapAvail = state.capacity.dvRemaining;
      const ionCapAvail = state.capacity.ionRemaining;

      let robWarn = false, ionWarn = false;

      if (robTh > robCapAvail){
        robTh = robCapAvail;
        robWarn = true;
      }
      state.capacity.dvRemaining -= robTh;

      if (ionTh > ionCapAvail){
        ionTh = ionCapAvail;
        ionWarn = true;
      }
      state.capacity.ionRemaining -= ionTh;

      // follow-ups per procedure
      const fupsTh = procThCapped * (mod.values.followupsPerProcedure ?? mod.defaults.followupsPerProcedure);

      // revenue (delta with - baseline)
      const prices = blendedPrices();
      const clinicRevTh = clinicsTh * prices.clinic;
      const clinicRevBl = clinicsBl * prices.clinic;

      const fupRevTh = fupsTh * prices.imaging;
      const fupRevBl = (procBlCapped * (mod.values.followupsPerProcedure ?? mod.defaults.followupsPerProcedure)) * prices.imaging;

      // split robotic vs non robotic revenue for Thynk side (baseline similarly)
      const nonRobTh = Math.max(procThCapped - robTh, 0);
      const nonRobBl = Math.max(procBlCapped - Math.min(procBlCapped, robTh), 0); // approximate split for baseline

      const procRevTh = retained * (nonRobTh * prices.proc + robTh * prices.rob);
      const procRevBl = retained * (nonRobBl * prices.proc + Math.min(procBlCapped, robTh) * prices.rob);

      const revenueDelta = (clinicRevTh + fupRevTh + procRevTh) - (clinicRevBl + fupRevBl + procRevBl);

      // leakage avoided proxy (extra procedures times (1-retained) becomes retained): show absolute added retained procedures
      const procDelta = procThCapped - procBlCapped;
      const leakageAvoided = Math.max(procDelta * retained, 0);

      // warnings
      if (robWarn && ionWarn) {
        badge.textContent = "da Vinci & ION capped";
        badge.className = "badge badge--warn";
      } else if (robWarn) {
        badge.textContent = "da Vinci capped";
        badge.className = "badge badge--warn";
      } else if (ionWarn) {
        badge.textContent = "ION capped";
        badge.className = "badge badge--warn";
      } else {
        badge.textContent = "OK";
        badge.className = "badge badge--ok";
      }

      writeOutputs(card, {
        clinics: clinicsTh,
        procs: procThCapped,
        rob: robTh,
        ion: ionTh,
        revenue: revenueDelta,
        leakage: leakageAvoided
      });

      summaryRows.push({
        id: mod.id,
        label: mod.name,
        clinics: clinicsTh - clinicsBl,
        fups: fupsTh - ((procBlCapped) * (mod.values.followupsPerProcedure ?? mod.defaults.followupsPerProcedure)),
        procs: procThCapped - procBlCapped,
        rob: robTh - Math.min(procBlCapped, robTh), // approximate uplift
        ion: ionTh - Math.min(procBlCapped, ionTh),
        revenue: revenueDelta
      });

      totals.clinics += clinicsTh - clinicsBl;
      totals.fups += fupsTh - ((procBlCapped) * (mod.values.followupsPerProcedure ?? mod.defaults.followupsPerProcedure));
      totals.procs += procThCapped - procBlCapped;
      totals.rob += robTh - Math.min(procBlCapped, robTh);
      totals.ion += ionTh - Math.min(procBlCapped, ionTh);
      totals.revenue += revenueDelta;
    });

    renderSummaryTable(summaryRows, totals);
    renderCharts(summaryRows, totals);
  } catch (e) {
      console.error("Calculation Error:", e);
      alert("A calculation error occurred. Please check the console for details and verify your inputs are correct.");
  }
}

function serviceCoverageFactor(req){
  if (!req || !req.length) return 1;
  const s = state.inputs.services;
  let ok = true;
  for (const key of req){
    if (!s[key]) { ok = false; break; }
  }
  // If coverage missing, reduce conversion opportunity (diagnostics still occur)
  return ok ? 1 : 0.4;
}

function blendedPrices(){
  const p = state.inputs.prices;
  const w = state.inputs.commercialPct / 100;
  const blend = (a,b)=> (1-w)*a + w*b;
  return {
    clinic: blend(p.clinic.medicare, p.clinic.commercial),
    imaging: blend(p.imaging.medicare, p.imaging.commercial),
    proc: blend(p.proc.medicare, p.proc.commercial),
    rob: blend(p.rob.medicare, p.rob.commercial),
  };
}

function writeOutputs(card, vals){
  card.querySelector('[data-out="clinics"]').textContent = fmtInt(vals.clinics);
  card.querySelector('[data-out="procedures"]').textContent = fmtInt(vals.procs);
  card.querySelector('[data-out="robotic"]').textContent = fmtInt(vals.rob);
  card.querySelector('[data-out="ion"]').textContent = fmtInt(vals.ion);
  card.querySelector('[data-out="revenue"]').textContent = fmtMoney(vals.revenue);
  card.querySelector('[data-out="leakage"]').textContent = fmtInt(vals.leakage);
}

function renderSummaryTable(rows, totals){
  const tbody = $("#summaryBody");
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.label}</td>
      <td>${fmtInt(r.clinics)}</td>
      <td>${fmtInt(r.fups)}</td>
      <td>${fmtInt(r.procs)}</td>
      <td>${fmtInt(r.rob)}</td>
      <td>${fmtInt(r.ion)}</td>
      <td>${fmtMoney(r.revenue)}</td>
    `;
    tbody.appendChild(tr);
  });

  $("#sumClinics").textContent = fmtInt(totals.clinics);
  $("#sumFups").textContent = fmtInt(totals.fups);
  $("#sumProcs").textContent = fmtInt(totals.procs);
  $("#sumRob").textContent = fmtInt(totals.rob);
  $("#sumIon").textContent = fmtInt(totals.ion);
  $("#sumRevenue").textContent = fmtMoney(totals.revenue);
}

let chartVolumes, chartRevenue;
function renderCharts(rows, totals){
  const labels = rows.map(r => r.label);
  const procsWith = rows.map(r => Math.max(r.procs,0));
  const robotic = rows.map(r => Math.max(r.rob,0));
  const ion = rows.map(r => Math.max(r.ion,0));
  const revenue = rows.map(r => Math.max(r.revenue,0));

  // volumes chart
  const ctxV = $("#chartVolumes").getContext("2d");
  if (chartVolumes) chartVolumes.destroy();
  chartVolumes = new Chart(ctxV, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Procedures (Δ)", data: procsWith, backgroundColor: "#86efac" },
        { label: "da Vinci (Δ)", data: robotic, backgroundColor: "#6aa5ff" },
        { label: "ION (Δ)", data: ion, backgroundColor: "#fbbf24" },
      ],
    },
    options: {
      responsive:true,
      plugins:{ legend:{ labels:{ color:"#cfe2ff" } } },
      scales:{
        x:{ ticks:{ color:"#a9b7df" }, grid:{ color:"#243052" } },
        y:{ ticks:{ color:"#a9b7df" }, grid:{ color:"#243052" } },
      }
    }
  });

  // revenue chart
  const ctxR = $("#chartRevenue").getContext("2d");
  if (chartRevenue) chartRevenue.destroy();
  chartRevenue = new Chart(ctxR, {
    type:"bar",
    data:{
      labels,
      datasets:[{ label:"Revenue Δ", data: revenue, backgroundColor:"#c4b5fd" }]
    },
    options:{
      responsive:true,
      plugins:{ legend:{ labels:{ color:"#cfe2ff" } } },
      scales:{
        x:{ ticks:{ color:"#a9b7df" }, grid:{ color:"#243052" } },
        y:{ ticks:{ color:"#a9b7df",
          callback:(v)=> `$${Number(v).toLocaleString()}`
        }, grid:{ color:"#243052" } },
      }
    }
  });
}

function resetAll(){
  // reset DOM defaults
  $("#annualCts").value = 100000;
  $("#monthlyLcs").value = 250;
  $("#annualProstateMrs").value = 500;
  $("#commercialPct").value = 10;
  $("#retainedPct").value = 75;
  $("#ionCount").value = 2;
  $("#ionCapacity").value = 250;
  $("#dvCount").value = 3;
  $("#dvCapacity").value = 275;

  $("#priceClinicMedicare").value = 150;
  $("#priceClinicCommercial").value = 280;
  $("#priceImagingMedicare").value = 250;
  $("#priceImagingCommercial").value = 520;
  $("#priceProcMedicare").value = 5000;
  $("#priceProcCommercial").value = 11000;
  $("#priceRobMedicare").value = 6500;
  $("#priceRobCommercial").value = 14000;

  ["svcRadOnc","svcChemo","svcVascular","svcIP","svcGyn","svcCTSurg","svcUrology","svcGIOnc"]
    .forEach(id => { $("#"+id).checked = true; });

  // reset modules to defaults
  state.modules.forEach(m=>{
    m.enabled = true;
    m.values = {...m.defaults};
    const card = document.querySelector(`.program[data-id="${m.id}"]`);
    // rewrite fields
    $$(`.program[data-id="${m.id}"] [data-field]`).forEach(inp => {
      const f = inp.dataset.field;
      if (f === "enabled"){ inp.checked = true; return; }

      let v = m.defaults[f];
      if (f === "ctsPerYear" && m.kind === "ct"){
        const share = m.defaults.shareOfCts ?? 0;
        v = Math.round(share * (+$("#annualCts").value || 0));
      }
      if (v == null) inp.value = "";
      else inp.value = v;
    });
  });

  setFromInputs();
  distributeCtsToModules();
  recalcAndRender();
}

function saveScenarioUrl(){
  const payload = {
    inputs: state.inputs,
    modules: state.modules.map(m => ({
      id:m.id, enabled:m.enabled, values:m.values
    })),
  };
  const s = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  const url = new URL(window.location.href);
  url.hash = `#s=${s}`;
  history.replaceState(null,"",url.toString());
  alert("Scenario saved to URL. Copy the address bar link to share.");
}

function loadScenarioFromUrl(){
  const h = window.location.hash;
  if (!h || !h.includes("#s=")) return;
  try{
    const s = h.split("#s=")[1];
    const json = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(s)))));
    // inputs
    Object.assign(state.inputs, json.inputs || {});
    // modules
    json.modules?.forEach(saved=>{
      const mod = state.modules.find(m => m.id === saved.id);
      if (!mod) return;
      mod.enabled = saved.enabled;
      mod.values = {...mod.defaults, ...(saved.values||{})};
    });
    // reflect back into DOM
    reflectInputsToDom();
    reflectModulesToDom();
  }catch(e){
    console.warn("Failed to load scenario:", e);
  }
}

function reflectInputsToDom(){
  $("#annualCts").value = state.inputs.annualCts;
  $("#monthlyLcs").value = state.inputs.monthlyLcs;
  $("#annualProstateMrs").value = state.inputs.annualProstateMrs;
  $("#commercialPct").value = state.inputs.commercialPct;
  $("#retainedPct").value = state.inputs.retainedPct;
  $("#ionCount").value = state.inputs.ionCount;
  $("#ionCapacity").value = state.inputs.ionCapacity;
  $("#dvCount").value = state.inputs.dvCount;
  $("#dvCapacity").value = state.inputs.dvCapacity;

  $("#priceClinicMedicare").value = state.inputs.prices.clinic.medicare;
  $("#priceClinicCommercial").value = state.inputs.prices.clinic.commercial;
  $("#priceImagingMedicare").value = state.inputs.prices.imaging.medicare;
  $("#priceImagingCommercial").value = state.inputs.prices.imaging.commercial;
  $("#priceProcMedicare").value = state.inputs.prices.proc.medicare;
  $("#priceProcCommercial").value = state.inputs.prices.proc.commercial;
  $("#priceRobMedicare").value = state.inputs.prices.rob.medicare;
  $("#priceRobCommercial").value = state.inputs.prices.rob.commercial;

  $("#svcRadOnc").checked = !!state.inputs.services.radOnc;
  $("#svcChemo").checked = !!state.inputs.services.chemo;
  $("#svcVascular").checked = !!state.inputs.services.vascular;
  $("#svcIP").checked = !!state.inputs.services.ip;
  $("#svcGyn").checked = !!state.inputs.services.gyn;
  $("#svcCTSurg").checked = !!state.inputs.services.ctSurg;
  $("#svcUrology").checked = !!state.inputs.services.urology;
  $("#svcGIOnc").checked = !!state.inputs.services.giOnc;
}

function reflectModulesToDom(){
  state.modules.forEach(m=>{
    const root = document.querySelector(`.program[data-id="${m.id}"]`);
    if (!root) return;
    const enabledInput = root.querySelector('[data-field="enabled"]');
    enabledInput.checked = m.enabled;

    $$(`.program[data-id="${m.id}"] [data-field]`).forEach(inp=>{
      const f = inp.dataset.field;
      if (f === "enabled") return;
      const v = m.values[f];
      if (v == null) { inp.value = ""; }
      else { inp.value = v; }
    });

    // prefill CT distribution when needed
    if (m.kind === "ct" && (m.values.ctsPerYear == null)){
      const share = m.values.shareOfCts ?? m.defaults.shareOfCts ?? 0;
      const cts = Math.round(state.inputs.annualCts * share);
      setModuleField(m.id, "ctsPerYear", cts);
      root.querySelector('[data-field="ctsPerYear"]').value = cts;
    }
  });
}

function exportCsv(){
  const rows = [["Module","Clinics Δ","Follow-ups Δ","Procedures Δ","da Vinci Δ","ION Δ","Revenue Δ"]];
  $$("#summaryBody tr").forEach(tr=>{
    const tds = Array.from(tr.children).map(td => td.textContent);
    rows.push(tds);
  });
  const footer = ["Total",
    $("#sumClinics").textContent,
    $("#sumFups").textContent,
    $("#sumProcs").textContent,
    $("#sumRob").textContent,
    $("#sumIon").textContent,
    $("#sumRevenue").textContent];
  rows.push(footer);

  const csv = rows.map(r => r.map(v=>{
    const s = String(v).replaceAll('"','""');
    return `"${s}"`;
  }).join(",")).join("\n");

  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "thynk-roi-summary.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

document.addEventListener("DOMContentLoaded", init);
