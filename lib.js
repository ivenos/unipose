const TOP_LEVEL_ORDER = [
  'name', 'version', 'services', 'networks', 'volumes',
  'configs', 'secrets', 'models', 'extensions',
];

const SERVICE_KEY_PRIORITY = ['image', 'container_name'];

// Converts ["KEY=VALUE", ...] or ["KEY: VALUE", ...] to { KEY: VALUE, ... }
function arrayToMap(arr) {
  if (!Array.isArray(arr)) return arr;
  const map = {};
  for (const item of arr) {
    if (typeof item !== 'string') return arr;
    const eqIdx = item.indexOf('=');
    const colonIdx = item.search(/:\s/);
    let sep = -1;
    if (eqIdx !== -1 && colonIdx !== -1) sep = Math.min(eqIdx, colonIdx);
    else if (eqIdx !== -1) sep = eqIdx;
    else if (colonIdx !== -1) sep = colonIdx;

    if (sep === -1) {
      map[item.trim()] = null;
    } else {
      const key = item.slice(0, sep).trim();
      const val = item.slice(sep + 1).trim();
      map[key] = parseScalar(val);
    }
  }
  return map;
}

function parseScalar(val) {
  if (val === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
  return val;
}

// image first, container_name second, rest alphabetically
function sortServiceKeys(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const priority = SERVICE_KEY_PRIORITY.filter(k => k in obj);
  const rest = Object.keys(obj).filter(k => !SERVICE_KEY_PRIORITY.includes(k)).sort();
  const out = {};
  for (const k of [...priority, ...rest]) out[k] = obj[k];
  return out;
}

// Known keys in order, unknown keys alphabetically at the end
function sortKeys(obj, order) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const known = order.filter(k => k in obj);
  const unknown = Object.keys(obj).filter(k => !order.includes(k)).sort();
  const out = {};
  for (const k of [...known, ...unknown]) out[k] = obj[k];
  return out;
}

function normalizeHealthcheck(hc) {
  if (!hc || typeof hc !== 'object') return hc;
  if (typeof hc.test === 'string') hc.test = ['CMD-SHELL', hc.test];
  return hc;
}

function standardizeService(service) {
  if (typeof service !== 'object' || service === null) return service;
  if (Array.isArray(service.environment)) service.environment = arrayToMap(service.environment);
  if (Array.isArray(service.labels))      service.labels      = arrayToMap(service.labels);
  if (Array.isArray(service.annotations)) service.annotations = arrayToMap(service.annotations);
  if (service.healthcheck)                service.healthcheck  = normalizeHealthcheck({ ...service.healthcheck });
  return sortServiceKeys(service);
}

function standardize(doc) {
  if (typeof doc !== 'object' || doc === null) return doc;
  if (doc.services && typeof doc.services === 'object') {
    const sorted = {};
    for (const [name, svc] of Object.entries(doc.services)) {
      sorted[name] = standardizeService({ ...svc });
    }
    doc.services = sorted;
  }
  return sortKeys(doc, TOP_LEVEL_ORDER);
}

// Serializes doc to YAML with healthcheck.test as inline array
function dumpYaml(doc, yaml) {
  const raw = yaml.dump(doc, {
    indent: 2, lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false,
  });
  return raw.replace(
    /^(\s*)test:\n(\1  - .+\n)+/gm,
    (match, indent) => {
      const items = [...match.matchAll(/^\s+- (.+)$/gm)].map(m => {
        const v = m[1].trim();
        return /[\s,\[\]{}#&*?|<>=!%@`]/.test(v) ? `"${v}"` : v;
      });
      return `${indent}test: [${items.join(', ')}]\n`;
    }
  );
}

export {
  arrayToMap, parseScalar, sortServiceKeys, sortKeys,
  normalizeHealthcheck, standardizeService, standardize, dumpYaml,
  TOP_LEVEL_ORDER, SERVICE_KEY_PRIORITY,
};
