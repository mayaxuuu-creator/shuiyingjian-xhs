/* 水影笺 · 陈列室（本地作品库）
   IndexedDB 存 JPEG dataURL（省空间，可存数十张，上限 60 张 FIFO）；
   展墙视图：深色展墙网格 + 展签，点开看大图可再保存/发笔记/删除。
   数据仅存于本机设备。 */

window.GALLERY = (function () {
  'use strict';

  const DB_NAME = 'syj_gallery_v1', STORE = 'works', CAP = 60;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('works', { keyPath: 'id' });
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    return dbPromise;
  }

  async function add(work) {
    const db = await open();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(work);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    // FIFO 裁剪
    const all = await all();
    if (all.length > CAP) {
      const oldest = all.slice(CAP).map(w => w.id);
      for (const id of oldest) await remove(id);
    }
  }

  async function all() {
    const db = await open();
    return new Promise((res, rej) => {
      const rq = db.transaction(STORE).objectStore(STORE).getAll();
      rq.onsuccess = () => res((rq.result || []).sort((a, b) => b.ts - a.ts));
      rq.onerror = () => rej(rq.error);
    });
  }

  async function remove(id) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }

  /* ---------- 展墙视图 ---------- */
  let view = null, detailId = null;
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
    detailId = w.id;
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
