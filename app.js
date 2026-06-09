const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SIGNS = [
  {name:'Aries',sym:'♈'},{name:'Taurus',sym:'♉'},{name:'Gemini',sym:'♊'},
  {name:'Cancer',sym:'♋'},{name:'Leo',sym:'♌'},{name:'Virgo',sym:'♍'},
  {name:'Libra',sym:'♎'},{name:'Scorpio',sym:'♏'},{name:'Sagittarius',sym:'♐'},
  {name:'Capricorn',sym:'♑'},{name:'Aquarius',sym:'♒'},{name:'Pisces',sym:'♓'}
];

let selectedOracleSign = null;
let selectedHoroscopeSign = null;
let currentUser = null;
let lastReadings = {};
let authMode = 'login';

window.addEventListener('DOMContentLoaded', async () => {
  buildSignGrids();
  buildCompatSelects();
  const { data: { session } } = await db.auth.getSession();
  if (session) { currentUser = session.user; showApp(); }
});

function switchAuth(mode) {
  authMode = mode;
  document.querySelectorAll('.tab-btn').forEach((b,i) => {
    b.classList.toggle('active', (i===0 && mode==='login') || (i===1 && mode==='signup'));
  });
  document.getElementById('auth-btn').textContent = mode === 'login' ? 'Login' : 'Create account';
  document.getElementById('auth-error').textContent = '';
}

async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-btn');
  if (!email || !password) { errEl.textContent = 'Please enter email and password.'; return; }
  btn.disabled = true;
  btn.textContent = authMode === 'login' ? 'Logging in...' : 'Creating account...';
  let result;
  if (authMode === 'login') {
    result = await db.auth.signInWithPassword({ email, password });
  } else {
    result = await db.auth.signUp({ email, password });
  }
  if (result.error) {
    errEl.textContent = result.error.message;
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Login' : 'Create account';
  } else {
    currentUser = result.data.user;
    showApp();
  }
}

function continueAsGuest() { currentUser = null; showApp(); }

function showApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  document.getElementById('user-label').textContent = currentUser ? currentUser.email : 'Guest';
  loadHistory();
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
}

function showTab(id, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  if (id === 'history') loadHistory();
}

function buildSignGrids() { buildGrid('oracle-signs','oracle'); buildGrid('horoscope-signs','horoscope'); }

function buildGrid(containerId, context) {
  const el = document.getElementById(containerId);
  el.innerHTML = SIGNS.map((s,i) =>
    `<button class="sign-btn" onclick="selectSign('${context}','${s.name}',${i},'${containerId}')">
      <span class="sym">${s.sym}</span>${s.name}
    </button>`).join('');
}

function selectSign(context, name, idx, containerId) {
  document.querySelectorAll(`#${containerId} .sign-btn`).forEach(b => b.classList.remove('selected'));
  document.querySelectorAll(`#${containerId} .sign-btn`)[idx].classList.add('selected');
  if (context === 'oracle') selectedOracleSign = name;
  if (context === 'horoscope') { selectedHoroscopeSign = name; loadHoroscope(name); }
}

function buildCompatSelects() {
  const opts = SIGNS.map(s => `<option value="${s.name}">${s.sym} ${s.name}</option>`).join('');
  document.getElementById('compat1').innerHTML = opts;
  document.getElementById('compat2').innerHTML = opts;
  document.getElementById('compat2').selectedIndex = 6;
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'The stars are quiet. Please try again.';
}

function showLoading(textId) {
  document.getElementById(textId).innerHTML =
    '<div class="loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
}

function fillQ(q) { document.getElementById('oracle-q').value = q; }

async function askOracle() {
  const q = document.getElementById('oracle-q').value.trim();
  if (!q) return;
  const sign = selectedOracleSign || 'an unknown sign';
  document.getElementById('oracle-response').classList.add('visible');
  showLoading('oracle-text');
  document.getElementById('oracle-btn').disabled = true;
  document.getElementById('oracle-save').style.display = 'none';
  const prompt = `You are Sharmajiii, a wise AI astrology guide. The user is a ${sign}. They ask: "${q}". Give a thoughtful, specific astrological answer in 3-4 sentences. Be warm and insightful. No asterisks or markdown.`;
  const answer = await callGemini(prompt);
  document.getElementById('oracle-text').textContent = answer;
  document.getElementById('oracle-btn').disabled = false;
  document.getElementById('oracle-save').style.display = 'inline-block';
  lastReadings['oracle'] = { type:'Oracle', question:q, answer, sign };
}

async function loadHoroscope(sign) {
  const card = document.getElementById('horoscope-card');
  card.style.display = 'block';
  const today = new Date().toLocaleDateString('en-IN', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('horoscope-sign-title').textContent = `✦ ${sign} — Daily Horoscope`;
  document.getElementById('horoscope-date').textContent = today;
  showLoading('horoscope-text');
  document.getElementById('horoscope-themes').innerHTML = '';
  document.getElementById('horoscope-save').style.display = 'none';
  const prompt = `You are Sharmajiii. Write a daily horoscope for ${sign} for ${today}. Write 4-5 sentences covering energy, love, work, and advice. Then on a new line write: THEMES: followed by 4 short theme words separated by commas. No asterisks or markdown.`;
  const answer = await callGemini(prompt);
  const parts = answer.split('THEMES:');
  document.getElementById('horoscope-text').textContent = parts[0].trim();
  if (parts[1]) {
    const themes = parts[1].trim().split(',').map(t => t.trim()).filter(Boolean);
    document.getElementById('horoscope-themes').innerHTML = themes.map(t => `<span class="quality-pill">${t}</span>`).join('');
  }
  document.getElementById('horoscope-save').style.display = 'inline-block';
  lastReadings['horoscope'] = { type:'Horoscope', sign, answer:parts[0].trim() };
}

async function checkCompat() {
  const s1 = document.getElementById('compat1').value;
  const s2 = document.getElementById('compat2').value;
  document.getElementById('compat-response').classList.add('visible');
  showLoading('compat-text');
  document.getElementById('compat-btn').disabled = true;
  document.getElementById('compat-save').style.display = 'none';
  const prompt = `You are Sharmajiii. Analyze compatibility between ${s1} and ${s2} in 4-5 sentences. Cover their dynamic, strengths, and challenges. Be honest. No asterisks or markdown.`;
  const answer = await callGemini(prompt);
  document.getElementById('compat-text').textContent = answer;
  document.getElementById('compat-btn').disabled = false;
  document.getElementById('compat-save').style.display = 'inline-block';
  lastReadings['compatibility'] = { type:'Compatibility', signs:`${s1} & ${s2}`, answer };
}

async function readChart() {
  const dob = document.getElementById('bday').value;
  const tob = document.getElementById('btime').value;
  const city = document.getElementById('bcity').value.trim();
  if (!dob) { alert('Please enter your date of birth.'); return; }
  document.getElementById('chart-response').classList.add('visible');
  showLoading('chart-text');
  document.getElementById('chart-btn').disabled = true;
  document.getElementById('chart-save').style.display = 'none';
  const prompt = `You are Sharmajiii. Based on birth date: ${dob}, time: ${tob||'unknown'}, place: ${city||'unknown'}, give a birth chart reading. Mention sun sign, possible moon and rising signs, personality, strengths, and life path. 5-6 sentences, warm tone. No asterisks or markdown.`;
  const answer = await callGemini(prompt);
  document.getElementById('chart-text').textContent = answer;
  document.getElementById('chart-btn').disabled = false;
  document.getElementById('chart-save').style.display = 'inline-block';
  lastReadings['birthchart'] = { type:'Birth Chart', dob, city, answer };
}

async function saveReading(type) {
  const reading = lastReadings[type];
  if (!reading) return;
  if (currentUser) {
    await db.from('readings').insert({
      user_id: currentUser.id, type: reading.type,
      content: JSON.stringify(reading), created_at: new Date().toISOString()
    });
  } else {
    const saved = JSON.parse(localStorage.getItem('sharmajiii_readings') || '[]');
    saved.unshift({ ...reading, created_at: new Date().toISOString() });
    localStorage.setItem('sharmajiii_readings', JSON.stringify(saved.slice(0,20)));
  }
  const ids = { oracle:'oracle-save', horoscope:'horoscope-save', compatibility:'compat-save', birthchart:'chart-save' };
  const btn = document.getElementById(ids[type]);
  if (btn) { btn.textContent = 'Saved ✓'; btn.disabled = true; }
}

async function loadHistory() {
  const listEl = document.getElementById('history-list');
  let readings = [];
  if (currentUser) {
    const { data } = await db.from('readings').select('*')
      .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(30);
    if (data) readings = data.map(r => ({ ...JSON.parse(r.content), created_at: r.created_at }));
  } else {
    readings = JSON.parse(localStorage.getItem('sharmajiii_readings') || '[]');
  }
  if (!readings.length) {
    listEl.innerHTML = '<div class="empty-state">No saved readings yet. Ask the oracle something and save it!</div>';
    return;
  }
  listEl.innerHTML = readings.map(r => {
    const date = new Date(r.created_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'});
    const preview = r.answer ? r.answer.substring(0,120) + '...' : '';
    const meta = r.sign || r.signs || (r.dob ? `Born ${r.dob}` : '');
    return `<div class="history-item">
      <div class="history-meta">
        <span class="history-type">${r.type}</span>
        ${meta ? `<span>· ${meta}</span>` : ''}
        <span>· ${date}</span>
      </div>
      <div class="history-preview">${preview}</div>
    </div>`;
  }).join('');
}
