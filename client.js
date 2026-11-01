window.__ModuleLoader__.load({
  id: 'dsh-plugin-token-hud',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;

    const EXPANDED_KEY = 'dsh-plugin-token-hud:expanded';
    const LEDGER_KEY = 'dsh-plugin-token-hud:balance-ledger:v1';
    const POLL_MS = 60_000;
    const USAGE_REFRESH_DELAY_MS = 1_200;
    // The Account Remote only uses this as an opaque client build label.
    const CLIENT_VERSION = '0.2.1-rc.5';

    const MESSAGES = Object.freeze({
      zh: Object.freeze({
        title: 'Token 与余额',
        details: '详情',
        session: '本会话',
        tokens: 'tokens',
        live: '实时',
        liveGenerating: '实时生成中',
        liveEstimate: '实时估算',
        liveExact: '实时用量',
        liveNote: '完成后按会话统计校正',
        chars: '字符',
        balance: '余额',
        rechargeBalance: '充值余额',
        bonusBalance: '赠金余额',
        todaySpend: '今日消费',
        todayShort: '今日',
        input: '输入',
        cacheRead: '缓存读取',
        cacheWrite: '缓存写入',
        output: '输出',
        total: '合计',
        context: '上下文',
        loading: '读取中…',
        signedOut: '未登录',
        unavailable: '不可用',
        noSession: '未打开会话',
        refresh: '刷新余额',
        refreshing: '刷新中…',
        expand: '展开 Token 与余额详情',
        collapse: '收起 Token 与余额详情',
        updated: '更新于 {time}',
        cacheHitRate: '缓存命中率',
        stale: '刷新失败，显示上次结果',
        note: '余额来自 DeepSeek 账户；今日消费按今日余额下降累计，充值不会计入。',
        aria: 'Token 与账户余额。{tokens} tokens，余额 {balance}，今日消费 {spent}。',
      }),
      en: Object.freeze({
        title: 'Token & Balance',
        details: 'Details',
        session: 'This session',
        tokens: 'tokens',
        live: 'Live',
        liveGenerating: 'Generating live',
        liveEstimate: 'Live estimate',
        liveExact: 'Live usage',
        liveNote: 'Corrected by session usage when settled',
        chars: 'chars',
        balance: 'Balance',
        rechargeBalance: 'Recharge balance',
        bonusBalance: 'Bonus balance',
        todaySpend: "Today's spend",
        todayShort: 'Today',
        input: 'Input',
        cacheRead: 'Cache read',
        cacheWrite: 'Cache write',
        output: 'Output',
        total: 'Total',
        context: 'Context',
        loading: 'Loading…',
        signedOut: 'Signed out',
        unavailable: 'Unavailable',
        noSession: 'No session open',
        refresh: 'Refresh balance',
        refreshing: 'Refreshing…',
        expand: 'Expand token and balance details',
        collapse: 'Collapse token and balance details',
        updated: 'Updated {time}',
        cacheHitRate: 'Cache hit rate',
        stale: 'Refresh failed; showing the last result',
        note: 'Balance comes from the DeepSeek account. Today’s spend accumulates balance decreases; top-ups are ignored.',
        aria: 'Token and account balance. {tokens} tokens, balance {balance}, today’s spend {spent}.',
      }),
    });

    function normalizeLanguage(value) {
      return typeof value === 'string' && /^zh(?:$|[-_])/i.test(value.trim()) ? 'zh' : 'en';
    }

    function translate(language, key, values = {}) {
      const table = MESSAGES[normalizeLanguage(language)] ?? MESSAGES.en;
      const message = table[key] ?? MESSAGES.en[key] ?? key;
      return message.replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
      ));
    }

    function languageOf(ctx) {
      try {
        return normalizeLanguage(ctx.locale?.getSnapshot?.().active);
      } catch {
        return 'en';
      }
    }

    function useLanguage(ctx) {
      const [language, setLanguage] = React.useState(() => languageOf(ctx));
      React.useEffect(() => {
        let alive = true;
        const publish = () => {
          if (alive) setLanguage(languageOf(ctx));
        };
        let stop = () => {};
        try {
          stop = ctx.locale?.subscribe?.(publish) ?? (() => {});
        } catch {
          stop = () => {};
        }
        publish();
        return () => {
          alive = false;
          try { stop(); } catch { /* the locale service is already gone */ }
        };
      }, [ctx]);
      return language;
    }

    function selectedSessionId(snapshot) {
      const rows = Object.values(snapshot?.byId ?? {});
      const main = rows.find(row => (row?.retainedBy?.mainView ?? 0) > 0);
      return main?.id;
    }

    function useNoSessions() {
      return undefined;
    }

    function useNoStatus() {
      return false;
    }

    function useSelectedSessionId(useSessions) {
      const useCatalog = typeof useSessions === 'function' ? useSessions : useNoSessions;
      return useCatalog(snapshot => selectedSessionId(snapshot));
    }

    function useSessionRunning(useSessionStatus, sessionId) {
      const useStatus = typeof useSessionStatus === 'function' ? useSessionStatus : useNoStatus;
      return useStatus(statuses => Boolean(
        sessionId && statuses?.get?.(sessionId)?.running,
      ));
    }

    function readProjection(face) {
      try {
        return face?.getSnapshot?.();
      } catch {
        return undefined;
      }
    }

    const EMPTY_LIVE = Object.freeze({
      active: false,
      attemptId: undefined,
      turn: undefined,
      step: undefined,
      chars: 0,
      cjk: 0,
      usage: undefined,
      startedAt: 0,
      updatedAt: 0,
    });

    function isCjkCodePoint(codePoint) {
      return (codePoint >= 0x2e80 && codePoint <= 0x9fff)
        || (codePoint >= 0x3040 && codePoint <= 0x30ff)
        || (codePoint >= 0xac00 && codePoint <= 0xd7af)
        || (codePoint >= 0xf900 && codePoint <= 0xfaff);
    }

    function addLiveText(state, text) {
      if (!state.active || typeof text !== 'string' || text.length === 0) return state;
      let cjk = 0;
      for (const character of text) {
        if (isCjkCodePoint(character.codePointAt(0))) cjk += 1;
      }
      return { ...state, chars: state.chars + text.length, cjk: state.cjk + cjk };
    }

    function beginLive(data, time) {
      return {
        active: true,
        attemptId: data.attemptId,
        turn: data.turn,
        step: data.step,
        chars: 0,
        cjk: 0,
        usage: undefined,
        startedAt: time,
        updatedAt: time,
      };
    }

    /**
     * Fold one transient Assistant frame. Text is counted as it streams; the
     * provider's `usage` frame, when present, replaces the character estimate.
     */
    function applyLiveChunk(state, data, time) {
      if (!data || typeof data.attemptId !== 'string' || !data.chunk) return state;
      let next = state.active && state.attemptId === data.attemptId
        ? state
        : beginLive(data, Number.isFinite(time) ? time : Date.now());
      const chunk = data.chunk;
      if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
        next = addLiveText(next, chunk.text);
      } else if (chunk.type === 'tool-call-delta') {
        next = addLiveText(next, chunk.argumentsDelta);
      } else if (chunk.type === 'usage' && chunk.usage !== null && typeof chunk.usage === 'object') {
        next = { ...next, usage: chunk.usage };
      }
      return next === state ? state : {
        ...next,
        updatedAt: Number.isFinite(time) ? time : Date.now(),
      };
    }

    function applyLiveEntry(state, entry) {
      const event = entry?.event;
      if (!event) return state;
      if (event.type === 'assistant/live-chunk') return applyLiveChunk(state, event.data, event.time);
      if (
        event.type === 'assistant/message'
        || event.type === 'assistant/attempt'
        || event.type === 'step/end'
        || event.type === 'turn/end'
        || event.type === 'llm/retry'
        || event.type === 'llm/retry-started'
      ) {
        return EMPTY_LIVE;
      }
      return state;
    }

    function liveFromEntries(entries) {
      let live = EMPTY_LIVE;
      for (const entry of entries ?? []) live = applyLiveEntry(live, entry);
      return live;
    }

    function liveUsageTotal(usage) {
      if (!usage || typeof usage !== 'object') return undefined;
      if (!Number.isFinite(usage.outputTokens)) return undefined;
      return (Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0)
        + (Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0)
        + (Number.isFinite(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0)
        + usage.outputTokens;
    }

    function liveEstimatedOutput(live) {
      if (!live?.active) return 0;
      const other = Math.max(0, live.chars - live.cjk);
      return Math.ceil(live.cjk / 1.5 + other / 4);
    }

    function liveAddedTokens(live) {
      if (!live?.active) return 0;
      const exact = liveUsageTotal(live.usage);
      return exact !== undefined && exact > 0 ? exact : liveEstimatedOutput(live);
    }

    function liveOutputTokens(live) {
      if (!live?.active) return 0;
      if (Number.isFinite(live.usage?.outputTokens) && live.usage.outputTokens > 0) return live.usage.outputTokens;
      return liveEstimatedOutput(live);
    }

    function useSessionMetrics(ctx, sessionId) {
      const [metrics, setMetrics] = React.useState({ sessionId: undefined, live: EMPTY_LIVE });
      React.useEffect(() => {
        if (!sessionId) {
          setMetrics({ sessionId: undefined, live: EMPTY_LIVE });
          return;
        }
        let alive = true;
        let stopProjections = () => {};
        let stopEvents = () => {};
        let reference;
        let frame = 0;
        let timer = 0;
        let usageFace;
        let pressureFace;
        let live = EMPTY_LIVE;

        const cancelScheduled = () => {
          if (frame) {
            try { cancelAnimationFrame(frame); } catch { /* already gone */ }
            frame = 0;
          }
          if (timer) {
            window.clearTimeout(timer);
            timer = 0;
          }
        };
        const publish = () => {
          cancelScheduled();
          if (!alive) return;
          setMetrics({
            sessionId,
            usage: readProjection(usageFace),
            pressure: readProjection(pressureFace),
            live,
          });
        };
        const schedule = () => {
          if (!alive || frame || timer) return;
          if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(publish);
          else timer = window.setTimeout(publish, 80);
        };

        try {
          reference = ctx.sessions.retain(sessionId, { source: 'token-hud' });
        } catch {
          setMetrics({ sessionId, live: EMPTY_LIVE });
          return;
        }

        Promise.resolve(reference.ready).then((binding) => {
          if (!alive) return;
          const projections = binding?.session?.projections;
          if (projections?.faceOf) {
            usageFace = projections.faceOf('tokenUsage');
            pressureFace = projections.faceOf('contextPressure');
            const stops = [];
            try {
              const off = usageFace?.subscribe?.(schedule);
              if (typeof off === 'function') stops.push(off);
            } catch { /* a missing token meter leaves the rows empty */ }
            try {
              const off = pressureFace?.subscribe?.(schedule);
              if (typeof off === 'function') stops.push(off);
            } catch { /* context pressure is optional */ }
            stopProjections = () => {
              for (const off of stops) {
                try { off(); } catch { /* already disposed */ }
              }
            };
          }

          const source = binding?.session?.eventSource;
          if (source?.getSnapshot && source?.subscribe) {
            try {
              const initial = source.getSnapshot();
              live = liveFromEntries(initial.entries);
              let revision = initial.revision;
              stopEvents = source.subscribe(() => {
                if (!alive) return;
                let snapshot;
                try {
                  snapshot = source.getSnapshot();
                } catch {
                  return;
                }
                if (snapshot.revision === revision) return;
                revision = snapshot.revision;
                const change = snapshot.change;
                if (change?.kind === 'replace') {
                  live = liveFromEntries(snapshot.entries);
                  schedule();
                } else if (change?.kind === 'append') {
                  for (const entry of change.entries ?? []) live = applyLiveEntry(live, entry);
                  schedule();
                } else if (change?.kind === 'settle-assistant') {
                  live = EMPTY_LIVE;
                  schedule();
                }
              });
            } catch { /* live chunks are optional; committed usage still works */ }
          }

          publish();
        }).catch(() => {
          if (alive) setMetrics({ sessionId, live: EMPTY_LIVE });
        });

        return () => {
          alive = false;
          cancelScheduled();
          try { stopEvents(); } catch { /* already disposed */ }
          try { stopProjections(); } catch { /* already disposed */ }
          try { reference?.release?.(); } catch { /* already released */ }
        };
      }, [ctx, sessionId]);
      return metrics.sessionId === sessionId ? metrics : { sessionId, live: EMPTY_LIVE };
    }

    function sumUsage(usage) {
      if (usage === null || typeof usage !== 'object') return undefined;
      const values = [
        usage.uncachedInputTokens,
        usage.cacheReadTokens,
        usage.cacheWriteTokens,
        usage.outputTokens,
      ];
      if (!values.every(value => Number.isFinite(value) && value >= 0)) return undefined;
      return values.reduce((total, value) => total + value, 0);
    }

    function promptTokens(usage) {
      if (usage === null || typeof usage !== 'object') return 0;
      return [usage.uncachedInputTokens, usage.cacheReadTokens, usage.cacheWriteTokens]
        .filter(value => Number.isFinite(value) && value >= 0)
        .reduce((total, value) => total + value, 0);
    }

    function cacheHitPercent(usage) {
      const prompt = promptTokens(usage);
      const cached = Number(usage?.cacheReadTokens ?? 0);
      return prompt > 0 && Number.isFinite(cached)
        ? Math.max(0, Math.min(100, (cached / prompt) * 100))
        : null;
    }

    function formatTokens(value) {
      if (!Number.isFinite(value) || value < 0) return '—';
      if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)}B`;
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
      return String(Math.round(value));
    }

    function formatExact(value, language) {
      if (!Number.isFinite(value) || value < 0) return '—';
      try {
        return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US').format(value);
      } catch {
        return String(Math.round(value));
      }
    }

    function formatPercent(value, language) {
      if (!Number.isFinite(value)) return '—';
      return `${value.toFixed(value < 10 ? 1 : 0)}%`;
    }

    function currencySymbol(currency) {
      return currency === 'USD' ? '$' : '¥';
    }

    function formatMoney(value, currency, digits = 2) {
      const symbol = currencySymbol(currency);
      const amount = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(amount)) return `${symbol}—`;
      return `${amount < 0 ? '-' : ''}${symbol}${Math.abs(amount).toLocaleString('zh-CN', {
        minimumFractionDigits: Math.min(2, digits),
        maximumFractionDigits: digits,
      })}`;
    }

    function localDay(time) {
      const date = new Date(time);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
      return local.toISOString().slice(0, 10);
    }

    function round(value, digits = 6) {
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    }

    function walletGroups(wallets, bonusWallets) {
      const groups = new Map();
      const add = (list, bonus) => {
        for (const wallet of Array.isArray(list) ? list : []) {
          const currency = wallet?.currency === 'USD' ? 'USD' : 'CNY';
          const amount = Number(wallet?.balance);
          if (!Number.isFinite(amount)) continue;
          const group = groups.get(currency) ?? {
            currency,
            normal: 0,
            bonus: 0,
          };
          if (bonus) group.bonus += amount;
          else group.normal += amount;
          groups.set(currency, group);
        }
      };
      add(wallets, false);
      add(bonusWallets, true);
      return [...groups.values()];
    }

    function readLedger() {
      try {
        const value = JSON.parse(localStorage.getItem(LEDGER_KEY) ?? 'null');
        return value !== null && typeof value === 'object' ? value : null;
      } catch {
        return null;
      }
    }

    function writeLedger(ledger) {
      try {
        localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
      } catch { /* private storage can reject writes */ }
    }

    function updateLedger(wallets, bonusWallets, time = Date.now()) {
      const groups = walletGroups(wallets, bonusWallets);
      if (groups.length === 0) return null;
      const chosen = groups.find(group => group.currency === 'CNY') ?? groups[0];
      const total = round(chosen.normal + chosen.bonus, 8);
      const day = localDay(time);
      let ledger = readLedger();
      if (
        ledger === null
        || ledger.day !== day
        || ledger.currency !== chosen.currency
        || !Number.isFinite(Number(ledger.last))
      ) {
        ledger = { day, currency: chosen.currency, last: total, spent: 0 };
      } else {
        const previous = Number(ledger.last);
        if (total < previous) {
          ledger.spent = round(Math.max(0, Number(ledger.spent) || 0) + (previous - total), 6);
        }
        ledger.last = total;
      }
      ledger.updatedAt = time;
      writeLedger(ledger);
      return ledger;
    }

    function clientMetadata(ctx) {
      let locale = 'en';
      try {
        locale = ctx.locale?.getSnapshot?.().active ?? 'en';
      } catch { /* keep the default */ }
      return {
        version: CLIENT_VERSION,
        locale,
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      };
    }

    function useBalance(ctx, totalTokens) {
      const [state, setState] = React.useState({
        status: 'loading',
        wallets: [],
        bonusWallets: [],
        ledger: null,
        at: null,
        stale: false,
      });
      const [refreshing, setRefreshing] = React.useState(false);
      const alive = React.useRef(true);
      const inflight = React.useRef(false);

      const read = React.useCallback(async (manual = false) => {
        if (!alive.current || inflight.current) return;
        inflight.current = true;
        if (manual) setRefreshing(true);
        try {
          const result = await ctx.remote.account.getBalance(clientMetadata(ctx));
          if (!alive.current) return;
          if (!result?.ok) {
            setState(previous => ({
              ...previous,
              status: previous.wallets.length > 0 ? 'ready' : 'failed',
              stale: previous.wallets.length > 0,
            }));
            return;
          }
          const value = result.value;
          if (value === null) {
            setState({ status: 'signed-out', wallets: [], bonusWallets: [], ledger: null, at: Date.now(), stale: false });
            return;
          }
          if (value?.status !== 'ready') {
            setState(previous => ({
              ...previous,
              status: previous.wallets.length > 0 ? 'ready' : 'failed',
              stale: previous.wallets.length > 0,
            }));
            return;
          }
          const wallets = Array.isArray(value.value) ? value.value : [];
          const bonusWallets = Array.isArray(value.bonusWallets) ? value.bonusWallets : [];
          const now = Date.now();
          setState({
            status: 'ready',
            wallets,
            bonusWallets,
            ledger: updateLedger(wallets, bonusWallets, now),
            at: now,
            stale: false,
          });
        } catch {
          if (alive.current) {
            setState(previous => ({
              ...previous,
              status: previous.wallets.length > 0 ? 'ready' : 'failed',
              stale: previous.wallets.length > 0,
            }));
          }
        } finally {
          inflight.current = false;
          if (alive.current && manual) setRefreshing(false);
        }
      }, [ctx]);

      React.useEffect(() => {
        alive.current = true;
        void read(false);
        const timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') void read(false);
        }, POLL_MS);
        const onVisibility = () => {
          if (document.visibilityState === 'visible') void read(false);
        };
        const onOnline = () => { void read(false); };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('online', onOnline);
        return () => {
          alive.current = false;
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisibility);
          window.removeEventListener('online', onOnline);
        };
      }, [read]);

      React.useEffect(() => {
        if (!Number.isFinite(totalTokens)) return undefined;
        const timer = window.setTimeout(() => { void read(false); }, USAGE_REFRESH_DELAY_MS);
        return () => window.clearTimeout(timer);
      }, [totalTokens, read]);

      return [state, read, refreshing];
    }

    function useExpanded() {
      const [expanded, setExpanded] = React.useState(() => {
        try {
          const stored = localStorage.getItem(EXPANDED_KEY);
          return stored === null ? false : stored === '1';
        } catch {
          return false;
        }
      });
      const update = React.useCallback((next) => {
        setExpanded(next);
        try { localStorage.setItem(EXPANDED_KEY, next ? '1' : '0'); } catch { /* storage is optional */ }
      }, []);
      return [expanded, update];
    }

    /**
     * Render a formatted number as odometer reels. Digits roll vertically when
     * their position changes; punctuation, currency symbols, and suffixes stay
     * static. A short color flash marks the direction of the change.
     */
    function RollingNumber({ text, value, className = '', ariaLabel, flash = true }) {
      const label = ariaLabel ?? String(text ?? '');
      const previous = React.useRef(value);
      const [flashState, setFlashState] = React.useState(null);

      React.useEffect(() => {
        const before = previous.current;
        previous.current = value;
        if (!flash || !Number.isFinite(before) || !Number.isFinite(value) || before === value) return undefined;
        setFlashState(value < before ? 'down' : 'up');
        const timer = window.setTimeout(() => setFlashState(null), 720);
        return () => window.clearTimeout(timer);
      }, [value, flash]);

      const visual = [];
      const characters = Array.from(String(text ?? ''));
      for (const [index, character] of characters.entries()) {
        if (/[0-9]/.test(character)) {
          const digit = Number(character);
          visual.push(h('span', { className: 'dsh-thud-digit', key: `d${index}` },
            h('span', {
              className: 'dsh-thud-reel',
              style: { transform: `translateY(-${digit}em)` },
            }, Array.from({ length: 10 }, (_, number) => h('span', { key: number }, String(number))))));
        } else {
          visual.push(h('span', { className: 'dsh-thud-static', key: `s${index}` }, character));
        }
      }

      return h('span', {
        className: `dsh-thud-number${className ? ` ${className}` : ''}`,
        'data-flash': flashState ?? undefined,
        'aria-label': label,
        title: label,
      }, h('span', { className: 'dsh-thud-number-visual', 'aria-hidden': 'true' }, visual));
    }

    function IconPulse({ size = 18 }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        'aria-hidden': true,
        focusable: 'false',
      }, [
        h('circle', {
          key: 'ring',
          cx: 12,
          cy: 12,
          r: 8.4,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
        }),
        h('path', {
          key: 'pulse',
          d: 'M5.9 12h2.9l1.4-3.2 2.7 6.4 1.4-3.2h3',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      ]);
    }

    function IconChevron({ expanded }) {
      return h('svg', {
        viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: 'false',
        style: {
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform .16s ease',
        },
      }, h('path', {
        d: 'M4 6.25 8 10.25l4-4',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    function IconRefresh({ spinning }) {
      return h('svg', {
        viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: 'false',
        style: { animation: spinning ? 'dsh-thud-spin 1s linear infinite' : undefined },
      }, h('path', {
        d: 'M12.6 6.2A5.2 5.2 0 1 0 13 9.6M12.6 2.8v3.7H8.9',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    const CSS = `
.dsh-thud-root{position:relative;z-index:5;flex:1 1 auto;width:auto;min-width:0;font-family:var(--dsw-font-family,inherit);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);text-align:left}
.dsh-thud-root *{box-sizing:border-box}
.dsh-thud-root button{font:inherit;color:inherit}
.dsh-thud-card{width:100%;min-width:0;border:.5px solid var(--dsw-alias-border-l2,light-dark(#0000001a,#ffffff1f));border-radius:12px;background:var(--dsw-alias-settings-card-fill,var(--dsw-specific-menu,light-dark(#f8f9fa,#303136)));overflow:hidden;transition:border-color .2s ease,box-shadow .2s ease}
.dsh-thud-card:hover{border-color:var(--dsw-alias-border-l3,light-dark(#0000001f,#ffffff29));box-shadow:0 4px 16px #00000010}
.dsh-thud-summary{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:7px 8px;border:0;background:0 0;text-align:left;cursor:pointer;overflow:hidden}
.dsh-thud-summary:hover{background:var(--dsw-alias-interactive-bg-hover,light-dark(#2631480f,#ffffff14))}
.dsh-thud-summary:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#2e6bff));outline-offset:-2px;border-radius:12px}
.dsh-thud-glyph{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:26px;height:26px;border-radius:8px;color:var(--dsw-alias-brand-primary,light-dark(#2e6bff,#a8c1ff));background:color-mix(in srgb,currentColor 10%,transparent)}
.dsh-thud-glyph[data-running=true]:after{content:"";position:absolute;right:1px;bottom:1px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#22a06b);box-shadow:0 0 0 1.5px var(--dsw-alias-bg-base,light-dark(#fff,#1e1e20))}
.dsh-thud-glyph[data-live=true]{color:var(--dsw-alias-state-business-primary,#2e6bff)}
.dsh-thud-glyph[data-live=true]:before{content:"";position:absolute;inset:-2px;border:1px solid currentColor;border-radius:10px;opacity:.45;animation:dsh-thud-live-ring 1.4s ease-out infinite;pointer-events:none}
.dsh-thud-spent{display:inline-flex;align-items:baseline;white-space:nowrap}
.dsh-thud-live-inline{font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}
.dsh-thud-number.dsh-thud-live-inline{color:var(--dsw-alias-state-business-primary,light-dark(#2e6bff,#8fb0ff))}
.dsh-thud-copy{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0;overflow:hidden}
.dsh-thud-row{display:flex;align-items:baseline;gap:4px;min-width:0;overflow:hidden}
.dsh-thud-total{font-size:12px;font-weight:500;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-thud-unit{color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8));font-size:10px;line-height:14px}
.dsh-thud-spacer{flex:1;min-width:4px}
.dsh-thud-balance{display:flex;align-items:baseline;gap:3px;min-width:0;flex:none}
.dsh-thud-balance-label{color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8));font-size:9px;line-height:12px;white-space:nowrap}
.dsh-thud-money{font-size:12px;font-weight:500;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dsw-alias-label-primary,inherit)}
.dsh-thud-number{display:inline-flex;align-items:baseline;height:1em;line-height:1;vertical-align:-.06em;font-family:"Segoe UI Variable Text","Segoe UI",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1,"lnum" 1;letter-spacing:0;white-space:nowrap;color:inherit}
.dsh-thud-number-visual{display:inline-flex;align-items:baseline;height:1em}
.dsh-thud-static{display:inline-block;height:1em;line-height:1em;white-space:pre}
.dsh-thud-digit{display:inline-block;position:relative;width:1.05ch;height:1em;overflow:hidden;flex:none;font-variant-numeric:tabular-nums}
.dsh-thud-reel{display:flex;flex-direction:column;transition:transform .52s cubic-bezier(.22,1,.36,1);will-change:transform}
.dsh-thud-reel>span{display:block;height:1em;line-height:1em;text-align:center}
.dsh-thud-number[data-flash="down"]{animation:dsh-thud-number-down .72s ease-out}
.dsh-thud-number[data-flash="up"]{animation:dsh-thud-number-up .62s ease-out}
.dsh-thud-sub{display:flex;align-items:baseline;gap:4px;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8));font-size:10px;line-height:14px;white-space:nowrap}
.dsh-thud-sub .dsh-thud-ellipsis{overflow:hidden;text-overflow:ellipsis}
.dsh-thud-chevron{display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8))}
.dsh-thud-popover{box-sizing:border-box;width:100%;max-height:min(28vh,200px);overflow:auto;margin-bottom:6px;padding:2px 10px 9px;border:.5px solid var(--dsw-alias-border-l3,light-dark(#0000001f,#ffffff29));border-radius:12px;background:var(--dsw-specific-menu,light-dark(#f8f9fa,#303136));box-shadow:var(--dsw-elevation-panel,0 10px 28px #00000020);animation:dsh-thud-pop-in .18s cubic-bezier(.22,1,.36,1);transform-origin:bottom center}
.dsh-thud-popover-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0 4px;background:var(--dsw-specific-menu,light-dark(#f8f9fa,#303136))}
.dsh-thud-popover-title{font-size:10px;font-weight:500;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8))}
.dsh-thud-popover-close{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8));cursor:pointer;font-size:15px!important;line-height:1}
.dsh-thud-popover-close:hover{background:var(--dsw-alias-interactive-bg-hover,light-dark(#2631480f,#ffffff14));color:var(--dsw-alias-label-primary,inherit)}
.dsh-thud-popover-close:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#2e6bff));outline-offset:1px}
.dsh-thud-popover::-webkit-scrollbar{width:6px}
.dsh-thud-popover::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2,#00000024);border-radius:999px}
.dsh-thud-live-block{display:flex;flex-direction:column;gap:3px;padding:8px 0 7px;border-bottom:.5px solid var(--dsw-alias-border-l1,light-dark(#0000000a,#ffffff0f))}
.dsh-thud-live-row{display:flex;align-items:center;gap:5px;min-width:0}
.dsh-thud-live-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-business-primary,#2e6bff);animation:dsh-thud-live-blink 1.2s ease-in-out infinite}
.dsh-thud-live-label{font-size:11px;font-weight:500;color:var(--dsw-alias-state-business-primary,light-dark(#2e6bff,#8fb0ff));white-space:nowrap}
.dsh-thud-live-amount{margin-left:auto;font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dsw-alias-label-primary,inherit)}
.dsh-thud-live-detail{font-size:10px;line-height:14px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,light-dark(#61666b,#cfd3d6));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-thud-live-note{font-size:9px;line-height:13px;color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8))}
.dsh-thud-section{display:flex;flex-direction:column;gap:5px;padding-top:8px}
.dsh-thud-section-head{display:flex;align-items:baseline;gap:6px;min-width:0}
.dsh-thud-section-title{font-size:11px;font-weight:500;color:var(--dsw-alias-label-secondary,light-dark(#61666b,#cfd3d6))}
.dsh-thud-section-value{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8));font-variant-numeric:tabular-nums}
.dsh-thud-grid{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:baseline}
.dsh-thud-grid dt{color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8));font-size:10px;line-height:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-thud-grid dd{margin:0;text-align:right;font-size:11px;line-height:15px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dsw-alias-label-secondary,light-dark(#61666b,#cfd3d6))}
.dsh-thud-grid dd.is-total{color:var(--dsw-alias-label-primary,inherit);font-weight:500}
.dsh-thud-bar{position:relative;height:4px;border-radius:999px;background:var(--dsw-alias-bg-skeleton,light-dark(#eceef2,#2c2d30));overflow:hidden;margin-top:2px}
.dsh-thud-bar>span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--dsw-alias-brand-primary,#2e6bff),var(--dsw-alias-state-business-primary,#6d4aff));transition:width .2s ease}
.dsh-thud-rule{height:.5px;background:var(--dsw-alias-border-l1,light-dark(#0000000a,#ffffff0f));margin:8px 0 0}
.dsh-thud-account{display:flex;flex-direction:column;gap:5px;padding-top:8px}
.dsh-thud-account-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}
.dsh-thud-account-row>span:first-child{color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8));font-size:10px;line-height:15px;white-space:nowrap}
.dsh-thud-account-row>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:11px;line-height:15px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dsw-alias-label-secondary,light-dark(#61666b,#cfd3d6))}
.dsh-thud-account-row.is-primary>span:last-child{color:var(--dsw-alias-label-primary,inherit);font-weight:500}
.dsh-thud-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px;margin-top:8px;border-top:.5px solid var(--dsw-alias-border-l1,light-dark(#0000000a,#ffffff0f));color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8));font-size:10px;line-height:15px}
.dsh-thud-refresh{display:inline-flex;align-items:center;gap:4px;padding:2px 5px;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-secondary,light-dark(#61666b,#cfd3d6));cursor:pointer;font-size:10px!important}
.dsh-thud-refresh:hover{background:var(--dsw-alias-interactive-bg-hover,light-dark(#2631480f,#ffffff14))}
.dsh-thud-refresh:disabled{opacity:.6;cursor:default}
.dsh-thud-refresh:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#2e6bff));outline-offset:1px}
.dsh-thud-note{padding-top:5px;color:var(--dsw-alias-label-tertiary,light-dark(#81858c,#adb2b8));font-size:9px;line-height:13px}
.dsh-thud-stale{color:var(--dsw-alias-state-warning-primary,#b7791f)}
.dsh-thud-rail{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;color:var(--dsw-alias-label-secondary,light-dark(#61666b,#cfd3d6))}
@media (prefers-reduced-motion:reduce){.dsh-thud-chevron svg,.dsh-thud-bar>span,.dsh-thud-reel{transition:none}.dsh-thud-glyph[data-live=true]:before,.dsh-thud-live-dot,.dsh-thud-popover,.dsh-thud-number{animation:none}}
@keyframes dsh-thud-spin{to{transform:rotate(360deg)}}
@keyframes dsh-thud-pop-in{from{opacity:0;transform:translateY(5px) scale(.985)}to{opacity:1;transform:none}}
@keyframes dsh-thud-number-down{0%{color:var(--dsw-alias-state-warning-primary,#b7791f)}100%{color:inherit}}
@keyframes dsh-thud-number-up{0%{color:var(--dsw-alias-state-business-primary,#2e6bff)}100%{color:inherit}}
@keyframes dsh-thud-live-blink{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes dsh-thud-live-ring{0%{opacity:.45;transform:scale(.96)}70%{opacity:0;transform:scale(1.12)}100%{opacity:0;transform:scale(1.12)}}
`;

    function TokenHud({ useSessions, useSessionStatus, wide = true }) {
      const ctx = TokenHud.ctx;
      const language = useLanguage(ctx);
      const t = (key, values) => translate(language, key, values);
      const sessionId = useSelectedSessionId(useSessions);
      const running = useSessionRunning(useSessionStatus, sessionId);
      const metrics = useSessionMetrics(ctx, sessionId);
      const usage = metrics.usage;
      const pressure = metrics.pressure;
      const live = metrics.live ?? EMPTY_LIVE;
      const liveActive = live.active === true;
      const liveAdded = liveAddedTokens(live);
      const total = sumUsage(usage);
      const displayTotal = (Number.isFinite(total) ? total : 0) + (liveActive ? liveAdded : 0);
      const displayKnown = Number.isFinite(total) || liveActive;
      const [balance, refresh, refreshing] = useBalance(ctx, total);
      const [expanded, setExpanded] = useExpanded();
      const rootRef = React.useRef(null);

      React.useEffect(() => {
        if (!expanded) return undefined;
        const onPointerDown = (event) => {
          if (!rootRef.current?.contains(event.target)) setExpanded(false);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setExpanded(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [expanded, setExpanded]);

      const groups = walletGroups(balance.wallets, balance.bonusWallets);
      const primary = groups.find(group => group.currency === 'CNY') ?? groups[0];
      const balanceAvailable = balance.status === 'ready' && primary !== undefined;
      const balanceText = balanceAvailable
        ? formatMoney(primary.normal, primary.currency, 2)
        : balance.status === 'signed-out'
          ? t('signedOut')
          : balance.status === 'loading'
            ? t('loading')
            : t('unavailable');
      const spentText = balance.ledger !== null
        ? formatMoney(balance.ledger.spent, balance.ledger.currency, 2)
        : '—';
      const tokenText = displayKnown
        ? `${liveActive ? '~' : ''}${formatTokens(displayTotal)}`
        : '—';
      const displayExact = displayKnown ? formatExact(displayTotal, language) : '—';
      const exactTotal = Number.isFinite(total) ? formatExact(total, language) : '—';
      const liveOutput = liveOutputTokens(live);
      const liveChars = Number.isFinite(live.chars) ? formatExact(live.chars, language) : '0';
      const cacheHit = cacheHitPercent(usage);
      const cacheText = cacheHit === null ? '—' : formatPercent(cacheHit, language);
      const contextUsed = Number.isFinite(pressure?.pressureTokens) ? pressure.pressureTokens : undefined;
      const contextWindow = Number.isFinite(pressure?.contextWindow) ? pressure.contextWindow : undefined;
      const contextPercent = contextUsed !== undefined && contextWindow > 0
        ? Math.max(0, Math.min(100, (contextUsed / contextWindow) * 100))
        : null;
      const updated = balance.at === null
        ? null
        : new Date(balance.at).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
      const aria = t('aria', {
        tokens: displayKnown ? `${liveActive ? `~${displayExact}` : displayExact}` : '—',
        balance: balanceText,
        spent: spentText,
      });

      if (!wide) {
        return h('div', {
          className: 'dsh-thud-root',
          role: 'img',
          title: aria,
          'aria-label': aria,
          style: { width: 'auto' },
        }, h('span', { className: 'dsh-thud-rail' }, h(IconPulse, { size: 17 })));
      }

      const liveDetail = live.usage
        ? `${t('liveExact')} +${formatTokens(liveAdded)} ${t('tokens')} · ${t('output')} ${formatTokens(liveOutput)}`
        : `${t('liveEstimate')} ~${formatTokens(liveAdded)} ${t('tokens')} · ${liveChars} ${t('chars')}`;

      const details = expanded && h('div', {
        className: 'dsh-thud-popover dsh-thud-details',
        id: 'dsh-token-hud-details',
        role: 'region',
        'aria-label': t('title'),
      }, [
        h('div', { className: 'dsh-thud-popover-head', key: 'head' }, [
          h('span', { className: 'dsh-thud-popover-title', key: 'title' }, t('details')),
          h('button', {
            key: 'close',
            type: 'button',
            className: 'dsh-thud-popover-close',
            onClick: () => setExpanded(false),
            title: t('collapse'),
            'aria-label': t('collapse'),
          }, '×'),
        ]),
        liveActive && h('div', { className: 'dsh-thud-live-block', key: 'live' }, [
          h('div', { className: 'dsh-thud-live-row', key: 'row' }, [
            h('span', { className: 'dsh-thud-live-dot', key: 'dot' }),
            h('span', { className: 'dsh-thud-live-label', key: 'label' }, t('liveGenerating')),
            h('span', { className: 'dsh-thud-live-amount', key: 'amount' }, [
              h(RollingNumber, {
                key: 'value',
                text: `+${formatTokens(liveAdded)}`,
                value: liveAdded,
                ariaLabel: `${t('live')} +${formatTokens(liveAdded)}`,
                flash: false,
              }),
              ` ${t('tokens')}`,
            ]),
          ]),
          h('div', { className: 'dsh-thud-live-detail', key: 'detail' }, liveDetail),
          h('div', { className: 'dsh-thud-live-note', key: 'note' }, t('liveNote')),
        ]),
        h('div', { className: 'dsh-thud-section', key: 'session' }, [
          h('div', { className: 'dsh-thud-section-head', key: 'head' }, [
            h('span', { className: 'dsh-thud-section-title', key: 'title' }, t('session')),
            h('span', { className: 'dsh-thud-section-value', key: 'value' }, [
              h(RollingNumber, {
                key: 'total',
                text: exactTotal,
                value: total,
                ariaLabel: `${t('session')} ${exactTotal} ${t('tokens')}`,
              }),
              ` ${t('tokens')}`,
            ]),
          ]),
          h('dl', { className: 'dsh-thud-grid', key: 'grid' }, [
            h('dt', { key: 'input-label' }, t('input')),
            h('dd', { key: 'input' }, h(RollingNumber, {
              text: Number.isFinite(usage?.uncachedInputTokens) ? formatExact(usage.uncachedInputTokens, language) : '—',
              value: usage?.uncachedInputTokens,
              ariaLabel: `${t('input')} ${formatExact(usage?.uncachedInputTokens ?? 0, language)}`,
            })),
            h('dt', { key: 'cache-label' }, t('cacheRead')),
            h('dd', { key: 'cache' }, h(RollingNumber, {
              text: Number.isFinite(usage?.cacheReadTokens) ? formatExact(usage.cacheReadTokens, language) : '—',
              value: usage?.cacheReadTokens,
              ariaLabel: `${t('cacheRead')} ${formatExact(usage?.cacheReadTokens ?? 0, language)}`,
            })),
            h('dt', { key: 'output-label' }, t('output')),
            h('dd', { key: 'output' }, h(RollingNumber, {
              text: Number.isFinite(usage?.outputTokens) ? formatExact(usage.outputTokens, language) : '—',
              value: usage?.outputTokens,
              ariaLabel: `${t('output')} ${formatExact(usage?.outputTokens ?? 0, language)}`,
            })),
            h('dt', { key: 'cache-write-label' }, t('cacheWrite')),
            h('dd', { key: 'cache-write' }, h(RollingNumber, {
              text: Number.isFinite(usage?.cacheWriteTokens) ? formatExact(usage.cacheWriteTokens, language) : '—',
              value: usage?.cacheWriteTokens,
              ariaLabel: `${t('cacheWrite')} ${formatExact(usage?.cacheWriteTokens ?? 0, language)}`,
            })),
            h('dt', { key: 'total-label' }, t('total')),
            h('dd', { key: 'total', className: 'is-total' }, h(RollingNumber, {
              text: Number.isFinite(total) ? formatExact(total, language) : '—',
              value: total,
              ariaLabel: `${t('total')} ${exactTotal}`,
            })),
            h('dt', { key: 'hit-label' }, t('cacheHitRate')),
            h('dd', { key: 'hit' }, h(RollingNumber, {
              text: cacheText,
              value: cacheHit,
              ariaLabel: `${t('cacheHitRate')} ${cacheText}`,
            })),
          ]),
          contextPercent !== null && h('div', { className: 'dsh-thud-bar', key: 'bar', title: `${t('context')} ${formatPercent(contextPercent, language)}` },
            h('span', { style: { width: `${contextPercent}%` } })),
          contextPercent !== null && h('div', { className: 'dsh-thud-section-head', key: 'context' }, [
            h('span', { className: 'dsh-thud-section-title', key: 'label' }, t('context')),
            h('span', { className: 'dsh-thud-section-value', key: 'value' }, h(RollingNumber, {
              text: `${formatTokens(contextUsed)} / ${formatTokens(contextWindow)} · ${formatPercent(contextPercent, language)}`,
              value: contextUsed,
              ariaLabel: `${t('context')} ${formatTokens(contextUsed)} / ${formatTokens(contextWindow)}`,
            })),
          ]),
        ]),
        h('div', { className: 'dsh-thud-rule', key: 'rule' }),
        h('div', { className: 'dsh-thud-account', key: 'account' }, [
          h('div', { className: 'dsh-thud-account-row is-primary', key: 'balance' }, [
            h('span', {}, t('rechargeBalance')),
            h('span', {}, h(RollingNumber, {
              text: balanceAvailable ? formatMoney(primary.normal, primary.currency, 4) : balanceText,
              value: balanceAvailable ? primary.normal : undefined,
              ariaLabel: `${t('rechargeBalance')} ${balanceText}`,
            })),
          ]),
          h('div', { className: 'dsh-thud-account-row', key: 'spent' }, [
            h('span', {}, t('todaySpend')),
            h('span', {}, h(RollingNumber, {
              text: spentText,
              value: balance.ledger?.spent,
              ariaLabel: `${t('todaySpend')} ${spentText}`,
            })),
          ]),
          h('div', { className: 'dsh-thud-account-row', key: 'bonus' }, [
            h('span', {}, t('bonusBalance')),
            h('span', {}, h(RollingNumber, {
              text: balanceAvailable && primary.bonus > 0 ? formatMoney(primary.bonus, primary.currency, 4) : '—',
              value: balanceAvailable ? primary.bonus : undefined,
              ariaLabel: `${t('bonusBalance')} ${balanceAvailable && primary.bonus > 0 ? formatMoney(primary.bonus, primary.currency, 4) : '—'}`,
            })),
          ]),
        ]),
        h('div', { className: 'dsh-thud-foot', key: 'foot' }, [
          h('span', { key: 'updated', className: balance.stale ? 'dsh-thud-stale' : undefined }, balance.stale
            ? t('stale')
            : updated === null ? '' : t('updated', { time: updated })),
          h('button', {
            key: 'refresh',
            type: 'button',
            className: 'dsh-thud-refresh',
            onClick: () => { void refresh(true); },
            disabled: refreshing,
            title: t('refresh'),
            'aria-label': t('refresh'),
          }, [h(IconRefresh, { key: 'icon', spinning: refreshing }), h('span', { key: 'text' }, refreshing ? t('refreshing') : t('refresh'))]),
        ]),
        h('div', { className: 'dsh-thud-note', key: 'note' }, t('note')),
      ]);

      return h('div', { className: 'dsh-thud-root', ref: rootRef }, [
        h('style', { key: 'css' }, CSS),
        details,
        h('section', { className: 'dsh-thud-card', key: 'card', 'aria-label': t('title') }, [
          h('button', {
            key: 'summary',
            type: 'button',
            className: 'dsh-thud-summary',
            onClick: () => setExpanded(!expanded),
            'aria-expanded': expanded,
            'aria-controls': 'dsh-token-hud-details',
            'aria-label': `${aria} ${expanded ? t('collapse') : t('expand')}`,
            title: aria,
          }, [
            h('span', {
              className: 'dsh-thud-glyph',
              key: 'glyph',
              'data-running': running ? 'true' : 'false',
              'data-live': liveActive ? 'true' : 'false',
            }, h(IconPulse, { size: 17 })),
            h('span', { className: 'dsh-thud-copy', key: 'copy' }, [
              h('span', { className: 'dsh-thud-row', key: 'top' }, [
                h(RollingNumber, {
                  key: 'tokens',
                  className: 'dsh-thud-total',
                  text: tokenText,
                  value: displayKnown ? displayTotal : undefined,
                  ariaLabel: `${t('session')} ${tokenText} ${liveActive ? t('live') : t('tokens')}`,
                  flash: !liveActive,
                }),
                h('span', { className: 'dsh-thud-unit', key: 'unit' }, liveActive ? t('live') : t('tokens')),
                h('span', { className: 'dsh-thud-spacer', key: 'spacer' }),
                h('span', { className: 'dsh-thud-balance', key: 'balance' }, [
                  h('span', { className: 'dsh-thud-balance-label', key: 'label' }, t('balance')),
                  h(RollingNumber, {
                    key: 'money',
                    className: 'dsh-thud-money',
                    text: balanceText,
                    value: balanceAvailable ? primary.normal : undefined,
                    ariaLabel: `${t('balance')} ${balanceText}`,
                  }),
                ]),
              ]),
              h('span', { className: 'dsh-thud-sub', key: 'bottom' }, [
                liveActive
                  ? h(RollingNumber, {
                    className: 'dsh-thud-live-inline',
                    key: 'live',
                    text: `+${formatTokens(liveAdded)}`,
                    value: liveAdded,
                    ariaLabel: `${t('live')} +${formatTokens(liveAdded)}`,
                    flash: false,
                  })
                  : h('span', { className: 'dsh-thud-ellipsis', key: 'session' }, sessionId ? t('session') : t('noSession')),
                h('span', { key: 'dot' }, '·'),
                h('span', { className: 'dsh-thud-spent', key: 'spent' }, [
                  `${t('todayShort')} `,
                  h(RollingNumber, {
                    key: 'spent-number',
                    text: spentText,
                    value: balance.ledger?.spent,
                    ariaLabel: `${t('todaySpend')} ${spentText}`,
                  }),
                ]),
              ]),
            ]),
            h('span', { className: 'dsh-thud-chevron', key: 'chevron' }, h(IconChevron, { expanded })),
          ]),
        ]),
      ]);
    }

    return {
      inject: ['slots', 'sessions', 'locale', 'remote', 'remote.account'],
      apply(ctx) {
        // The slot component needs the live Context; keep it on one component
        // identity instead of rebuilding React state through a module global.
        TokenHud.ctx = ctx;
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'token-hud',
          order: 20,
        }, TokenHud));
      },
    };
  },
});
