import { standardize, dumpYaml } from './lib.js';

// ─── YAML Highlighting ────────────────────────────────────────────────────────
// atom-one-dark palette
const C = {
  comment:  '#5c6370',
  key:      '#e06c75',
  string:   '#98c379',
  number:   '#d19a66',
  bool:     '#56b6c2',
  null_:    '#56b6c2',
  anchor:   '#c678dd',
  tag:      '#e5c07b',
  punct:    '#abb2bf',
  plain:    '#abb2bf',
  variable: '#c678dd',
};

/** Escapes HTML special characters. */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Wraps text in a colored span. */
function span(color, text) {
  return `<span style="color:${color}">${esc(text)}</span>`;
}

/** Renders a key, highlighting $VAR / ${VAR} in variable color. */
function spanKey(text) {
  const parts = text.split(/(\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*)/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? `<span style="color:${C.variable}">${esc(part)}</span>`
      : part ? `<span style="color:${C.key}">${esc(part)}</span>` : ''
  ).join('');
}

/** Injects colored spans for $VAR and ${VAR} patterns within a raw string. */
function injectVars(raw) {
  const parts = raw.split(/(\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*)/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? `<span style="color:${C.variable}">${esc(part)}</span>`
      : esc(part)
  ).join('');
}

/** Colors a scalar value. */
function colorValue(val) {
  if (val === '' || val === undefined) return '';

  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    const inner = val.slice(1, -1);
    return span(C.string, '"') +
      `<span style="color:${C.string}">${injectVars(inner)}</span>` +
      span(C.string, '"');
  }

  if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
    const inner = val.slice(1, -1);
    return span(C.string, "'") +
      `<span style="color:${C.string}">${injectVars(inner)}</span>` +
      span(C.string, "'");
  }

  if (/^(true|false|yes|no|on|off)$/i.test(val)) return span(C.bool, val);
  if (/^(null|~)$/i.test(val)) return span(C.null_, val);
  if (/^-?(0x[\da-fA-F]+|0o[0-7]+|\d+(\.\d+)?([eE][+-]?\d+)?)$/.test(val)) return span(C.number, val);
  if (/^[&*]/.test(val)) return span(C.anchor, val);
  if (/^!!/.test(val)) return span(C.tag, val);

  return `<span style="color:${C.string}">${injectVars(val)}</span>`;
}

/** Splits "key: value" or "key:" into {key, value}. */
function splitKeyValue(str) {
  const idx = str.indexOf(': ');
  if (idx > 0) return { key: str.slice(0, idx), value: str.slice(idx + 2) };
  if (str.endsWith(':')) return { key: str.slice(0, -1), value: null };
  return null;
}

/** Highlights a single YAML line and returns HTML. */
function highlightLine(line) {
  if (line.trim() === '') return '';
  if (/^\s*#/.test(line)) return span(C.comment, line);

  const indent = line.match(/^(\s*)/)[1];
  const rest = line.slice(indent.length);

  if (rest.startsWith('- ') || rest === '-') {
    const value = rest.slice(2);
    const kv = splitKeyValue(value);
    if (kv && kv.value !== null) {
      return esc(indent) + span(C.punct, '- ') + spanKey(kv.key) + span(C.punct, ': ') + colorValue(kv.value);
    }
    return esc(indent) + span(C.punct, '- ') + colorValue(value);
  }

  const kv = splitKeyValue(rest);
  if (kv) {
    if (kv.value === null) return esc(indent) + spanKey(kv.key) + span(C.punct, ':');
    return esc(indent) + spanKey(kv.key) + span(C.punct, ': ') + colorValue(kv.value);
  }

  return `<span style="color:${C.plain}">${injectVars(rest)}</span>`;
}

/** Highlights a full YAML string and returns HTML. */
function highlightYaml(yaml) {
  return yaml.split('\n').map(highlightLine).join('\n');
}

// ─── Rendering ────────────────────────────────────────────────────────────────

const inputEl  = document.getElementById('input');
const inputHl  = document.getElementById('input-hl');
const outputEl = document.getElementById('output');
const copyBtn  = document.getElementById('copy-btn');

function syncScroll() {
  const wrap = inputEl.parentElement;
  wrap.scrollTop  = inputEl.scrollTop;
  wrap.scrollLeft = inputEl.scrollLeft;
}

function renderInput(text) {
  inputHl.innerHTML = highlightYaml(text + '\n');
}

function renderOutput(yamlString) {
  outputEl.classList.remove('error');
  outputEl.innerHTML = highlightYaml(yamlString);
}

function process() {
  const raw = inputEl.value;
  renderInput(raw);

  const trimmed = raw.trim();
  if (!trimmed) {
    outputEl.classList.remove('error');
    outputEl.innerHTML = '';
    return;
  }

  try {
    const doc = window.jsyaml.load(trimmed);
    const standardized = standardize(doc);
    const yamlOut = dumpYaml(standardized, window.jsyaml);
    renderOutput(yamlOut);
  } catch (err) {
    outputEl.classList.add('error');
    outputEl.textContent = `Error: ${err.message}`;
  }
}

// ─── GitHub star count ────────────────────────────────────────────────────────

fetch('https://api.github.com/repos/ivenos/unipose')
  .then(r => r.ok ? r.json() : null)
  .then(data => {
    if (!data) return;
    const count = data.stargazers_count;
    const el = document.getElementById('star-count');
    if (el) el.textContent = count >= 1000
      ? (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
      : String(count);
  })
  .catch(() => {});

// ─── Event listeners ─────────────────────────────────────────────────────────

inputEl.addEventListener('input', process);
inputEl.addEventListener('scroll', syncScroll);

copyBtn.addEventListener('click', () => {
  const text = outputEl.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg> Copied`;
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/></svg> Copy`;
      copyBtn.classList.remove('copied');
    }, 1500);
  });
});
