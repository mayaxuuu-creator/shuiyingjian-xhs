/* 水影笺 · 小红书小工具版 主流程（v3.7）
   玩法：滴墨/吹墨/按住渗墨 → 纹样保底（选中色主调+辅色）
   → 覆纸拓印（成笺/素笺）→ 心相读墨+配诗 → 保存相册 / 发笔记 / 收入长物斋 */

(function () {
  'use strict';

  // Chrome 61 has no Flexbox gap; keep the original spacing as a legacy layout layer.
  (function supportFlexGap() {
    const probe = document.createElement('div');
    const first = document.createElement('div');
    const second = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px;';
    first.style.height = second.style.height = '1px';
    probe.appendChild(first);
    probe.appendChild(second);
    document.body.appendChild(probe);
    const supported = probe.scrollHeight === 3;
    probe.parentNode.removeChild(probe);
    if (!supported) document.documentElement.classList.add('no-flex-gap');
  })();

  const state = {
    palette: PALETTES.qinglv,
    colorIndex: PALETTES.qinglv.defaultIndex,
    materialName: '',      // 拓印完成后才点选，默认素拓
    carrier: 'sheet',      // 拓印完成的成器形态
    freedom: { accentName: 'random' },
    number: 0,
    mind: null,
    poem: null,
    share: null,
    pure: false,          // 素笺模式（无题签/心相签/编号）
    lastPixels: null,     // 拓印像素缓存（成笺/素笺切换复用）
    lastPattern: '',      // 本次池中最后使用的纹样（桂雨触发花形装饰）
    sealName: localStorage.getItem('syj_seal_name') || '',
    texMode: ['float', 'single', 'soft'].includes(new URLSearchParams(location.search).get('tex'))
      ? new URLSearchParams(location.search).get('tex') : 'float',   // 底纹验收开关
  };

  const $ = s => document.querySelector(s);
  const paletteBox = $('#palette');
  const resultMaterialList = $('#resultMaterialList');
  const hint = $('#hint');
  const overlay = $('#printOverlay');
  const paperCanvas = $('#paperCanvas');
  const umbrellaCanvas = $('#umbrellaCanvas');
  const porcelainCanvas = $('#porcelainCanvas');
  const paperSheet = $('#paperSheet');
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
  function currentMaterial() {
    return (state.palette.materials || []).find(item => item.name === state.materialName) || null;
  }
  function carrierName(key) {
    return {
      fan: '团扇',
      fanfold: '折扇',
      umbrella: '油纸伞',
      porcelain: '瓷器',
      bookmark: '书签',
    }[key || 'sheet'] || '笺';
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

  function buildResultMaterials() {
    resultMaterialList.innerHTML = '';
    const materials = state.palette.materials || [];
    const none = document.createElement('button');
    none.className = 'finish-material' + (!state.materialName ? ' active' : '');
    none.textContent = '无';
    none.addEventListener('click', () => selectMaterial(''));
    resultMaterialList.appendChild(none);
    materials.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'finish-material' + (state.materialName === item.name ? ' active' : '');
      btn.title = item.name;
      btn.setAttribute('aria-label', '拓后辅料 · ' + item.name);
      btn.style.background = item.swatch;
      btn.textContent = item.name;
      btn.addEventListener('click', () => selectMaterial(item.name));
      resultMaterialList.appendChild(btn);
    });
  }

  function selectMaterial(name) {
    state.materialName = name;
    resultMaterialList.querySelectorAll('.finish-material').forEach(el =>
      el.classList.toggle('active', el.textContent === (name || '无')));
    renderSheet();
    showToast(name ? '已加辅料 · ' + name : '已回到素拓');
  }

  function syncFreedomUI() {
    const accentBox = $('#accentOptions');
    accentBox.innerHTML = '';
    const random = document.createElement('button');
    random.textContent = '随机';
    random.classList.toggle('active', state.freedom.accentName === 'random');
    random.addEventListener('click', () => {
      state.freedom.accentName = 'random';
      syncFreedomUI();
    });
    accentBox.appendChild(random);
    (state.palette.accentPool || []).forEach(name => {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.classList.toggle('active', state.freedom.accentName === name);
      btn.addEventListener('click', () => {
        state.freedom.accentName = name;
        syncFreedomUI();
      });
      accentBox.appendChild(btn);
    });
  }

  function resetFreedom() {
    state.freedom = { accentName: 'random' };
    syncFreedomUI();
  }

  function syncCarrierUI() {
    document.querySelectorAll('#carrierSeg button').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.carrier === state.carrier));
  }

  /* 非笺载体的导出画面默认走素笺：避免题签/编号压在器物上。 */
  function renderPure() {
    return state.pure;
  }

  function syncModeUI() {
    document.querySelectorAll('#modeSeg button').forEach(btn =>
      btn.classList.toggle('active', (btn.dataset.mode === 'pure') === renderPure()));
  }

  function syncCaption() {
    if (!state.mind || !state.number) return;
    caption.textContent = '第 ' + state.number + ' 号' +
      (renderPure() ? ' · 素笺' : ' · 心相「' + state.mind.name + '」');
  }

  function setTheme(palette) {
    state.palette = palette;
    state.colorIndex = palette.defaultIndex;
    state.materialName = '';
    state.carrier = 'sheet';
    resetFreedom();
    FLUID.setTheme(palette);
    FLUID.paperForPrint = palette.paper;
    buildPalette();
    buildResultMaterials();
    document.body.classList.toggle('theme-shui', palette.key === 'shui');
    document.body.classList.toggle('theme-zhongqiu', palette.key === 'zhongqiu');
    document.querySelectorAll('[data-only]').forEach(btn => {
      btn.hidden = btn.dataset.only !== palette.key;
    });
    document.querySelectorAll('.theme-tab').forEach(btn => {
      btn.title = { dunhuang: '晨光敦煌', ruyao: '雨过汝窑' }[palette.key] || palette.desc;
    });
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
      state.lastPattern = btn.dataset.pattern;
      syncFreedomUI();
      FLUID.queue(PATTERNS.make(btn.dataset.pattern, state.palette, currentInk(), state.freedom));
      dismissHint();
    });
  });
  $('#clearBtn').addEventListener('click', () => {
    FLUID.clear();
  });

  // ---------- 覆纸拓印 + 心相读墨 ----------
  $('#printBtn').addEventListener('click', () => {
    state.number = 1000 + Math.floor(Math.random() * 9000);
    state.materialName = '';
    state.carrier = 'sheet';
    buildResultMaterials();
    syncCarrierUI();
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
    setTimeout(() => {
      resultBar.classList.remove('hidden');
      $('#finishBar').classList.remove('hidden');
      shareCard.classList.remove('hidden');
    }, 1250);
  });

  // ---------- 成笺 / 素笺渲染 ----------
  function renderSheet() {
    const sheet = RUBBING.create({
      pixels: state.lastPixels,
      number: state.number,
      mind: state.mind,
      poem: state.poem,
      pure: renderPure(),
      sealName: state.sealName,
      material: state.palette.material,
      suite: state.palette.key,
      paper: state.palette.paper || null,   // 套装声明的纸底色（汝窑天青 #A8C4C0 走这里）
      paperImg: state.palette.paperImg || null,
      texMode: state.texMode,
      pattern: state.palette.material === 'ciqing' ? state.lastPattern : '',
    });
    const carried = RUBBING.makeCarrier(sheet, state.carrier);
    RUBBING.applyAuxiliary(carried, currentMaterial(), state.carrier);
    paperCanvas.width = RUBBING.W;
    paperCanvas.height = RUBBING.H;
    paperCanvas.getContext('2d').drawImage(carried, 0, 0);
    syncUmbrellaPreview();
    syncPorcelainPreview(sheet);
    if (state.carrier === 'porcelain') {
      state.sourceUrl = sheet.toDataURL('image/jpeg', .9);
    }
  }

  /* 油纸伞的动态预览：预览层只保留圆形伞面，保存/发笔记仍用 paperCanvas 的静态导出图。 */
  function syncUmbrellaPreview() {
    if (state.carrier !== 'umbrella') {
      paperSheet.classList.remove('umbrella-preview');
      umbrellaCanvas.classList.add('hidden');
      return;
    }
    umbrellaCanvas.classList.remove('hidden');
    paperSheet.classList.add('umbrella-preview');
    umbrellaCanvas.width = 720;
    umbrellaCanvas.height = 720;
    const uctx = umbrellaCanvas.getContext('2d');
    uctx.clearRect(0, 0, 720, 720);
    uctx.drawImage(paperCanvas, 0, 40, 720, 720, 0, 0, 720, 720);
    uctx.globalCompositeOperation = 'destination-in';
    uctx.beginPath();
    uctx.arc(360, 380, 332, 0, Math.PI * 2);
    uctx.fill();
    uctx.globalCompositeOperation = 'source-over';
  }

  /* 瓷器使用轻量 WebGL 预览；WebGL 不可用时自动回落到 2D 静态导出图。 */
  function syncPorcelainPreview(sheet) {
    if (state.carrier !== 'porcelain' || !window.PORCELAIN3D || !window.PORCELAIN3D.show(porcelainCanvas, sheet)) {
      window.PORCELAIN3D && window.PORCELAIN3D.stop();
      porcelainCanvas.classList.add('hidden');
      paperSheet.classList.remove('porcelain-preview');
      return;
    }
    porcelainCanvas.classList.remove('hidden');
    paperSheet.classList.add('porcelain-preview');
  }

  /* 长物斋/相册导出：瓷器同步当前 3D 器面；其余载体沿用静态导出。 */
  function currentCarrierImage(type, quality) {
    if (state.carrier === 'porcelain' && !porcelainCanvas.classList.contains('hidden')) {
      const blacked = document.createElement('canvas');
      blacked.width = porcelainCanvas.width;
      blacked.height = porcelainCanvas.height;
      const context = blacked.getContext('2d');
      context.fillStyle = '#000';
      context.fillRect(0, 0, blacked.width, blacked.height);
      context.drawImage(porcelainCanvas, 0, 0);
      return blacked.toDataURL(type, quality);
    }
    return paperCanvas.toDataURL(type, quality);
  }

  function currentDynamicPreview() {
    if (state.carrier === 'umbrella' && !umbrellaCanvas.classList.contains('hidden')) {
      return umbrellaCanvas.toDataURL('image/jpeg', .86);
    }
    if (state.carrier === 'porcelain' && !porcelainCanvas.classList.contains('hidden')) {
      return porcelainCanvas.toDataURL('image/jpeg', .88);
    }
    return '';
  }

  document.querySelectorAll('#modeSeg button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.lastPixels) return;
      state.pure = btn.dataset.mode === 'pure';
      document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('active', b === btn));
      renderSheet();
      syncCaption();
    });
  });

  document.querySelectorAll('#carrierSeg button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.lastPixels) return;
      state.carrier = btn.dataset.carrier;
      if (state.carrier !== 'sheet') state.pure = true;
      syncCarrierUI();
      syncModeUI();
      renderSheet();
      syncCaption();
      applyShareCarrier();
      showToast('已入' + carrierName(state.carrier));
    });
  });

  $('#againBtn').addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 420);
    FLUID.resume();
  });

  // ---------- 保存（容器 JSBridge 相册直存） ----------
  $('#saveBtn').addEventListener('click', () => {
    saveDataUrl(currentCarrierImage('image/png'), state.number, true);
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
    showToast('当前环境暂不支持保存 · 请截图保存');
  }

  // ---------- 分享文案 ----------
  function renderShare() {
    state.share = MIND.shareCopy(state.number, state.mind, state.poem);
    applyShareCarrier();
  }

  function applyShareCarrier() {
    if (!state.share) {
      state.share = MIND.shareCopy(state.number, state.mind, state.poem);
    }
    const carrier = carrierName(state.carrier);
    const suffix = carrier === '笺' ? '' : carrier;
    const mindName = state.mind ? state.mind.name : '无相';
    state.share.title = ('水影笺' + suffix + ' · 「' + mindName + '」').slice(0, 20);
    state.share.body = state.share.body.replace(/\n成器 · [^\n]+/g, '') +
      (suffix ? '\n成器 · ' + suffix : '');
    $('#shareTitle').textContent = state.share.title;
    $('#shareBody').textContent = state.share.body;
    $('#shareTags').textContent = state.share.tags;
  }

  $('#shareShuffle').addEventListener('click', renderShare);

  // ---------- 发笔记（容器桥接 postNote） ----------
  $('#postBtn').addEventListener('click', () => postNoteDraft(
    currentCarrierImage('image/png'),
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

  // ---------- 长物斋 ----------
  $('#galleryBtn').addEventListener('click', () => GALLERY.show());
  GALLERY.setHandlers({
    async save(dataUrl, num) { await saveDataUrl(dataUrl, num, !!(window.xhs && window.xhs.miniTool)); },
    post(work) {
      const dataUrl = work.dataUrl;
      const carrier = work.carrierLabel || carrierName(work.carrier);
      postNoteDraft(dataUrl, {
        title: ('水影笺' + carrier + ' · 「' + work.mind + '」').slice(0, 20),
        body: (work.theme || '流沙笺') + ' ' + carrier + ' · 第 ' + work.number + ' 号\n' +
          '心相「' + work.mind + '」\n' + (work.poem || '') +
          (work.material ? '\n器面 · ' + work.material : ''),
        tags: '#水影笺 #长物斋 #国风美学 #非遗',
      });
    },
    share(dataUrl, meta) {
      if (!dataUrl) {
        showToast(meta && meta.empty ? '长物斋还空着 · 先拓一张收入斋展' : '分享图未生成');
        return;
      }
      postNoteDraft(dataUrl, {
        title: '水影笺 · 长物斋小展',
        body: '长物斋小展 · 收录 ' + (meta ? meta.count || 0 : 0) + ' 件水影长物。\n每一件都从一滴墨开始，拓成笺、扇、伞、瓷。',
        tags: '#水影笺 #长物斋 #国风美学 #非遗',
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
      theme: state.palette.identity || state.palette.label,
      carrier: state.carrier,
      carrierLabel: carrierName(state.carrier),
      material: currentMaterial() ? currentMaterial().name : '',
      ts: Date.now(),
      dataUrl: currentCarrierImage('image/jpeg', 0.9),
      previewUrl: currentDynamicPreview(),
      sourceUrl: state.carrier === 'porcelain' ? state.sourceUrl : '',
    }).then(store => showToast(store === 'ls' ? '已入长物斋 ✓（本机轻量存储）' : '已入长物斋 ✓'))
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
  // 花纸套装纸底图预加载（敦煌生图等；未就绪自动回落纯色纸底）
  RUBBING.preloadTextures([].concat.apply([], Object.keys(PALETTES).map(k => PALETTES[k].paperImg || [])));

  // URL 演示钩子：?demo=shui-xuan-print / ?demo=qinglv-c2-lang-print / ?demo=shui-rank
  // 主题段直接匹配五盘 key（qinglv/shui/dunhuang/ruyao/zhongqiu）
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) {
    const themeKey = ['qinglv', 'shui', 'dunhuang', 'ruyao', 'zhongqiu'].find(k => demo.includes(k)) || 'qinglv';
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
        state.lastPattern = patName;
        FLUID.queue(PATTERNS.make(patName, PALETTES[themeKey], PALETTES[themeKey].colors[cIdx]));
        if (demo.includes('print')) setTimeout(() => document.getElementById('printBtn').click(), 2800);
      }, 450);
    }
  } else {
    // 迎客墨：开场自动演半段云纹，第一眼就有东西看
    setTimeout(() => FLUID.queue(PATTERNS.make('yun', state.palette, currentInk()).slice(0, 34)), 700);
  }
})();
