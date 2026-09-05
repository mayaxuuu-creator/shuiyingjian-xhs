/* 水影笺 · 小红书小工具版 主流程（v2.0）
   玩法：滴墨/吹墨/按住渗墨 → 纹样保底（选中色主调+随机辅色）
   → 覆纸拓印（成笺/素笺）→ 心相读墨+配诗 → 保存相册 / 发笔记 / 收入陈列室 */

(function () {
  'use strict';

  const state = {
    palette: PALETTES.qinglv,
    colorIndex: PALETTES.qinglv.defaultIndex,
    number: 0,
    mind: null,
    poem: null,
    share: null,
    pure: false,          // 素笺模式（无题签/心相签/编号）
    lastPixels: null,     // 拓印像素缓存（成笺/素笺切换复用）
    sealName: localStorage.getItem('syj_seal_name') || '',
  };

  const $ = s => document.querySelector(s);
  const paletteBox = $('#palette');
  const hint = $('#hint');
  const overlay = $('#printOverlay');
  const paperCanvas = $('#paperCanvas');
  const resultBar = $('#resultBar');
  const caption = $('#sheetCaption');
  const shareCard = $('#shareCard');
  const toast = $('#toast');
  let toastTimer = null;

  // ---------- 墨盘 ----------
  function cssColor(rgb, boost) {
    const b = boost || 1.0;
    const f = v => Math.round(Math.min(1, v * b) * 255);
    return `rgb(${f(rgb[0])}, ${f(rgb[1])}, ${f(rgb[2])})`;
  }
  function currentInk() {
    return state.palette.colors[state.colorIndex];
  }
  function buildPalette() {
    paletteBox.innerHTML = '';
    state.palette.colors.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'swatch' + (i === state.colorIndex ? ' active' : '');
      btn.title = c.name;
      btn.style.background = cssColor(c.rgb, 1.25);
      btn.addEventListener('click', () => {
        state.colorIndex = i;
        paletteBox.querySelectorAll('.swatch').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        FLUID.setInk(c.rgb, c.gain);
      });
      paletteBox.appendChild(btn);
    });
    const cur = currentInk();
    FLUID.setInk(cur.rgb, cur.gain);
  }

  function setTheme(palette) {
    state.palette = palette;
    state.colorIndex = palette.defaultIndex;
    FLUID.setTheme(palette);
    FLUID.paperForPrint = palette.paper;
    buildPalette();
    document.body.classList.toggle('theme-shui', palette.key === 'shui');
    document.body.classList.toggle('theme-zhongqiu', palette.key === 'zhongqiu');
  }

  $('#themeSwitch').addEventListener('click', e => {
    const btn = e.target.closest('.theme-tab');
    if (!btn) return;
    document.querySelectorAll('.theme-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setTheme(PALETTES[btn.dataset.theme]);
  });

  // ---------- 纹样 / 清池 ----------
  document.querySelectorAll('[data-pattern]').forEach(btn => {
    btn.addEventListener('click', () => {
      FLUID.queue(PATTERNS.make(btn.dataset.pattern, state.palette, currentInk()));
      dismissHint();
    });
  });
  $('#clearBtn').addEventListener('click', () => FLUID.clear());

  // ---------- 覆纸拓印 + 心相读墨 ----------
  $('#printBtn').addEventListener('click', () => {
    state.number = 1000 + Math.floor(Math.random() * 9000);
    FLUID.pause();
    const pixels = FLUID.getPixels();
    state.lastPixels = pixels;
    const features = MIND.analyze(pixels);
    state.mind = MIND.readMind(features, state.palette.key);
    // 心相配诗：月夜磁青优先带「月」的句子
    const hue = state.palette.key === 'shui' ? 'neutral' : features.hue;
    state.poem = MIND.pickPoem(hue, { moon: state.palette.material === 'ciqing' });
    renderSheet();
    caption.textContent = '第 ' + state.number + ' 号 · 心相「' + state.mind.name + '」';
    renderShare();
    resultBar.classList.add('hidden');
    shareCard.classList.add('hidden');
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;   // 强制 reflow，保证过渡动画必触发（不依赖 rAF 存活）
    overlay.classList.add('show');
    setTimeout(() => { resultBar.classList.remove('hidden'); shareCard.classList.remove('hidden'); }, 1250);
  });

  // ---------- 成笺 / 素笺渲染 ----------
  function renderSheet() {
    const sheet = RUBBING.create({
      pixels: state.lastPixels,
      number: state.number,
      mind: state.mind,
      poem: state.poem,
      pure: state.pure,
      sealName: state.sealName,
      material: state.palette.material,
    });
    paperCanvas.width = RUBBING.W;
    paperCanvas.height = RUBBING.H;
    paperCanvas.getContext('2d').drawImage(sheet, 0, 0);
  }

  document.querySelectorAll('#modeSeg button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.lastPixels) return;
      state.pure = btn.dataset.mode === 'pure';
      document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('active', b === btn));
      renderSheet();
      caption.textContent = '第 ' + state.number + ' 号' +
        (state.pure ? ' · 素笺' : ' · 心相「' + state.mind.name + '」');
    });
  });

  $('#againBtn').addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 420);
    FLUID.resume();
  });

  // ---------- 保存（容器 JSBridge 相册直存 / 网页下载兜底） ----------
  $('#saveBtn').addEventListener('click', () => {
    saveDataUrl(paperCanvas.toDataURL('image/png'), state.number, true);
  });

  async function saveDataUrl(dataUrl, num, inContainer) {
    const bridge = window.xhs && window.xhs.miniTool;
    if (inContainer && bridge && typeof bridge.saveImageToPhotosAlbum === 'function') {
      try {
        await bridge.saveImageToPhotosAlbum({ filePath: dataUrl });
        showToast('已保存到相册 ✓');
      } catch (err) {
        showToast('保存未完成 · 请截图保存');
      }
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = '水影笺_' + num + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('已保存 ✓');
  }

  // ---------- 分享文案 ----------
  function renderShare() {
    state.share = MIND.shareCopy(state.number, state.mind, state.poem);
    $('#shareTitle').textContent = state.share.title;
    $('#shareBody').textContent = state.share.body;
    $('#shareTags').textContent = state.share.tags;
  }
  $('#shareShuffle').addEventListener('click', renderShare);

  // ---------- 发笔记（容器桥接 postNote） ----------
  $('#postBtn').addEventListener('click', () => postNoteDraft(
    paperCanvas.toDataURL('image/png'),
    state.share && { title: state.share.title, body: state.share.body, tags: state.share.tags }
  ));

  async function postNoteDraft(dataUrl, share) {
    const bridge = window.xhs && window.xhs.miniTool;
    if (!(bridge && typeof bridge.postNote === 'function')) {
      showToast('在小红书内打开即可一键发笔记');
      return;
    }
    try {
      await bridge.postNote({
        title: (share.title).slice(0, 20),          // 上限 20 字，已含「水影笺」
        content: share.body + '\n\n' + share.tags,
        pageType: 'photo_publish',
        mediaInfo: { image_resources: [{ url: dataUrl }] },
      });
      showToast('已调起发布 · 配图文案已带好 ✓');
    } catch (err) {
      showToast('发布未完成 · 可长按复制文案');
    }
  }

  // ---------- 署名印 ----------
  function sealLabel() {
    return state.sealName ? state.sealName + (state.sealName.length === 1 ? '印' : state.sealName.length === 2 ? '之印' : '印') : '水影笺印';
  }
  function refreshSealLabel() {
    $('#sealLabel').textContent = sealLabel();
  }
  $('#sealEdit').addEventListener('click', () => {
    $('#sealInput').value = state.sealName;
    $('#sealModal').classList.remove('hidden');
  });
  $('#sealCancel').addEventListener('click', () => $('#sealModal').classList.add('hidden'));
  $('#sealSave').addEventListener('click', () => {
    const raw = $('#sealInput').value.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, 3);
    state.sealName = raw;
    localStorage.setItem('syj_seal_name', raw);
    refreshSealLabel();
    if (state.lastPixels) renderSheet();   // 立即重拓当前笺的印
    $('#sealModal').classList.add('hidden');
    showToast(raw ? '署名印已刻 ✓' : '已恢复水影笺印');
  });

  // ---------- 陈列室 ----------
  $('#galleryBtn').addEventListener('click', () => GALLERY.show());
  GALLERY.setHandlers({
    async save(dataUrl, num) { await saveDataUrl(dataUrl, num, !!(window.xhs && window.xhs.miniTool)); },
    post(work) {
      const dataUrl = work.dataUrl;
      postNoteDraft(dataUrl, {
        title: ('水影笺 · 第' + work.number + '号「' + work.mind + '」').slice(0, 20),
        body: '流沙笺 第 ' + work.number + ' 号 · 心相「' + work.mind + '」\n' + (work.poem || ''),
        tags: '#水影笺 #国风 #非遗',
      });
    },
  });

  $('#collectBtn').addEventListener('click', () => {
    if (!state.lastPixels) return;
    GALLERY.add({
      id: 'w' + Date.now(),
      number: state.number,
      mind: state.mind ? state.mind.name : '',
      poem: state.poem ? state.poem.text : '',
      theme: state.palette.label,
      ts: Date.now(),
      dataUrl: paperCanvas.toDataURL('image/jpeg', 0.86),
    }).then(store => showToast(store === 'ls' ? '已收入陈列室 ✓（本机轻量存储）' : '已收入陈列室 ✓'))
      .catch(err => showToast('收藏失败 · ' + (err && err.message ? err.message.slice(0, 24) : '请稍后再试')));
  });

  // ---------- 轻提示 ----------
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // ---------- 引导 ----------
  let hintDone = false;
  function dismissHint() {
    if (hintDone) return;
    hintDone = true;
    hint.classList.add('hide');
  }
  document.addEventListener('pool-touch', dismissHint);
  setTimeout(dismissHint, 7000);

  // ---------- 启动 ----------
  setTheme(PALETTES.qinglv);
  refreshSealLabel();

  // URL 演示钩子：?demo=shui-xuan-print / ?demo=qinglv-c2-lang-print / ?demo=shui-rank
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) {
    const themeKey = demo.includes('shui') ? 'shui' : demo.includes('zhongqiu') ? 'zhongqiu' : 'qinglv';
    if (demo.includes('rank')) {
      setTimeout(() => {
        document.querySelector('[data-theme="' + themeKey + '"]').click();
        FLUID.clear();
        const names = ['焦墨', '浓墨', '重墨', '淡墨', '清墨'];
        names.forEach((name, i) => {
          const c = PALETTES[themeKey].colors.find(k => k.name === name);
          if (!c) return;
          FLUID.setInk(c.rgb, c.gain);
          const m = Math.max(c.rgb[0], c.rgb[1], c.rgb[2]);
          const g = c.gain || 1;
          FLUID.queue([{ delay: i * 120, x: 0.15 + 0.175 * i, y: 0.5, dx: 0, dy: 0,
            color: [0.55 * g * c.rgb[0] / m, 0.55 * g * c.rgb[1] / m, 0.55 * g * c.rgb[2] / m], radius: 1.3 }]);
        });
      }, 450);
    } else {
      const patName = demo.includes('lang') ? 'lang' : demo.includes('xuan') ? 'xuan' : demo.includes('guiyu') ? 'guiyu' : 'yun';
      const cMatch = demo.match(/c(\d)/);
      const cIdx = cMatch ? Math.min(PALETTES[themeKey].colors.length - 1, +cMatch[1]) : PALETTES[themeKey].defaultIndex;
      setTimeout(() => {
        document.querySelector('[data-theme="' + themeKey + '"]').click();
        document.querySelectorAll('.swatch')[cIdx].click();
        FLUID.clear();
        FLUID.queue(PATTERNS.make(patName, PALETTES[themeKey], PALETTES[themeKey].colors[cIdx]));
        if (demo.includes('print')) setTimeout(() => document.getElementById('printBtn').click(), 2800);
      }, 450);
    }
  } else {
    // 迎客墨：开场自动演半段云纹，第一眼就有东西看
    setTimeout(() => FLUID.queue(PATTERNS.make('yun', state.palette, currentInk()).slice(0, 34)), 700);
  }
})();
