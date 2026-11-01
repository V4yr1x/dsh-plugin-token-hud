import { readFileSync } from 'node:fs';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => { storage.set(key, String(value)); },
};

globalThis.window = {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = {
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);

let captured;
globalThis.window.__ModuleLoader__ = {
  load(spec) { captured = spec; },
};

const hooks = {
  cursor: 0,
  states: [],
  refs: [],
  callbacks: [],
  effects: [],
  cleanups: [],
  pendingEffects: [],
};

let currentComponent;
let currentProps;
let scheduled = false;
let unmounted = false;

function scheduleRender() {
  if (scheduled || unmounted) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    render();
  });
}

const React = {
  createElement(type, props, ...children) {
    const normalized = { ...(props ?? {}) };
    if (children.length === 1) normalized.children = children[0];
    else if (children.length > 1) normalized.children = children;
    if (typeof type === 'function') return type(normalized);
    return { type, props: normalized };
  },
  useState(initial) {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.states[index], (next) => {
      hooks.states[index] = typeof next === 'function' ? next(hooks.states[index]) : next;
      scheduleRender();
    }];
  },
  useEffect(effect, deps) {
    const index = hooks.cursor++;
    const previous = hooks.effects[index];
    const changed = previous === undefined
      || deps === undefined
      || deps.length !== previous.deps?.length
      || deps.some((value, position) => !Object.is(value, previous.deps[position]));
    if (changed) hooks.pendingEffects.push({ index, effect, deps });
  },
  useCallback(callback, deps) {
    const index = hooks.cursor++;
    const previous = hooks.callbacks[index];
    const changed = previous === undefined
      || deps === undefined
      || deps.length !== previous.deps.length
      || deps.some((value, position) => !Object.is(value, previous.deps[position]));
    if (changed) hooks.callbacks[index] = { callback, deps };
    return hooks.callbacks[index].callback;
  },
  useRef(initial) {
    const index = hooks.cursor++;
    if (!(index in hooks.refs)) hooks.refs[index] = { current: initial };
    return hooks.refs[index];
  },
};

function runEffects() {
  for (const { index, effect, deps } of hooks.pendingEffects) {
    const previous = hooks.effects[index];
    if (previous?.cleanup) previous.cleanup();
    const cleanup = effect();
    hooks.effects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
  }
  hooks.pendingEffects.length = 0;
}

function render() {
  if (unmounted) return;
  hooks.cursor = 0;
  let tree;
  try {
    tree = currentComponent(currentProps);
    runEffects();
  } catch (error) {
    throw error;
  }
  globalThis.__tree = tree;
}

function unmount() {
  unmounted = true;
  for (const effect of hooks.effects) {
    try { effect?.cleanup?.(); } catch { /* best effort */ }
  }
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

function contains(node, text) {
  if (node === null || node === undefined || node === false) return false;
  if (typeof node === 'string') return node.includes(text);
  if (Array.isArray(node)) return node.some(item => contains(item, text));
  if (node.props) {
    for (const [key, value] of Object.entries(node.props)) {
      if (key === 'children') continue;
      if (typeof value === 'string' && value.includes(text)) return true;
    }
    return contains(node.props.children, text);
  }
  return false;
}

let revision = 0;
let entries = [];
let change = { kind: 'replace', entries: [] };
const listeners = new Set();
const source = {
  getSnapshot() {
    return { revision, entries, change };
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  push(event) {
    const entry = { type: event.type === 'assistant/live-chunk' ? 'transient' : 'event', event };
    entries = [...entries, entry];
    change = { kind: 'append', entries: [entry] };
    revision += 1;
    for (const listener of listeners) listener();
  },
  settle(attemptId) {
    entries = entries.filter(entry => entry.type !== 'transient');
    change = { kind: 'settle-assistant', attemptId };
    revision += 1;
    for (const listener of listeners) listener();
  },
};

const unusedFace = {
  getSnapshot: () => undefined,
  subscribe: () => () => {},
};
const session = {
  eventSource: source,
  projections: { faceOf: () => unusedFace },
};

const ctx = {
  locale: {
    getSnapshot: () => ({ active: 'zh-CN' }),
    subscribe: () => () => {},
  },
  sessions: {
    retain: () => ({
      ready: Promise.resolve({ session }),
      release() {},
    }),
  },
  remote: {
    account: {
      getBalance: async () => ({ ok: true, value: null }),
    },
  },
  slots: {
    inject(name, callback) {
      if (name !== 'sidebar.footer.action') throw new Error(`unexpected slot ${name}`);
      callback();
    },
    register(options, component) {
      captured.component = component;
      captured.options = options;
      return () => {};
    },
  },
};

storage.set('dsh-plugin-token-hud:expanded', '1');

const pluginUrl = new URL('../client.js', import.meta.url).href;
await import(pluginUrl);
if (!captured?.factory) throw new Error('client did not register a module factory');
const plugin = captured.factory((name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected require(${name})`);
});
plugin.apply(ctx);
if (!captured?.component) throw new Error('client did not register a component');
currentComponent = captured.component;
currentProps = {
  wide: true,
  useSessions: () => 'session-live',
  useSessionStatus: () => true,
};
render();
await tick();

if (!contains(globalThis.__tree, 'Token 与余额')) throw new Error('details did not render');
if (!contains(globalThis.__tree, '本会话')) throw new Error('session summary missing');

source.push({
  type: 'assistant/live-chunk',
  seq: -0.5,
  time: 100,
  data: {
    attemptId: 'attempt-1',
    turn: 1,
    step: 1,
    chunk: { type: 'text-delta', index: 0, text: 'hello world' },
  },
});
await tick();
if (!contains(globalThis.__tree, '实时生成中')) throw new Error('live status missing');
if (!contains(globalThis.__tree, '~')) throw new Error('live summary is not marked approximate');
if (!contains(globalThis.__tree, 'dsh-thud-live-inline')) throw new Error('live summary chip missing');
if (!contains(globalThis.__tree, 'dsh-thud-digit')) throw new Error('rolling digits missing');

source.push({
  type: 'assistant/live-chunk',
  seq: -0.25,
  time: 110,
  data: {
    attemptId: 'attempt-1',
    turn: 1,
    step: 1,
    chunk: {
      type: 'usage',
      usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50 },
    },
  },
});
await tick();
if (!contains(globalThis.__tree, '实时用量')) throw new Error('provider usage did not replace the estimate');
if (!contains(globalThis.__tree, '+160')) throw new Error('live usage total was not displayed');

source.push({
  type: 'assistant/message',
  seq: 100,
  time: 120,
  data: { turn: 1, step: 1, message: { id: 'm1', content: [] }, usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50 } },
});
source.settle('attempt-1');
await tick();
if (contains(globalThis.__tree, '实时生成中')) throw new Error('live status survived settlement');

const icon = readFileSync(new URL('../icon.svg', import.meta.url), 'utf8');
if (!icon.startsWith('<svg')) throw new Error('icon is not SVG');
unmount();
console.log('token-hud live test passed');
