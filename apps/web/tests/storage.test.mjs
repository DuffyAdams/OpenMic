import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/lib/storage.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function storage() {
  const data = {};
  Object.defineProperties(data, {
    getItem: { value: (key) => data[key] ?? null },
    setItem: { value: (key, value) => { data[key] = value; } },
    removeItem: { value: (key) => { delete data[key]; } }
  });
  return data;
}

function load(base, localStorage, device) {
  const window = { name: device ? `sim:${device}` : '' };
  window.top = device ? {} : window;
  const exports = {};
  runInNewContext(compiled, {
    exports, window, localStorage,
    require: (name) => {
      assert.equal(name, '$app/paths');
      return { base };
    }
  });
  return exports;
}

for (const base of ['', '/openmic']) {
  test(`storage isolates deployments and simulated devices at ${JSON.stringify(base)}`, () => {
    const data = storage();
    const parent = load(base, data);
    const other = load(base ? '' : '/other', data);
    const tv = load(base, data, 'tv');
    const phone = load(base, data, 'phone');
    parent.store.set('ok:admin', 'real');
    other.store.set('ok:admin', 'other');
    other.simDevice('tv').store.set('ok:admin', 'other-tv');
    parent.simDevice('tv').store.set('ok:admin', 'tv');
    phone.store.set('ok:admin', 'phone');
    assert.equal(data[`${base ? `${base}:` : ''}ok:admin`], '"real"');
    assert.equal(tv.store.get('ok:admin'), 'tv');
    assert.equal(parent.simDevice('phone').store.get('ok:admin'), 'phone');
    tv.store.remove('ok:admin');
    assert.equal(parent.simDevice('tv').store.get('ok:admin'), null);
    tv.store.set('ok:admin', 'tv-again');
    parent.clearSimDevices('phone');
    assert.equal(phone.store.get('ok:admin'), null);
    assert.equal(tv.store.get('ok:admin'), 'tv-again');
    parent.clearSimDevices();
    assert.equal(tv.store.get('ok:admin'), null);
    assert.equal(parent.store.get('ok:admin'), 'real');
    assert.equal(other.store.get('ok:admin'), 'other');
    assert.equal(other.simDevice('tv').store.get('ok:admin'), 'other-tv');
  });
}
