import { readFileSync } from 'node:fs';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => { storage.set(key, String(value)); },
};

let captured;
globalThis.window = {
  __ModuleLoader__: {
    load(spec) { captured = spec; },
  },
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

const states = [];
const refs = [];
let cursor = 0;

function resetHooks() {
  cursor = 0;
  states.length = 0;
  refs.length = 0;
}

const React = {
  createElement(type, props, ...children) {
    const normalized = { ...(props ?? {}) };
    if (children.length > 0) normalized.children = children.length === 1 ? children[0] : children;
    if (typeof type === 'function') {
      if (type.name === 'TokenHud' || type.name === '') return type(normalized);
      return type(normalized);
    }
    return { type, props: normalized };
  },
  useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], (next) => {
      states[index] = typeof next === 'function' ? next(states[index]) : next;
    }];
  },
  useEffect() { cursor += 1; },
  useCallback(fn) { cursor += 1; return fn; },
  useRef(initial) {
    const index = cursor++;
    if (!(index in refs)) refs[index] = { current: initial };
    return refs[index];
  },
};

const registered = [];
const ctx = {
  locale: {
    getSnapshot: () => ({ active: 'zh-CN' }),
    subscribe: () => () => {},
  },
  sessions: {
    retain: () => ({
      ready: new Promise(() => {}),
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
      registered.push({ options, component });
      return () => {};
    },
  },
};

const pluginUrl = new URL('../client.js', import.meta.url).href;
await import(pluginUrl);
if (!captured) throw new Error('client did not register a module factory');
const plugin = captured.factory((name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected require(${name})`);
});
if (!plugin.inject.includes('remote.account')) throw new Error('missing remote.account injection');
plugin.apply(ctx);
if (registered.length !== 1) throw new Error(`expected one registration, got ${registered.length}`);
if (registered[0].options.id !== 'token-hud') throw new Error('wrong registration id');

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

function findByClass(node, className) {
  if (node === null || node === undefined || node === false) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findByClass(item, className);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (node.props) {
    if (typeof node.props.className === 'string' && node.props.className.split(/\s+/).includes(className)) return node;
    return findByClass(node.props.children, className);
  }
  return undefined;
}

resetHooks();
const collapsed = registered[0].component({
  wide: true,
  useSessions: () => undefined,
  useSessionStatus: () => false,
});
for (const text of ['Token 与余额', '余额', '今日', '未打开会话', 'dsh-thud-digit']) {
  if (!contains(collapsed, text)) throw new Error(`collapsed tree missing ${JSON.stringify(text)}`);
}

storage.set('dsh-plugin-token-hud:expanded', '1');
resetHooks();
const expanded = registered[0].component({
  wide: true,
  useSessions: () => undefined,
  useSessionStatus: () => false,
});
for (const text of ['充值余额', '赠金余额', '缓存命中率', '刷新余额', '今日消费', 'dsh-thud-popover']) {
  if (!contains(expanded, text)) throw new Error(`expanded tree missing ${JSON.stringify(text)}`);
}
const card = findByClass(expanded, 'dsh-thud-card');
if (card === undefined) throw new Error('summary card missing');
if (findByClass(card, 'dsh-thud-popover') !== undefined) throw new Error('details still expand inside the card');

resetHooks();
const rail = registered[0].component({
  wide: false,
  useSessions: () => undefined,
  useSessionStatus: () => false,
});
if (!contains(rail, 'Token 与账户余额')) throw new Error('rail tree missing accessible label');

const icon = readFileSync(new URL('../icon.svg', import.meta.url), 'utf8');
if (!icon.startsWith('<svg')) throw new Error('icon is not SVG');
if (!icon.includes('Token usage pulse')) throw new Error('icon artwork missing');
console.log('token-hud smoke test passed');
