/**
 * liff-common.js — 場主 LIFF 頁面的共用函式
 * 需先載入 LIFF SDK：https://static.line-scdn.net/liff/edge/2/sdk.js
 */
(function () {
  'use strict';

  /** v2.3：SDK 改為非同步載入，用到時才等它 */
  function sdkReady() {
    if (window.liff) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const el = document.getElementById('liffSdk');
      if (!el) return reject(new Error('找不到 LIFF SDK'));
      el.addEventListener('load', function () { resolve(); });
      el.addEventListener('error', function () { reject(Object.assign(new Error('LINE 元件載入失敗，請檢查網路後重新開啟'), { code: 'NETWORK' })); });
      if (window.liff) resolve();
    });
  }

  /**
   * v3.14：上次的身分憑證（ID Token）還有效 → 不等 LINE 登入就先送請求（比照學員／教練 OA）
   *   ・存在手機：{ token, exp, sub }；至少還有 5 分鐘才用；從選單第一次載入（網址帶 liff.state，會轉址）不用
   *   ・伺服器不接受（過期、換帳號）→ 等 LINE 給新的憑證再送一次
   *   ・LINE 登入完成後發現換了帳號 → 清掉手機上的資料重新開啟（不顯示別人的畫面）
   */
  const TOKEN_KEY = 'venue.tok.v1';
  let early = '';      // 這次開啟先用的舊憑證
  let liffOk = false;  // LINE 登入完成（之後一律用新的憑證）
  let initP = null;
  let onSwitch = null; // 換帳號時要做的事（清掉上次的畫面）
  const meta = { ms: null, perf: 0 }; // 最近一次請求：伺服器處理毫秒數、要不要回報開啟計時

  function readTok() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch (e) { return null; }
  }
  function dropTok() {
    early = '';
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* 略過 */ }
  }
  function earlyToken() {
    try {
      if (new URLSearchParams(location.search).has('liff.state')) return '';
      const t = readTok();
      early = t && t.token && t.exp - Date.now() > 5 * 60000 ? t.token : '';
    } catch (e) { early = ''; }
    return early;
  }
  function token() {
    return liffOk ? liff.getIDToken() : early;
  }

  function init(liffId, opt) {
    if (opt && opt.onSwitch) onSwitch = opt.onSwitch;
    if (!initP) initP = doInit(liffId);
    return initP;
  }
  async function doInit(liffId) {
    if (!liffId) throw new Error('尚未設定 LIFF_ID');
    await sdkReady();
    await liff.init({ liffId: liffId });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href });
      return new Promise(function () {}); // 等待跳轉
    }
    // v3.14：記下新的憑證，下次開啟可以先用
    try {
      const d = liff.getDecodedIDToken() || {};
      const old = readTok();
      const tok = liff.getIDToken();
      if (tok && d.sub && d.exp) localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: tok, exp: d.exp * 1000, sub: d.sub }));
      if (early && old && old.sub && d.sub && old.sub !== d.sub) {
        if (onSwitch) onSwitch();
        location.reload();
        return new Promise(function () {}); // 等待重新開啟
      }
    } catch (e) { /* 手機不能存時略過 */ }
    liffOk = true;
    early = '';
    return liff;
  }

  /** 讀網址參數；同時處理 liff.line.me/{id}?page=x 轉址時包在 liff.state 裡的參數 */
  function params() {
    const p = new URLSearchParams(location.search);
    const state = p.get('liff.state');
    if (state) {
      const q = state.indexOf('?');
      if (q >= 0) new URLSearchParams(state.slice(q + 1)).forEach(function (v, k) { p.set(k, v); });
    }
    return p;
  }

  /** 呼叫 GAS；text/plain 可避免瀏覽器先送 OPTIONS 預檢（GAS 不支援） */
  async function call(gasUrl, action, data) {
    const usedEarly = !liffOk && !!early; // v3.14
    try {
      return await callOnce(gasUrl, action, data);
    } catch (e) {
      // 先用的舊憑證被拒（過期、換帳號）→ 等 LINE 給新的再送一次
      if (!usedEarly || !e || !/^AUTH_/.test(e.code || '')) throw e;
      dropTok();
      await initP;
      return callOnce(gasUrl, action, data);
    }
  }

  async function callOnce(gasUrl, action, data) {
    if (!liffOk && !early) await initP; // v3.14：沒有可用的舊憑證就等 LINE 登入
    const idToken = token();
    let res;
    // v2.4：25 秒逾時（原本沒有上限，網路卡住時畫面會一直轉圈）
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;
    try {
      res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, idToken: idToken, data: data || {} }),
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw Object.assign(new Error('連線逾時，請確認網路後再試一次'), { code: 'TIMEOUT' });
      throw Object.assign(new Error('網路連線失敗，請稍後再試'), { code: 'NETWORK' });
    } finally {
      if (timer) clearTimeout(timer);
    }
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw Object.assign(new Error('伺服器回應格式錯誤'), { code: 'BAD_RESPONSE' });
    }
    if (!json.ok) throw Object.assign(new Error(json.message || '發生錯誤'), { code: json.code });
    meta.ms = typeof json.ms === 'number' ? json.ms : null; // v3.14：開啟計時用
    if (json.perf !== undefined) meta.perf = json.perf ? 1 : 0;
    return json.data;
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  let toastTimer;
  function toast(msg, type) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 2600);
  }

  function money(n) {
    return 'NT$' + Number(n || 0).toLocaleString('zh-TW');
  }

  window.LiffKit = { init: init, params: params, call: call, esc: esc, toast: toast, money: money, earlyToken: earlyToken, token: token, meta: meta };
})();
