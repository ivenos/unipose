import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsyaml from 'js-yaml';
import {
  arrayToMap,
  parseScalar,
  sortServiceKeys,
  sortKeys,
  normalizeHealthcheck,
  standardizeService,
  standardize,
  dumpYaml,
  TOP_LEVEL_ORDER,
  SERVICE_KEY_PRIORITY,
} from '../lib.js';

// ─── arrayToMap ───────────────────────────────────────────────────────────────

test('arrayToMap: KEY=VALUE', () => {
  const result = arrayToMap(['RACK_ENV=development', 'PORT=3000']);
  assert.deepEqual(result, { RACK_ENV: 'development', PORT: 3000 });
});

test('arrayToMap: KEY only (no value)', () => {
  const result = arrayToMap(['USER_INPUT']);
  assert.deepEqual(result, { USER_INPUT: null });
});

test('arrayToMap: KEY=VALUE with $ variables', () => {
  const result = arrayToMap(['DB_URL=${DATABASE_URL}']);
  assert.deepEqual(result, { DB_URL: '${DATABASE_URL}' });
});

test('arrayToMap: already a map (non-string item) returns as-is', () => {
  const input = [{ key: 'val' }];
  assert.equal(arrayToMap(input), input);
});

test('arrayToMap: non-array returns as-is', () => {
  const input = { KEY: 'val' };
  assert.equal(arrayToMap(input), input);
});

// ─── parseScalar ─────────────────────────────────────────────────────────────

test('parseScalar: integer string → number', () => {
  assert.equal(parseScalar('42'), 42);
});

test('parseScalar: float string → number', () => {
  assert.equal(parseScalar('3.14'), 3.14);
});

test('parseScalar: plain string stays string', () => {
  assert.equal(parseScalar('hello'), 'hello');
});

test('parseScalar: empty string stays empty', () => {
  assert.equal(parseScalar(''), '');
});

// ─── sortServiceKeys ──────────────────────────────────────────────────────────

test('sortServiceKeys: image and container_name come first', () => {
  const input = { restart: 'always', container_name: 'app', image: 'nginx', ports: ['80:80'] };
  const result = sortServiceKeys(input);
  const keys = Object.keys(result);
  assert.equal(keys[0], 'image');
  assert.equal(keys[1], 'container_name');
});

test('sortServiceKeys: remaining keys are alphabetical', () => {
  const input = { restart: 'always', image: 'nginx', ports: ['80:80'], environment: {} };
  const result = sortServiceKeys(input);
  const keys = Object.keys(result).filter(k => !SERVICE_KEY_PRIORITY.includes(k));
  assert.deepEqual(keys, [...keys].sort());
});

test('sortServiceKeys: missing priority keys are skipped', () => {
  const input = { restart: 'always', ports: ['80:80'] };
  const result = sortServiceKeys(input);
  assert.deepEqual(Object.keys(result), ['ports', 'restart']);
});

// ─── sortKeys ─────────────────────────────────────────────────────────────────

test('sortKeys: known keys come first in order', () => {
  const input = { volumes: {}, services: {}, name: 'app' };
  const result = sortKeys(input, TOP_LEVEL_ORDER);
  const keys = Object.keys(result);
  assert.equal(keys[0], 'name');
  assert.equal(keys[1], 'services');
  assert.equal(keys[2], 'volumes');
});

test('sortKeys: unknown keys appended alphabetically', () => {
  const input = { services: {}, zzz: 1, aaa: 2 };
  const result = sortKeys(input, TOP_LEVEL_ORDER);
  const keys = Object.keys(result);
  assert.equal(keys[keys.length - 2], 'aaa');
  assert.equal(keys[keys.length - 1], 'zzz');
});

// ─── normalizeHealthcheck ─────────────────────────────────────────────────────

test('normalizeHealthcheck: string test → CMD-SHELL array', () => {
  const hc = { test: 'curl -f http://localhost', interval: '30s' };
  const result = normalizeHealthcheck({ ...hc });
  assert.deepEqual(result.test, ['CMD-SHELL', 'curl -f http://localhost']);
});

test('normalizeHealthcheck: array test stays as-is', () => {
  const hc = { test: ['CMD', 'curl', '-f', 'http://localhost'] };
  const result = normalizeHealthcheck({ ...hc });
  assert.deepEqual(result.test, ['CMD', 'curl', '-f', 'http://localhost']);
});

test('normalizeHealthcheck: no test key → unchanged', () => {
  const hc = { interval: '30s', retries: 3 };
  const result = normalizeHealthcheck({ ...hc });
  assert.equal(result.test, undefined);
});

// ─── standardizeService ───────────────────────────────────────────────────────

test('standardizeService: environment array → map', () => {
  const svc = { image: 'nginx', environment: ['RACK_ENV=development', 'PORT=80'] };
  const result = standardizeService({ ...svc });
  assert.deepEqual(result.environment, { RACK_ENV: 'development', PORT: 80 });
});

test('standardizeService: labels array → map', () => {
  const svc = { image: 'nginx', labels: ['app=web', 'env=prod'] };
  const result = standardizeService({ ...svc });
  assert.deepEqual(result.labels, { app: 'web', env: 'prod' });
});

test('standardizeService: annotations array → map', () => {
  const svc = { image: 'nginx', annotations: ['com.example.foo=bar'] };
  const result = standardizeService({ ...svc });
  assert.deepEqual(result.annotations, { 'com.example.foo': 'bar' });
});

test('standardizeService: image is first key', () => {
  const svc = { restart: 'always', image: 'nginx', ports: ['80:80'] };
  const result = standardizeService({ ...svc });
  assert.equal(Object.keys(result)[0], 'image');
});

// ─── standardize ─────────────────────────────────────────────────────────────

test('standardize: services top-level key comes before networks', () => {
  const doc = { networks: { default: {} }, services: { app: { image: 'nginx' } } };
  const result = standardize(doc);
  const keys = Object.keys(result);
  assert.ok(keys.indexOf('services') < keys.indexOf('networks'));
});

test('standardize: each service is standardized', () => {
  const doc = {
    services: {
      app: { image: 'nginx', environment: ['PORT=80'] },
    },
  };
  const result = standardize(doc);
  assert.deepEqual(result.services.app.environment, { PORT: 80 });
});

// ─── dumpYaml ─────────────────────────────────────────────────────────────────

test('dumpYaml: healthcheck.test rendered inline', () => {
  const doc = {
    services: {
      app: {
        image: 'nginx',
        healthcheck: {
          test: ['CMD', 'curl', '-f', 'http://localhost'],
          interval: '30s',
        },
      },
    },
  };
  const out = dumpYaml(doc, jsyaml);
  assert.match(out, /test: \[/, 'healthcheck.test should be rendered as inline array');
});

test('dumpYaml: produces valid YAML that round-trips', () => {
  const doc = {
    services: {
      app: {
        image: 'nginx:latest',
        environment: { PORT: 80, HOST: 'localhost' },
        restart: 'unless-stopped',
      },
    },
  };
  const out = dumpYaml(doc, jsyaml);
  const reparsed = jsyaml.load(out);
  assert.equal(reparsed.services.app.image, 'nginx:latest');
  assert.equal(reparsed.services.app.environment.PORT, 80);
});

test('dumpYaml: labels with ${VAR} keys are preserved', () => {
  const doc = {
    services: {
      app: {
        image: 'nginx',
        labels: {
          'traefik.http.routers.${ROUTER_NAME}.rule': 'Host(`${SERVICE_DOMAIN}`)',
        },
      },
    },
  };
  const out = dumpYaml(doc, jsyaml);
  assert.ok(out.includes('${ROUTER_NAME}'), 'Key with ${VAR} should be preserved');
  assert.ok(out.includes('${SERVICE_DOMAIN}'), 'Value with ${VAR} should be preserved');
});
