// Pachys Tempus — shared model: defaults, rhythms, scenarios.

export const RHYTHMS = [
  { id: 'nsr',     label: 'Sinus',       hr: 80 },
  { id: 'sbrady',  label: 'Sinus Brady', hr: 42 },
  { id: 'stach',   label: 'Sinus Tach',  hr: 130 },
  { id: 'svt',     label: 'SVT',         hr: 185 },
  { id: 'af',      label: 'AF',          hr: 115 },
  { id: 'flutter', label: 'Flutter',     hr: 150 },
  { id: 'chb',     label: 'CHB',         hr: 34 },
  { id: 'vt',      label: 'VT',          hr: 175 },
  { id: 'vf',      label: 'VF',          hr: 0 },
  { id: 'asys',    label: 'Asystole',    hr: 0 },
];

// Rhythm properties used by the waveform engine.
export const RHYTHM_PROPS = {
  nsr:     { organized: true,  wide: false, p: true },
  sbrady:  { organized: true,  wide: false, p: true },
  stach:   { organized: true,  wide: false, p: true },
  svt:     { organized: true,  wide: false, p: false },
  af:      { organized: true,  wide: false, p: false, fib: true, irregular: true },
  flutter: { organized: true,  wide: false, p: false, flutter: true },
  chb:     { organized: true,  wide: true,  p: false, dissociatedP: true },
  vt:      { organized: true,  wide: true,  p: false, vt: true },
  vf:      { organized: false, vf: true },
  asys:    { organized: false, asys: true },
};

export const NUM_KEYS = ['hr', 'spo2', 'sbp', 'dbp', 'rr', 'etco2', 'temp', 'ste', 'perf'];

export const DEFAULTS = {
  rhythm: 'nsr',
  hr: 78, spo2: 98, sbp: 122, dbp: 78, rr: 14, etco2: 37, temp: 36.8,
  ste: 0,        // ST elevation, mm
  perf: 1,       // pleth amplitude / perfusion 0.1–1
  pulse: true,   // false = pulseless (PEA / pulseless VT)
  cpr: false,    // compression artefact on ECG / pleth
  capno: 'normal', // 'normal' | 'obstructive'
  leads: { ecg: true, spo2: true, co2: true, nibp: true, temp: true },
};

// Parameter metadata for the instructor controls.
export const PARAMS = [
  { k: 'hr',    label: 'HR',      unit: 'bpm',  min: 0,  max: 250, step: 5 },
  { k: 'spo2',  label: 'SpO₂',    unit: '%',    min: 40, max: 100, step: 1 },
  { k: 'sbp',   label: 'SBP',     unit: 'mmHg', min: 0,  max: 260, step: 5 },
  { k: 'dbp',   label: 'DBP',     unit: 'mmHg', min: 0,  max: 160, step: 5 },
  { k: 'rr',    label: 'RR',      unit: '/min', min: 0,  max: 60,  step: 2 },
  { k: 'etco2', label: 'EtCO₂',   unit: 'mmHg', min: 0,  max: 99,  step: 2 },
  { k: 'temp',  label: 'Temp',    unit: '°C',   min: 30, max: 42,  step: 0.1, dec: 1 },
  { k: 'ste',   label: 'ST elev', unit: 'mm',   min: 0,  max: 6,   step: 0.5, dec: 1 },
  { k: 'perf',  label: 'Perfusion', unit: '',   min: 0.1, max: 1,  step: 0.1, dec: 1 },
];

const S = (o) => ({ ...o });
export const SCENARIOS = [
  { id: 'healthy', name: 'בריא — בסיס', p: S({ rhythm: 'nsr', hr: 76, spo2: 98, sbp: 124, dbp: 78, rr: 14, etco2: 37, temp: 36.8, ste: 0, perf: 1, pulse: true, cpr: false, capno: 'normal' }) },
  { id: 'hypovol', name: 'שוק היפוולמי', p: S({ rhythm: 'stach', hr: 138, spo2: 95, sbp: 82, dbp: 56, rr: 26, etco2: 29, temp: 35.9, ste: 0, perf: 0.3, pulse: true, cpr: false, capno: 'normal' }) },
  { id: 'sepsis', name: 'שוק ספטי', p: S({ rhythm: 'stach', hr: 126, spo2: 92, sbp: 78, dbp: 38, rr: 28, etco2: 27, temp: 39.4, ste: 0, perf: 0.6, pulse: true, cpr: false, capno: 'normal' }) },
  { id: 'tpx', name: 'Tension PTX', p: S({ rhythm: 'stach', hr: 142, spo2: 83, sbp: 74, dbp: 50, rr: 34, etco2: 30, temp: 36.6, ste: 0, perf: 0.3, pulse: true, cpr: false, capno: 'normal' }) },
  { id: 'asthma', name: 'אסתמה קשה', p: S({ rhythm: 'stach', hr: 128, spo2: 89, sbp: 142, dbp: 86, rr: 30, etco2: 48, temp: 36.9, ste: 0, perf: 0.8, pulse: true, cpr: false, capno: 'obstructive' }) },
  { id: 'opioid', name: 'הרעלת אופיאטים', p: S({ rhythm: 'sbrady', hr: 54, spo2: 78, sbp: 104, dbp: 64, rr: 4, etco2: 66, temp: 36.2, ste: 0, perf: 0.8, pulse: true, cpr: false, capno: 'normal' }) },
  { id: 'stemi', name: 'STEMI', p: S({ rhythm: 'nsr', hr: 94, spo2: 95, sbp: 112, dbp: 72, rr: 20, etco2: 35, temp: 36.7, ste: 3, perf: 0.8, pulse: true, cpr: false, capno: 'normal' }) },
  { id: 'brady', name: 'ברדיקרדיה סימפטומטית (CHB)', p: S({ rhythm: 'chb', hr: 32, spo2: 94, sbp: 74, dbp: 42, rr: 18, etco2: 33, temp: 36.6, ste: 0, perf: 0.5, pulse: true, cpr: false, capno: 'normal' }) },
  { id: 'svt', name: 'SVT', p: S({ rhythm: 'svt', hr: 186, spo2: 97, sbp: 104, dbp: 68, rr: 20, etco2: 34, temp: 36.8, ste: 0, perf: 0.7, pulse: true, cpr: false, capno: 'normal' }) },
  { id: 'vf', name: 'דום לב — VF', p: S({ rhythm: 'vf', hr: 0, spo2: 70, sbp: 0, dbp: 0, rr: 10, etco2: 16, temp: 36.4, ste: 0, perf: 1, pulse: false, cpr: false, capno: 'normal' }) },
  { id: 'pvt', name: 'דום לב — pVT', p: S({ rhythm: 'vt', hr: 180, spo2: 70, sbp: 0, dbp: 0, rr: 10, etco2: 16, temp: 36.4, ste: 0, perf: 1, pulse: false, cpr: false, capno: 'normal' }) },
  { id: 'pea', name: 'דום לב — PEA', p: S({ rhythm: 'nsr', hr: 52, spo2: 70, sbp: 0, dbp: 0, rr: 10, etco2: 14, temp: 36.4, ste: 0, perf: 1, pulse: false, cpr: false, capno: 'normal' }) },
  { id: 'asys', name: 'דום לב — אסיסטולה', p: S({ rhythm: 'asys', hr: 0, spo2: 70, sbp: 0, dbp: 0, rr: 10, etco2: 10, temp: 36.4, ste: 0, perf: 1, pulse: false, cpr: false, capno: 'normal' }) },
  { id: 'rosc', name: 'ROSC', p: S({ rhythm: 'stach', hr: 112, spo2: 94, sbp: 96, dbp: 58, rr: 12, etco2: 41, temp: 36.3, ste: 0, perf: 0.6, pulse: true, cpr: false, capno: 'normal' }) },
];

export function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

export function fmt(v, dec = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '---';
  return dec ? Number(v).toFixed(dec) : String(Math.round(v));
}
