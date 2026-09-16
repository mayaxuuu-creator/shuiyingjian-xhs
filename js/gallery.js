/* 水影笺 · 长物斋（本地展品库）
   首选 IndexedDB；浏览器受限（隐私模式/内置浏览器禁用）时自动降级 localStorage（上限 8 张）。
   展墙视图：深色展墙网格 + 展签，点开看大图可再保存/发笔记/删除。数据仅存于本机设备。
   v3.8 策展：斋展固定为九宫展格；可挑选九件，也可点格替换。旧数据未上展仍可正常显示。 */

window.GALLERY = (function () {
  'use strict';

  const DB_NAME = 'syj_gallery_v1', STORE = 'works', CAP = 60, LS_CAP = 8, LS_KEY = 'syj_gallery_ls';
  const EXHIBIT_CAP = 9;
  let dbPromise = null, idbBroken = false;
  let currentFilter = 'all';

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('works', { keyPath: 'id' });
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error || new Error('IndexedDB open failed'));
      rq.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    return dbPromise;
  }

  /* ---------- 存储层：IDB 优先，失败自动落到 localStorage ---------- */
  async function put(work) {
    if (!idbBroken) {
      try {
        const db = await open();
        await new Promise((res, rej) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(work);
          tx.oncomplete = res; tx.onerror = () => rej(tx.error || new Error('IDB put failed')); tx.onabort = () => rej(tx.error || new Error('IDB aborted'));
        });
        return 'idb';
      } catch (e) {
        idbBroken = true;   // 本会话内不再尝试 IDB
      }
    }
    // localStorage 兜底（容量小，限 8 张）
    const list = lsAll();
    const idx = list.findIndex(w => w.id === work.id);
    if (idx >= 0) list[idx] = work; else list.unshift(work);
    while (list.length > LS_CAP) list.pop();
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (e) {
      throw new Error('本地存储已满');
    }
    return 'ls';
  }

  function lsAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }

  async function all() {
    if (!idbBroken) {
      try {
        const db = await open();
        return await new Promise((res, rej) => {
          const rq = db.transaction(STORE).objectStore(STORE).getAll();
          rq.onsuccess = () => res((rq.result || []).sort((a, b) => b.ts - a.ts));
          rq.onerror = () => rej(rq.error || new Error('IDB read failed'));
        });
      } catch (e) {
        idbBroken = true;
      }
    }
    return lsAll().sort((a, b) => b.ts - a.ts);
  }

  async function remove(id) {
    if (!idbBroken) {
      try {
        const db = await open();
        return await new Promise((res, rej) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
      } catch (e) { /* 落到 LS 删除 */ }
    }
    localStorage.setItem(LS_KEY, JSON.stringify(lsAll().filter(w => w.id !== id)));
  }

  async function add(work) {
    const store = await put(work);
    if (store === 'idb') {
      const list = await all();
      if (list.length > CAP) for (const w of list.slice(CAP)) await remove(w.id);
    }
    return store;
  }

  function exhibitSlot(work) {
    return Number.isInteger(work && work.slot) && work.slot >= 0 && work.slot < EXHIBIT_CAP ? work.slot : null;
  }

  /* 兼容旧数据：已上展但无格位的长物，按时间补入空格；不在这里批量改库。 */
  function arrangeExhibits(works) {
    const slots = Array(EXHIBIT_CAP).fill(null);
    const queued = works.filter(w => w.featured).sort((a, b) => {
      const as = exhibitSlot(a), bs = exhibitSlot(b);
      if (as !== null && bs !== null) return as - bs;
      if (as !== null) return -1;
      if (bs !== null) return 1;
      return b.ts - a.ts;
    });
    queued.forEach(work => {
      const named = exhibitSlot(work);
      if (named !== null && !slots[named]) {
        slots[named] = work;
      } else {
        const next = slots.findIndex(item => !item);
        if (next >= 0) slots[next] = work;
      }
    });
    return slots;
  }

  async function setFeatured(id, featured) {
    const works = await all();
    const work = works.find(w => String(w.id) === String(id));
    if (!work) return false;
    if (!featured) {
      work.featured = false;
      work.slot = null;
      await put(work);
      return true;
    }
    if (work.featured) return true;
    const emptySlot = arrangeExhibits(works).findIndex(item => !item);
    if (emptySlot < 0) return false;
    work.featured = true;
    work.slot = emptySlot;
    await put(work);
    return true;
  }

  async function setSlot(id, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= EXHIBIT_CAP) return false;
    const works = await all();
    const work = works.find(w => String(w.id) === String(id));
    if (!work) return false;
    const occupant = works.find(item => item.featured && exhibitSlot(item) === slot);
    if (occupant && String(occupant.id) === String(id)) return true;
    if (occupant) {
      occupant.featured = false;
      occupant.slot = null;
      await put(occupant);
    }
    work.featured = true;
    work.slot = slot;
    await put(work);
    return true;
  }

  /* ---------- 展墙视图 ---------- */
  let view = null;
  let onSave = null, onPost = null;   // 由 main.js 注入（桥接保存/发笔记）
  const SECTIONS = [
    { key: 'featured', title: '斋 展', note: '上展长物' },
    { key: 'sheet', title: '笺 架', note: '纸上长物' },
    { key: 'fan', title: '扇 架', note: '团扇' },
    { key: 'bookmark', title: '签 架', note: '书签' },
  ];

  function ensureView() {
    if (view) return;
    view = document.createElement('div');
    view.id = 'galleryView';
    view.innerHTML =
      '<div class="gv-head"><span class="gv-title">长 物 斋</span><span class="gv-count"></span>' +
      '<button class="gv-close">返回</button></div>' +
      '<div class="gv-curation">' +
        '<div class="gv-tabs">' +
          '<button class="gv-tab active" data-filter="all">全 部</button>' +
          '<button class="gv-tab" data-filter="featured">斋 展</button>' +
        '</div>' +
        '<span class="gv-note">斋展最多九件</span>' +
      '</div>' +
      '<div class="gv-grid"></div>' +
      '<div class="gv-detail hidden"></div>';
    document.body.appendChild(view);
    view.querySelector('.gv-close').addEventListener('click', hide);
    view.querySelector('.gv-tabs').addEventListener('click', event => {
      const btn = event.target.closest('.gv-tab');
      if (!btn) return;
      currentFilter = btn.dataset.filter;
      render();
    });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function cardHTML(w, slot) {
    const carrier = w.carrier || 'sheet';
    const badge = slot === undefined ? (w.featured ? '斋展' : '') : '第 ' + (slot + 1) + ' 格';
    return '<div class="gv-card carrier-' + carrier + '" data-id="' + w.id + '">' +
      '<div class="gv-frame"><img src="' + w.dataUrl + '" alt=""></div>' +
      (badge ? '<span class="gv-badge">' + badge + '</span>' : '') +
      '<div class="gv-tag">第 ' + w.number + ' 号 · ' + esc(w.mind) + '</div>' +
      '<i class="gv-shelf"></i></div>';
  }

  function exhibitHTML(slots) {
    const count = slots.filter(Boolean).length;
    return '<section class="gv-section carrier-featured">' +
      '<div class="gv-cabinet">' +
        '<header class="gv-section-head"><h2>斋 展</h2><span>' + count + ' / 9 · 挑选九件</span></header>' +
        '<div class="gv-grid exhibit-grid">' +
          slots.map((work, slot) => work
            ? '<div class="gv-slot">' + cardHTML(work, slot) + '</div>'
            : '<div class="gv-slot empty"><span>空 格</span><i class="gv-shelf"></i></div>'
          ).join('') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function sectionHTML(key, title, note, works) {
    return '<section class="gv-section carrier-' + key + '">' +
      '<header class="gv-section-head"><h2>' + title + '</h2><span>' + works.length + ' 件 · ' + note + '</span></header>' +
      '<div class="gv-grid rack-grid">' + works.map(cardHTML).join('') + '</div>' +
      '</section>';
  }

  async function render() {
    const works = await all();
    const slots = arrangeExhibits(works);
    const stored = works.filter(w => !w.featured);
    view.querySelectorAll('.gv-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === currentFilter));
    view.querySelector('.gv-count').textContent = works.length ? works.length + ' 件' : '';
    const grid = view.querySelector('.gv-grid');
    const detail = view.querySelector('.gv-detail');
    detail.classList.add('hidden');

    let html = exhibitHTML(slots);
    if (currentFilter === 'all') {
      const byCarrier = {
        sheet: stored.filter(w => (w.carrier || 'sheet') === 'sheet'),
        fan: stored.filter(w => (w.carrier || 'sheet') === 'fan'),
        bookmark: stored.filter(w => (w.carrier || 'sheet') === 'bookmark'),
      };
      SECTIONS.slice(1).forEach(section => {
        const items = byCarrier[section.key];
        if (items.length) html += sectionHTML(section.key, section.title, section.note, items);
      });
      if (!works.length) html += '<div class="gv-empty">库房尚空<br>拓一张喜欢的，收入斋中吧</div>';
      if (works.length && !stored.length) html += '<div class="gv-empty">九格之外暂无库藏</div>';
    }
    grid.innerHTML = html;
    grid.classList.remove('hidden');
    grid.querySelectorAll('.gv-card').forEach(card => {
      const find = works;
      card.addEventListener('click', () => showDetail(find.find(w => String(w.id) === card.dataset.id)));
    });
  }

  function showDetail(w) {
    const detail = view.querySelector('.gv-detail');
    const grid = view.querySelector('.gv-grid');
    grid.classList.add('hidden');
    detail.classList.remove('hidden');
    detail.innerHTML =
      '<img class="gv-big" src="' + w.dataUrl + '" alt="">' +
      '<div class="gv-dtag">' + esc(w.theme || '流沙笺') + ' · 第 ' + w.number + ' 号 · 心相「' + esc(w.mind) + '」' +
      (w.featured ? '<br>斋展 · 第 ' + (exhibitSlot(w) === null ? '—' : exhibitSlot(w) + 1) + ' 格' : '') +
      (w.carrierLabel && w.carrierLabel !== '笺' ? '<br>成器 · ' + esc(w.carrierLabel) : '') +
      (w.material ? '<br>辅料 · ' + esc(w.material) : '') +
      '<br>' + esc(w.poem || '') + '</div>' +
      '<div class="gv-slotpicker"><span>展格</span><div>' +
        Array.from({ length: EXHIBIT_CAP }, (_, slot) =>
          '<button class="tool-btn small' + (w.featured && exhibitSlot(w) === slot ? ' active' : '') +
          '" data-slot="' + slot + '">' + (slot + 1) + '</button>').join('') +
      '</div></div>' +
      '<div class="gv-actions">' +
      '<button class="tool-btn small" data-act="save">保存图片</button>' +
      '<button class="tool-btn small" data-act="post">发笔记</button>' +
      '<button class="tool-btn small" data-act="feature">' + (w.featured ? '撤出斋展' : '入斋展') + '</button>' +
      '<button class="tool-btn small ghost" data-act="del">删除</button>' +
      '</div>';
    detail.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'save' && onSave) await onSave(w.dataUrl, w.number);
        if (act === 'post' && onPost) onPost(w);
        if (act === 'feature') {
          const ok = await setFeatured(w.id, !w.featured);
          if (!ok) { btn.textContent = '选格替换'; return; }
          await render();
        }
        if (act === 'del') { await remove(w.id); await render(); }
      });
    });
    detail.querySelectorAll('[data-slot]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await setSlot(w.id, Number(btn.dataset.slot));
        await render();
      });
    });
  }

  function show() { ensureView(); render(); view.classList.add('show'); }
  function hide() { if (view) view.classList.remove('show'); }

  return { add, all, remove, setFeatured, setSlot, show, hide, setHandlers: (o) => { onSave = o.save; onPost = o.post; } };
})();
