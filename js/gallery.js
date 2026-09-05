/* 水影笺 · 陈列室（本地作品库）
   首选 IndexedDB；浏览器受限（隐私模式/内置浏览器禁用）时自动降级 localStorage（上限 8 张）。
   展墙视图：深色展墙网格 + 展签，点开看大图可再保存/发笔记/删除。数据仅存于本机设备。 */

window.GALLERY = (function () {
  'use strict';

  const DB_NAME = 'syj_gallery_v1', STORE = 'works', CAP = 60, LS_CAP = 8, LS_KEY = 'syj_gallery_ls';
  let dbPromise = null, idbBroken = false;

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

  /* ---------- 展墙视图 ---------- */
  let view = null;
  let onSave = null, onPost = null;   // 由 main.js 注入（桥接保存/发笔记）

  function ensureView() {
    if (view) return;
    view = document.createElement('div');
    view.id = 'galleryView';
    view.innerHTML =
      '<div class="gv-head"><span class="gv-title">陈 列 室</span><span class="gv-count"></span>' +
      '<button class="gv-close">返回</button></div>' +
      '<div class="gv-grid"></div>' +
      '<div class="gv-detail hidden"></div>';
    document.body.appendChild(view);
    view.querySelector('.gv-close').addEventListener('click', hide);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function cardHTML(w) {
    return '<div class="gv-card" data-id="' + w.id + '">' +
      '<img src="' + w.dataUrl + '" alt="">' +
      '<div class="gv-tag">第 ' + w.number + ' 号 · ' + esc(w.mind) + '</div></div>';
  }

  async function render() {
    const works = await all();
    view.querySelector('.gv-count').textContent = works.length ? works.length + ' 件' : '';
    const grid = view.querySelector('.gv-grid');
    const detail = view.querySelector('.gv-detail');
    detail.classList.add('hidden');
    grid.classList.remove('hidden');
    grid.innerHTML = works.length
      ? works.map(cardHTML).join('')
      : '<div class="gv-empty">还没有收藏的笺<br>拓一张喜欢的，收入陈列室吧</div>';
    grid.querySelectorAll('.gv-card').forEach(card => {
      card.addEventListener('click', () => showDetail(works.find(w => String(w.id) === card.dataset.id)));
    });
  }

  function showDetail(w) {
    const detail = view.querySelector('.gv-detail');
    const grid = view.querySelector('.gv-grid');
    grid.classList.add('hidden');
    detail.classList.remove('hidden');
    detail.innerHTML =
      '<img class="gv-big" src="' + w.dataUrl + '" alt="">' +
      '<div class="gv-dtag">流沙笺 · 第 ' + w.number + ' 号 · 心相「' + esc(w.mind) + '」<br>' + esc(w.poem || '') + '</div>' +
      '<div class="gv-actions">' +
      '<button class="tool-btn small" data-act="save">保存图片</button>' +
      '<button class="tool-btn small" data-act="post">发笔记</button>' +
      '<button class="tool-btn small ghost" data-act="del">删除</button>' +
      '</div>';
    detail.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'save' && onSave) await onSave(w.dataUrl, w.number);
        if (act === 'post' && onPost) onPost(w);
        if (act === 'del') { await remove(w.id); await render(); }
      });
    });
  }

  function show() { ensureView(); render(); view.classList.add('show'); }
  function hide() { if (view) view.classList.remove('show'); }

  return { add, all, remove, show, hide, setHandlers: (o) => { onSave = o.save; onPost = o.post; } };
})();
