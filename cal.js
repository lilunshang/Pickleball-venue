/**
 * MonthCal：月曆＋地區／據點篩選＋依日期清單（教練 OA 我的課表、場主 OA 我的排班共用）v2（2026/11/1：清單分「未結束／已結束」可收合）
 * MonthCal.render(box, {
 *   month: 'yyyy-MM', today: 'yyyy-MM-dd',
 *   items: [{ date:'yyyy-MM-dd', venueId, venue, region, ... }],   // 已依時間排序
 *   state: { region, venue, day },                                 // 篩選狀態（呼叫端保存，切月份也保留地區／據點）
 *   unit: '堂', itemNode: (it) => Node, onMonth: (month) => {}, emptyText: '這個月沒有排課',
 *   isEnded: (it) => bool（選填；預設：日期在今天以前，或今天且結束時間已過）
 * })
 */
var MonthCal = (function () {
  'use strict';
  var WD = ['一', '二', '三', '四', '五', '六', '日'];
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'onclick') e.addEventListener('click', v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function shiftMonth(m, d) {
    var y = +m.slice(0, 4);
    var mo = +m.slice(5, 7) - 1 + d;
    y += Math.floor(mo / 12);
    mo = ((mo % 12) + 12) % 12;
    return y + '-' + pad(mo + 1);
  }
  function dateLabel(key) {
    var p = key.split('-');
    var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    return (+p[1]) + '/' + (+p[2]) + '（' + '日一二三四五六'.charAt(dt.getDay()) + '）';
  }
  function regionOf(it) { return it.region || '其他地區'; }

  function render(box, opt) {
    var st = opt.state || (opt.state = {});
    var unit = opt.unit || '筆';
    var all = opt.items || [];
    var again = function () { render(box, opt); };
    box.innerHTML = '';
    box.classList.add('mc');

    var regions = [];
    all.forEach(function (it) { var r = regionOf(it); if (regions.indexOf(r) < 0) regions.push(r); });
    if (st.region && regions.indexOf(st.region) < 0) st.region = '';
    var venues = [];
    all.forEach(function (it) {
      if (st.region && regionOf(it) !== st.region) return;
      if (it.venueId && !venues.some(function (v) { return v.id === it.venueId; })) venues.push({ id: it.venueId, name: it.venue || '（未設定據點）' });
    });
    if (st.venue && !venues.some(function (v) { return v.id === st.venue; })) st.venue = '';
    var shown = all.filter(function (it) { return (!st.region || regionOf(it) === st.region) && (!st.venue || it.venueId === st.venue); });
    if (st.day && st.day.slice(0, 7) !== opt.month) st.day = '';

    // 月份
    var y = +opt.month.slice(0, 4);
    var m = +opt.month.slice(5, 7);
    box.appendChild(h('div', { class: 'mc-bar' }, [
      h('button', { type: 'button', class: 'mc-nav', 'aria-label': '上個月', text: '‹', onclick: function () { opt.onMonth(shiftMonth(opt.month, -1)); } }),
      h('div', { class: 'mc-title' }, [h('b', { text: y + ' 年 ' + m + ' 月' }), h('span', { text: '共 ' + shown.length + ' ' + unit })]),
      h('button', { type: 'button', class: 'mc-nav', 'aria-label': '下個月', text: '›', onclick: function () { opt.onMonth(shiftMonth(opt.month, 1)); } }),
    ]));
    if (opt.today && opt.today.slice(0, 7) !== opt.month) {
      box.appendChild(h('button', { type: 'button', class: 'mc-link', text: '回到本月', onclick: function () { opt.onMonth(opt.today.slice(0, 7)); } }));
    }

    // 地區 → 據點
    var chipRow = function (label, list, cur, set) {
      if (list.length < 2) return;
      var row = h('div', { class: 'mc-chips' }, [h('span', { class: 'mc-lab', text: label })]);
      [{ id: '', name: '全部' }].concat(list).forEach(function (o) {
        row.appendChild(h('button', { type: 'button', class: 'mc-chip' + (cur === o.id ? ' on' : ''), text: o.name, onclick: function () { set(o.id); st.day = ''; again(); } }));
      });
      box.appendChild(row);
    };
    chipRow('地區', regions.map(function (r) { return { id: r, name: r }; }), st.region || '', function (v) { st.region = v; st.venue = ''; });
    chipRow('據點', venues, st.venue || '', function (v) { st.venue = v; });

    // 月曆
    var count = {};
    shown.forEach(function (it) { count[it.date] = (count[it.date] || 0) + 1; });
    var grid = h('div', { class: 'mc-grid' });
    WD.forEach(function (w, i) { grid.appendChild(h('div', { class: 'mc-wd' + (i >= 5 ? ' we' : ''), text: w })); });
    var lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    var days = new Date(y, m, 0).getDate();
    for (var i = 0; i < lead; i++) grid.appendChild(h('div', { class: 'mc-d blank' }));
    for (var d = 1; d <= days; d++) {
      (function (key, n) {
        var cls = 'mc-d' + (n ? ' has' : '') + (key === opt.today ? ' today' : '') + (key === st.day ? ' sel' : '') + (key < (opt.today || '') ? ' past' : '');
        grid.appendChild(h('button', { type: 'button', class: cls, disabled: !n, 'aria-label': dateLabel(key) + (n ? ' ' + n + ' ' + unit : ''),
          onclick: function () { st.day = st.day === key ? '' : key; again(); } }, [
          h('span', { class: 'n', text: String(+key.slice(8)) }),
          n ? h('span', { class: 'c', text: String(n) }) : null,
        ]));
      })(opt.month + '-' + pad(d), count[opt.month + '-' + pad(d)] || 0);
    }
    box.appendChild(grid);

    // 清單：v2 依「未結束／已結束」分組，各組可收合（預設未結束展開、已結束收起）
    var list = st.day ? shown.filter(function (it) { return it.date === st.day; }) : shown;
    var wrap = h('div', { class: 'mc-list' });
    if (st.day) wrap.appendChild(h('button', { type: 'button', class: 'mc-link', text: '‹ 顯示整個月', onclick: function () { st.day = ''; again(); } }));
    if (!list.length) wrap.appendChild(h('div', { class: 'mc-empty', text: opt.emptyText || '這個月沒有資料' }));
    var nowHM = opt.nowTime || nowHHMM();
    var isEnded = opt.isEnded || function (it) {
      if (!opt.today) return false;
      if (it.date !== opt.today) return it.date < opt.today;
      var e = it.end || it.start || '';
      return !!e && e <= nowHM;
    };
    if (!st.open) st.open = { up: true, done: false };
    var groups = [
      { key: 'up', label: '未結束', items: list.filter(function (it) { return !isEnded(it); }) },
      { key: 'done', label: '已結束', items: list.filter(isEnded) },
    ];
    groups.forEach(function (g) {
      if (!g.items.length) return;
      var open = !!st.open[g.key];
      wrap.appendChild(h('button', { type: 'button', class: 'mc-sec' + (open ? ' open' : '') + ' ' + g.key, 'aria-expanded': open ? 'true' : 'false',
        onclick: function () { st.open[g.key] = !open; again(); } }, [
        h('span', { class: 'car', text: open ? '▾' : '▸' }),
        h('span', { text: g.label }),
        h('span', { class: 'cnt', text: g.items.length + ' ' + unit }),
      ]));
      if (!open) return;
      var cur = '';
      g.items.forEach(function (it) {
        if (it.date !== cur) {
          cur = it.date;
          wrap.appendChild(h('div', { class: 'mc-day' + (cur === opt.today ? ' today' : '') }, [dateLabel(cur), cur === opt.today ? h('span', { class: 'mc-tag', text: '今天' }) : null]));
        }
        wrap.appendChild(opt.itemNode(it));
      });
    });
    box.appendChild(wrap);
  }
  function nowHHMM() {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    var o = {};
    p.forEach(function (x) { o[x.type] = x.value; });
    return (o.hour === '24' ? '00' : o.hour) + ':' + o.minute;
  }
  function thisMonth() {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    var o = {};
    p.forEach(function (x) { o[x.type] = x.value; });
    return o.year + '-' + o.month;
  }
  return { render: render, shiftMonth: shiftMonth, thisMonth: thisMonth, dateLabel: dateLabel };
})();
