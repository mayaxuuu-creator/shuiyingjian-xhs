/* 水影笺 · 小红书小工具版
   与主仓差异（容器适配，实测为准）：
   - 容器禁用系统剪贴 → 文案卡展示可选文字引导手动复制
   - 保存：容器支持 blob 下载（同类工具实测可保存），a[download] 直存 + 截图兜底提示
   - 其余逻辑与主仓一致 */

(function () {
  'use strict';

  const state = {
    palette: PALETTES.qinglv,
    colorIndex: PALETTES.qinglv.defaultIndex,
    number: 0,
    mind: null,
    poem: null,
    share: null,
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
    return state.palette.colors[state.colorIndex].rgb;
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
        FLUID.setInk(c.rgb);
      });
      paletteBox.appendChild(btn);
    });
    FLUID.setInk(currentInk());
  }

  function setTheme(palette) {
    state.palette = palette;
    state.colorIndex = palette.defaultIndex;
    FLUID.setTheme(palette);
    FLUID.paperForPrint = palette.paper;
    buildPalette();
    document.body.classList.toggle('theme-shui', palette.key === 'shui');
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
    const features = MIND.analyze(pixels);
    state.mind = MIND.readMind(features, state.palette.key);
    state.poem = RUBBING_POEMS[state.number % RUBBING_POEMS.length];
    const sheet = RUBBING.create({ pixels, number: state.number, mind: state.mind });
    paperCanvas.width = RUBBING.W;
    paperCanvas.height = RUBBING.H;
    paperCanvas.getContext('2d').drawImage(sheet, 0, 0);
    caption.textContent = '第 ' + state.number + ' 号 · 心相「' + state.mind.name + '」';
    renderShare();
    resultBar.classList.add('hidden');
    shareCard.classList.add('hidden');
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;   // 强制 reflow，保证过渡动画必触发（不依赖 rAF 存活）
    overlay.classList.add('show');
    setTimeout(() => { resultBar.classList.remove('hidden'); shareCard.classList.remove('hidden'); }, 1250);
  });

  $('#againBtn').addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 420);
    FLUID.resume();
  });

  // ---------- 保存 / 分享文案 ----------
  // 保存：实测小工具容器支持 blob 下载（多家同类工具可点击保存），截图仅作兜底提示
  $('#saveBtn').addEventListener('click', () => {
    try {
      paperCanvas.toBlob(blob => {
        if (!blob) { showToast('保存未响应 · 请截图保存'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '水影笺_' + state.mind.name + '_' + state.number + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast('已发起保存 · 若无反应请截图');
      }, 'image/png');
    } catch (err) {
      showToast('保存未响应 · 请截图保存');
    }
  });

  function renderShare() {
    state.share = MIND.shareCopy(state.number, state.mind, state.poem);
    $('#shareTitle').textContent = state.share.title;
    $('#shareBody').textContent = state.share.body;
    $('#shareTags').textContent = state.share.tags;
  }
  $('#shareShuffle').addEventListener('click', () => {
    renderShare();
  });

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

  // URL 演示钩子：?demo=shui-xuan-print 或 ?demo=qinglv-c2-lang-print
  // 主题段：qinglv / shui；c数字 = 墨盘序号；纹样段：yun / lang / xuan；带 print = 自动覆纸
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) {
    const themeKey = demo.includes('shui') ? 'shui' : 'qinglv';
    const patName = demo.includes('lang') ? 'lang' : demo.includes('xuan') ? 'xuan' : 'yun';
    const cMatch = demo.match(/c(\d)/);
    const cIdx = cMatch ? Math.min(PALETTES[themeKey].colors.length - 1, +cMatch[1]) : PALETTES[themeKey].defaultIndex;
    setTimeout(() => {
      document.querySelector('[data-theme="' + themeKey + '"]').click();
      document.querySelectorAll('.swatch')[cIdx].click();
      FLUID.clear();
      FLUID.queue(PATTERNS.make(patName, PALETTES[themeKey], PALETTES[themeKey].colors[cIdx].rgb));
      if (demo.includes('print')) setTimeout(() => document.getElementById('printBtn').click(), 2800);
    }, 450);
  } else {
    // 迎客墨：开场自动演半段云纹，第一眼就有东西看
    setTimeout(() => FLUID.queue(PATTERNS.make('yun', state.palette, currentInk()).slice(0, 34)), 700);
  }
})();
