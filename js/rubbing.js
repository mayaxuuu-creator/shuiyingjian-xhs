/* 水影笺 · 覆纸拓印（Canvas 2D 二次渲染）
   输入：流体引擎导出的拓印像素 → 输出：720×1040 成笺
   v2.0：材质包（宣纸/磁青）· 素笺模式 · 署名印 · 诗句由外部传入（心相配诗）
   零外部素材，全部程序绘制（版权安全 + 小红书容器离线合规） */

window.RUBBING = (function () {
  'use strict';

  const W = 720, H = 1040;
  const SERIF = '"WenKai", "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", serif';
  // 印面专用：系统宋体（文楷子集不含用户名任意字，混排会字体回退不一致——统一系统字体）
  const SEAL_FONT = '"Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", serif';

  /* 材质底纹：纸底之后、墨纹之前调用；生图优先，未就绪回落程序纹理
     textureImg: ['/textures/xx.webp',...]（Maya 小云雀生图入库后填入）
     textureAlpha: 底纹整体不透明度（对比调参用） */
  const TEXTURE_CACHE = {};   // src -> Image（已解码）
  function preloadTextures(urls) {
    (urls || []).forEach(src => {
      if (TEXTURE_CACHE[src]) return;
      const img = new Image();
      img.onload = () => { TEXTURE_CACHE[src] = img; };
      img.src = src;
    });
  }

  /* 汝窑开片：主纹纵贯 → 支纹 60° 分叉 → 细纹递归一层；釉面高光
     after=true 时为"透墨层"：浅青线，让开片在墨色里也有裂纹反光 */
  function ruyaoTexture(ctx, W, H, alpha, after) {
    const A = alpha || 0.17;
    const lineColor = after ? 'rgba(190, 216, 214, ' : 'rgba(56, 86, 90, ';
    ctx.lineCap = 'round';
    // 一条裂纹：随机折行
    function crack(x, y, angle, len, seg, width, a) {
      ctx.strokeStyle = lineColor + a + ')';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let ax = angle;
      for (let i = 0; i < seg; i++) {
        ax += (Math.random() - 0.5) * 0.55;
        x += Math.cos(ax) * (len / seg);
        y += Math.sin(ax) * (len / seg);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      return { x, y, a: ax };
    }
    // 主纹：3~4 条纵贯
    const mains = [];
    const nMain = 3 + ((Math.random() * 2) | 0);
    for (let i = 0; i < nMain; i++) {
      const sx = W * (0.12 + 0.76 * ((i + Math.random() * 0.6) / nMain));
      mains.push(crack(sx, -20, Math.PI / 2 + (Math.random() - 0.5) * 0.5, H + 60, 16 + ((Math.random() * 8) | 0), 1.1, A));
    }
    // 支纹：主纹中途 60°±25° 分叉
    for (let i = 0; i < mains.length * 3; i++) {
      const m = mains[i % mains.length];
      const bx = m.x * (0.25 + Math.random() * 0.5) + (Math.random() - 0.5) * 40;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const br = crack(bx, H * Math.random(), Math.PI / 2 + dir * (Math.PI / 3 + (Math.random() - 0.5) * 0.5), H * (0.12 + Math.random() * 0.2), 8, 0.7, A * 0.85);
      // 细纹：支纹再分叉一层（冰裂的碎感）
      for (let k = 0; k < 2; k++) {
        crack(br.x * Math.random(), br.y * Math.random() + H * 0.2, Math.random() * Math.PI, H * (0.05 + Math.random() * 0.08), 5, 0.45, A * 0.7);
      }
    }
    if (!after) {
      // 釉面高光：1~2 处极淡 radial（只在底层画一次）
      for (let i = 0; i < 2; i++) {
        const hx = Math.random() * W, hy = Math.random() * H, hr = H * (0.18 + Math.random() * 0.15);
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
        g.addColorStop(0, 'rgba(240, 246, 244, 0.10)');
        g.addColorStop(1, 'rgba(240, 246, 244, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
      }
    }
  }

  /* 敦煌飘带（程序保底版）：双钩飘带 ×3 + 藻井角饰 + 金箔氧化点
     after=true 时为"透墨层"：金线（矿物金透过墨色的反光） */
  function dunhuangTexture(ctx, W, H, alpha, after) {
    const A = alpha || 0.18;
    const red = after ? 'rgba(212, 178, 110, ' : 'rgba(158, 64, 38, ';
    const gold = 'rgba(180, 140, 70, ';
    const lineAlphaMul = after ? 0.75 : 1;
    // 双钩飘带：两条平行贝塞尔夹一条淡填充
    for (let i = 0; i < 3; i++) {
      const y0 = H * (0.18 + i * 0.3) + (Math.random() - 0.5) * 40;
      const sway = (Math.random() > 0.5 ? 1 : -1) * (60 + Math.random() * 60);
      const band = (lw, a) => {
        ctx.beginPath();
        ctx.moveTo(-30, y0);
        ctx.bezierCurveTo(W * 0.3, y0 - sway, W * 0.7, y0 + sway, W + 30, y0 + (Math.random() - 0.5) * 30);
        ctx.strokeStyle = red + (a * lineAlphaMul) + ')';
        ctx.lineWidth = lw;
        ctx.stroke();
      };
      ctx.lineCap = 'round';
      band(2.2, A);            // 上钩线
      band(1.4, A * 0.8);      // 下钩线
      // 带中淡金晕染（衣带间的矿物沉积）
      ctx.beginPath();
      ctx.moveTo(-30, y0 + 3);
      ctx.bezierCurveTo(W * 0.3, y0 - sway + 3, W * 0.7, y0 + sway + 3, W + 30, y0 + 3);
      ctx.strokeStyle = gold + (A * 0.5) + ')';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    // 金箔氧化点
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      ctx.fillStyle = gold + (A * 0.8) + ')';
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + Math.random() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // 藻井角饰：四角三层回纹角线
    const corner = (cx, cy, sx, sy) => {
      ctx.strokeStyle = red + (A * 0.9) + ')';
      ctx.lineWidth = 1.2;
      for (let l = 0; l < 3; l++) {
        const o = l * 9;
        ctx.beginPath();
        ctx.moveTo(cx + sx * (26 + o), cy + sy * (8 + o));
        ctx.lineTo(cx + sx * (8 + o), cy + sy * (8 + o));
        ctx.lineTo(cx + sx * (8 + o), cy + sy * (26 + o));
        ctx.stroke();
      }
    };
    corner(0, 0, 1, 1); corner(W, 0, -1, 1); corner(0, H, 1, -1); corner(W, H, -1, -1);
  }

  /* 材质包：拓印载体各自的纸底/纤维/文字/框线配色与混合语义
     xuanzhi = 暖宣纸（墨为减光颜料，multiply 正片叠底）
     ciqing  = 磁青纸（颜料为月白粉/泥金粉，screen 滤色——银粉浮于蓝绢） */
  /* 套装底纹注册表（底纹属于套装气质，不属于物理材质——敦煌/汝窑共用宣纸底但各有底纹）
     敦煌 = 三层拆分模式（K老师 D21 方案）：同一张底纹图按亮度拆三层，各用对的混合模式
       crack 裂纹层（暗部）multiply 沉纸底 / mottle 斑驳层（中调）soft-light 透墨 /
       gold 金箔层（亮部）screen 浮光——参数集中在 L，便于校准 */
  const SUITE_TEXTURES = {
    dunhuang: {
      img: [
        { src: './textures/dh_wall_01.webp' },   // 标准土黄版
        { src: './textures/dh_wall_02.webp' },   // 华丽飘带版
        { src: './textures/dh_wall_03.webp' },   // 青绿壁画版（sepia 已移除：滤镜硬拉会糊进纸底）
      ],
      layerMode: true,
      L: { dark: 90, bright: 165, crack: 0.15, mottle: 0.18, gold: 0.12 },
    },
    ruyao: { fn: ruyaoTexture, alpha: 0.17, img: null },
  };

  /* 生图底纹三模式（K老师验收开关，?tex=float/single/soft）
     float（默认）：墨下满强度铺底 + 墨上剥落浮层（blur 2px 柔边，每图独立强度）
     single：仅墨下层——验收浮层必要性
     soft：单层 soft-light 30%——保底方案（不切割墨纹、不叠加色相） */
  /* 三层拆分引擎：底纹图按亮度阈值拆 裂纹(暗)/斑驳(中调)/金箔(亮) 三层
     每层做"中性化"处理——multiply 白=无效、screen 黑=无效、soft-light 50%灰=无效，
     叠加时各自只表达自己的视觉信息。结果按 src 缓存，只拆一次。 */
  const LAYER_CACHE = {};
  function getLayers(src) {
    if (LAYER_CACHE[src]) return LAYER_CACHE[src];
    const img = TEXTURE_CACHE[src];
    if (!img) return null;
    const w = img.width, h = img.height;
    const srcC = document.createElement('canvas');
    srcC.width = w; srcC.height = h;
    srcC.getContext('2d').drawImage(img, 0, 0);
    const data = srcC.getContext('2d').getImageData(0, 0, w, h).data;
    const t = SUITE_TEXTURES.dunhuang, L = t.L;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    };
    const crack = mk(), mottle = mk(), gold = mk();
    const cc = crack.getContext('2d').createImageData(w, h);
    const md = mottle.getContext('2d').createImageData(w, h);
    const gd = gold.getContext('2d').createImageData(w, h);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // 裂纹层：暗部保留、其余白（multiply 白=中性）
      if (lum < L.dark) { cc.data[i] = r; cc.data[i + 1] = g; cc.data[i + 2] = b; }
      else { cc.data[i] = 255; cc.data[i + 1] = 255; cc.data[i + 2] = 255; }
      cc.data[i + 3] = 255;
      // 斑驳层：中调保留、其余 50% 灰（soft-light 灰=中性）
      if (lum >= L.dark && lum <= L.bright) { md.data[i] = r; md.data[i + 1] = g; md.data[i + 2] = b; }
      else { md.data[i] = 128; md.data[i + 1] = 128; md.data[i + 2] = 128; }
      md.data[i + 3] = 255;
      // 金箔层：亮部保留、其余黑（screen 黑=中性）
      if (lum > L.bright) { gd.data[i] = r; gd.data[i + 1] = g; gd.data[i + 2] = b; }
      else { gd.data[i] = 0; gd.data[i + 1] = 0; gd.data[i + 2] = 0; }
      gd.data[i + 3] = 255;
    }
    crack.getContext('2d').putImageData(cc, 0, 0);
    mottle.getContext('2d').putImageData(md, 0, 0);
    gold.getContext('2d').putImageData(gd, 0, 0);
    const out = { crack, mottle, gold };
    LAYER_CACHE[src] = out;
    return out;
  }

  function drawSuiteTexture(ctx, suiteKey, W, H, mul, after, mode) {
    const t = SUITE_TEXTURES[suiteKey];
    if (!t) return;
    const m = mode || 'float';
    const entries = (t.img || []).filter(e => TEXTURE_CACHE[e.src]);
    if (entries.length) {
      if (after && m !== 'float') return;   // 浮层只在 float 模式存在
      const e = entries[(Math.random() * entries.length) | 0];
      const img = TEXTURE_CACHE[e.src];
      const scale = Math.max(W / img.width, H / img.height);
      const dx = (W - img.width * scale) / 2, dy = (H - img.height * scale) / 2;
      ctx.save();
      if (m === 'soft') {
        // 保底：单层 soft-light
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.30 * (mul === undefined ? 1 : mul);
        if (e.filter) ctx.filter = e.filter;
        ctx.drawImage(img, dx, dy, img.width * scale, img.height * scale);
      } else if (after) {
        // float 浮层：剥落感（blur 柔边 + 独立强度）
        ctx.globalAlpha = (e.float || 0.40) * (mul === undefined ? 1 : mul);
        ctx.filter = 'blur(2px)' + (e.filter ? ' ' + e.filter : '');
        ctx.drawImage(img, dx, dy, img.width * scale, img.height * scale);
      } else {
        // 墨下铺底
        ctx.globalAlpha = e.alpha * (mul === undefined ? 1 : mul);
        if (e.filter) ctx.filter = e.filter;
        ctx.drawImage(img, dx, dy, img.width * scale, img.height * scale);
      }
      ctx.restore();
      return;
    }
    // 程序纹理 fallback：single/soft 模式跳过浮层
    if (after && m !== 'float') return;
    const a = t.alpha * (mul === undefined ? 1 : mul);
    if (a <= 0.002) return;
    if (t.fn) t.fn(ctx, W, H, a, after);
  }

  const MATERIALS = {
    xuanzhi: {
      blend: 'multiply',
      blendAlpha: 0.94,
      moonR: 0,
      // 素纸无底纹（文人美学，留白即材质语言）
      paper: '#f6efdc',
      fiberDark: 'rgba(122, 98, 62, ',
      fiberDarkA: 0.05,
      fiberLight: 'rgba(255, 252, 242, ',
      fiberLightA: 0.07,
      fiberStroke: 'rgba(120, 96, 60, 0.035)',
      golds: ['#c9a227', '#d9b64a', '#b8912f', '#e8ca6b'],
      slipBg: 'rgba(246, 239, 220, 0.9)',
      slipBorder: 'rgba(74, 64, 52, 0.45)',
      slipDot: 'rgba(165, 50, 42, 0.85)',
      inkText: '#2e2a24',
      inkDim: 'rgba(46, 42, 36, 0.62)',
      poetColor: 'rgba(46, 42, 36, 0.62)',
      numberColor: 'rgba(74, 64, 52, 0.8)',
      yearColor: 'rgba(74, 64, 52, 0.55)',
      borderOuter: 'rgba(74, 64, 52, 0.5)',
      borderInner: 'rgba(74, 64, 52, 0.25)',
      vignette: 'rgba(60, 45, 25, 0.11)',
      sealFace: 'rgba(158, 42, 32, 0.92)',
      sealText: 'rgba(246, 239, 220, 0.95)',
      sealInner: 'rgba(246, 239, 220, 0.5)',
    },
    ciqing: {
      blend: 'screen',
      blendAlpha: 1.0,
      moonR: 0.085,   // 月轮半径（相对画幅高度），画在墨纹之下（云破月来）
      // 磁青底纹 = 月轮/桂雨/星子体系，不另加底图
      paper: '#0e162e',
      fiberDark: 'rgba(140, 160, 215, ',
      fiberDarkA: 0.05,
      fiberLight: 'rgba(215, 228, 255, ',
      fiberLightA: 0.06,
      fiberStroke: 'rgba(150, 170, 220, 0.03)',
      golds: ['#d9b96a', '#e3ca80', '#c9a957', '#efe0ae'],
      slipBg: 'rgba(10, 18, 40, 0.42)',
      slipBorder: 'rgba(217, 185, 106, 0.55)',
      slipDot: 'rgba(217, 185, 106, 0.9)',
      inkText: '#d9b96a',
      inkDim: 'rgba(217, 185, 106, 0.7)',
      poetColor: 'rgba(217, 185, 106, 0.7)',
      numberColor: 'rgba(217, 185, 106, 0.78)',
      yearColor: 'rgba(217, 185, 106, 0.5)',
      borderOuter: 'rgba(217, 185, 106, 0.55)',
      borderInner: 'rgba(217, 185, 106, 0.28)',
      vignette: 'rgba(0, 4, 18, 0.2)',
      sealFace: 'rgba(201, 168, 88, 0.92)',    // 泥金钤印：金面
      sealText: 'rgba(12, 20, 42, 0.95)',      // 蓝文（磁青纸色反白）
      sealInner: 'rgba(12, 20, 42, 0.45)',
      fleckR: 0.55,   // 磁青洒金 = 细小星子（与大瓣桂雨区分）
      fleckA: 0.6,
      goldDust: true, // 金粉浮光层（按墨纹密度撒金沙）
    },
  };

  /* 署名印：按字数定印面（0=默认水影笺印，1=单字，2=某某之印，3=某某某印） */
  function sealChars(name) {
    const cs = (name || '').trim().split('').filter(Boolean);
    if (!cs.length) return { chars: ['水', '影', '笺', '印'], font: 30 };
    if (cs.length === 1) return { chars: [cs[0]], font: 44 };
    if (cs.length === 2) return { chars: [cs[0], cs[1], '之', '印'], font: 27 };
    return { chars: [cs[0], cs[1], cs[2], '印'], font: 24, col3: true };
  }

  function create(opts) {
    const pixels = opts.pixels;               // { data, width, height }
    const number = opts.number;
    const poem = opts.poem || { text: '秋水共长天一色', poet: '王勃' };
    const mind = opts.mind;                   // { name, line }
    const pure = !!opts.pure;                 // 素笺模式：无题签/心相签/编号文字
    const sealName = opts.sealName || '';     // 署名（≤3 字）
    const pattern = opts.pattern || '';       // 本次池中使用的纹样（桂雨触发花形装饰）
    const mat = MATERIALS[opts.material] || MATERIALS.xuanzhi;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. 纸底：花纸套装（敦煌）用生图整幅做纸底（100% 呈现）；其余纯色
    const paperImgs = (opts.paperImg || []).map(s => TEXTURE_CACHE[s]).filter(Boolean);
    if (paperImgs.length) {
      const img = paperImgs[(Math.random() * paperImgs.length) | 0];
      const scale = Math.max(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * scale) / 2, (H - img.height * scale) / 2, img.width * scale, img.height * scale);
    } else {
      ctx.fillStyle = mat.paper;
      ctx.fillRect(0, 0, W, H);
    }

    // 2. 纸纤维：细噪点 + 长短纤维丝
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      ctx.fillStyle = Math.random() > 0.5
        ? mat.fiberDark + (Math.random() * mat.fiberDarkA) + ')'
        : mat.fiberLight + (Math.random() * mat.fiberLightA) + ')';
      ctx.fillRect(x, y, Math.random() > 0.8 ? 2 : 1, 1);
    }
    ctx.strokeStyle = mat.fiberStroke;
    ctx.lineWidth = 1;
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const a = Math.random() * Math.PI, l = 8 + Math.random() * 26;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4);
      ctx.stroke();
    }

    // 2.5 底纹：敦煌=三层拆分（裂纹层沉纸底）；汝窑=程序开片
    let dhLayers = null;
    if (opts.suite === 'dunhuang' && !paperImgs.length) {   // 花纸模式下跳过（生图已做纸底）
      const entries = (SUITE_TEXTURES.dunhuang.img || []).filter(e => TEXTURE_CACHE[e.src]);
      if (entries.length) {
        const e = entries[(Math.random() * entries.length) | 0];
        dhLayers = getLayers(e.src);
        if (dhLayers) {
          const scale = Math.max(W / dhLayers.crack.width, H / dhLayers.crack.height);
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = SUITE_TEXTURES.dunhuang.L.crack;
          ctx.drawImage(dhLayers.crack, (W - dhLayers.crack.width * scale) / 2, (H - dhLayers.crack.height * scale) / 2, dhLayers.crack.width * scale, dhLayers.crack.height * scale);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    } else {
      drawSuiteTexture(ctx, opts.suite, W, H, undefined, false, opts.texMode);
    }

    // 3. 墨纹：readPixels 自下而上，先翻行，再 multiply 吸附到纸面
    const flipped = new Uint8ClampedArray(pixels.data.length);
    const pw = pixels.width, ph = pixels.height, row = pw * 4;
    for (let y = 0; y < ph; y++) {
      flipped.set(pixels.data.subarray((ph - 1 - y) * row, (ph - y) * row), y * row);
    }
    const temp = document.createElement('canvas');
    temp.width = pw; temp.height = ph;
    temp.getContext('2d').putImageData(new ImageData(flipped, pw, ph), 0, 0);

    const scale = Math.max(W / pw, H / ph);
    const dw = pw * scale, dh = ph * scale;
    // 月轮（磁青）：淡金磁盘面 + 光晕，画在墨纹之下——墨纹 screen 卷过月轮即"云破月来"
    if (mat.moonR > 0) {
      const mx = W * 0.70, my = H * 0.28, mr = H * mat.moonR;
      const halo = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.6);
      halo.addColorStop(0, 'rgba(255, 236, 180, 0.28)');
      halo.addColorStop(1, 'rgba(255, 236, 180, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(mx - mr * 2.6, my - mr * 2.6, mr * 5.2, mr * 5.2);
      const disk = ctx.createRadialGradient(mx - mr * 0.25, my - mr * 0.25, mr * 0.15, mx, my, mr);
      disk.addColorStop(0, 'rgba(255, 244, 214, 0.85)');
      disk.addColorStop(0.75, 'rgba(250, 232, 190, 0.55)');
      disk.addColorStop(1, 'rgba(245, 224, 175, 0.12)');
      ctx.fillStyle = disk;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      // 月相纹理：极淡月面阴影（让月亮不是塑料球）
      ctx.fillStyle = 'rgba(90, 110, 165, 0.13)';
      ctx.beginPath();
      ctx.ellipse(mx - mr * 0.3, my - mr * 0.15, mr * 0.32, mr * 0.24, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(mx + mr * 0.28, my + mr * 0.32, mr * 0.24, mr * 0.17, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(mx + mr * 0.05, my - mr * 0.42, mr * 0.16, mr * 0.11, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // 墨纹吸附：宣纸 multiply（减光）/ 磁青 screen（粉彩发光）
    // 磁青月轮保护：先把墨纹画到离屏层，月心区域 destination-out 挖淡（云破月来，不云吞月）
    if (mat.moonR > 0) {
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const octx = off.getContext('2d');
      octx.drawImage(temp, (W - dw) / 2, (H - dh) / 2, dw, dh);
      const mx = W * 0.70, my = H * 0.28, mr = H * mat.moonR;
      const carve = octx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 1.5);
      carve.addColorStop(0, 'rgba(0,0,0,0.6)');       // 月心：云纹挖掉 60%，留一缕云丝
      carve.addColorStop(0.55, 'rgba(0,0,0,0.35)');
      carve.addColorStop(1, 'rgba(0,0,0,0)');          // 月缘外：不挖
      octx.globalCompositeOperation = 'destination-out';
      octx.fillStyle = carve;
      octx.beginPath();
      octx.arc(mx, my, mr * 1.5, 0, Math.PI * 2);
      octx.fill();
      ctx.globalCompositeOperation = mat.blend;
      ctx.globalAlpha = mat.blendAlpha;
      ctx.drawImage(off, 0, 0);
    } else {
      ctx.globalCompositeOperation = mat.blend;
      ctx.globalAlpha = mat.blendAlpha;
      ctx.drawImage(temp, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // 3.5 金粉浮光层（磁青）：按墨纹密度撒金沙——浓处密且亮，lighter 提闪
    if (mat.goldDust) {
      ctx.globalCompositeOperation = 'lighter';
      const darkGold = 'rgba(184, 149, 74, ', brightGold = 'rgba(244, 230, 200, ';
      for (let i = 0; i < 560; i++) {
        const x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 60);
        // 查该点墨密度（flipped 图像坐标）
        const px = Math.floor((x - (W - dw) / 2) / scale);
        const py = Math.floor((y - (H - dh) / 2) / scale);
        if (px < 0 || py < 0 || px >= pw || py >= ph) continue;
        const pi = (py * pw + px) * 4;
        const lum = (flipped[pi] + flipped[pi + 1] + flipped[pi + 2]) / 765;
        if (lum < 0.18 || Math.random() > lum * 1.15) continue;
        const r = 0.6 + Math.random() * 1.8;
        ctx.fillStyle = (Math.random() < 0.32 ? brightGold : darkGold) + (0.25 + Math.random() * 0.5) + ')';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // 3.6 桂雨花形（磁青所有纹样：桂花是主题装饰；桂雨纹样更多）：
    // 四瓣小花 + 花蕊，大小亮度都高于星子，"疏可走马"
    if (mat.goldDust) {
      ctx.globalCompositeOperation = 'screen';
      const n = pattern === 'guiyu' ? 9 + ((Math.random() * 5) | 0) : 4 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const fx = 60 + Math.random() * (W - 120);
        const fy = H * 0.12 + Math.random() * H * 0.55;
        const fs = (pattern === 'guiyu' ? 4.2 : 3.6) + Math.random() * 2.4;   // 比星子大且亮
        const fade = 1 - Math.max(0, (fy - H * 0.45) / (H * 0.55)) * 0.5;     // 低处渐隐
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(Math.random() * Math.PI);
        ctx.globalAlpha = (0.85 + Math.random() * 0.15) * fade;
        for (let p = 0; p < 4; p++) {
          ctx.rotate(Math.PI / 2);
          ctx.fillStyle = '#e2b94f';                 // 暖金，比星子亮
          ctx.beginPath();
          ctx.ellipse(fs * 0.62, 0, fs * 1.05, fs * 0.82, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff3d6';                     // 花蕊（亮）
        ctx.beginPath();
        ctx.arc(0, 0, fs * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 3.55 敦煌墨后层：斑驳 soft-light（透墨，深底自动弱化）+ 金箔 screen（只提亮不叠色相）
    if (dhLayers) {
      const L = SUITE_TEXTURES.dunhuang.L;
      const scale = Math.max(W / dhLayers.mottle.width, H / dhLayers.mottle.height);
      const dx = (W - dhLayers.mottle.width * scale) / 2, dy = (H - dhLayers.mottle.height * scale) / 2;
      const dw = dhLayers.mottle.width * scale, dh2 = dhLayers.mottle.height * scale;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = L.mottle;
      ctx.drawImage(dhLayers.mottle, dx, dy, dw, dh2);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = L.gold;
      ctx.drawImage(dhLayers.gold, dx, dy, dw, dh2);
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    } else if (!paperImgs.length) {
      drawSuiteTexture(ctx, opts.suite, W, H, 0.5, true, opts.texMode);
    }

    // 4. 洒金（宣纸=满铺金箔；磁青=星子聚类——簇状散布，去均匀噪点感）
    const fleckR = mat.fleckR || 1, fleckA = mat.fleckA || 1;
    if (mat.goldDust) {
      // 聚类生成：6~9 个簇心，每簇 3~8 片金箔，簇外稀疏
      const centers = [];
      const nc = 6 + ((Math.random() * 4) | 0);
      for (let c = 0; c < nc; c++) centers.push({ x: 40 + Math.random() * (W - 80), y: 40 + Math.random() * (H - 80) });
      for (const ct of centers) {
        const pieces = 3 + ((Math.random() * 6) | 0);
        for (let i = 0; i < pieces; i++) {
          const x = ct.x + (Math.random() - 0.5) * 44, y = ct.y + (Math.random() - 0.5) * 44;
          const r = (0.8 + Math.random() * 2.4) * fleckR;
          ctx.globalAlpha = (0.5 + Math.random() * 0.35) * fleckA;
          ctx.fillStyle = mat.golds[(Math.random() * mat.golds.length) | 0];
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.random() * Math.PI);
          ctx.fillRect(0, 0, r * (1.2 + Math.random()), r * (0.5 + Math.random() * 0.5));   // 碎箔片，非正圆
          ctx.restore();
        }
      }
      // 簇外散星（稀疏）
      for (let i = 0; i < 26; i++) {
        const x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 60);
        const r = 0.6 + Math.random() * 1.1;
        ctx.globalAlpha = 0.3 * fleckA;
        ctx.fillStyle = mat.golds[(Math.random() * mat.golds.length) | 0];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (let i = 0; i < 130; i++) {
        const x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 60);
        const r = (0.7 + Math.random() * 1.8) * fleckR;
        ctx.globalAlpha = (0.45 + Math.random() * 0.3) * fleckA;
        ctx.fillStyle = mat.golds[(Math.random() * mat.golds.length) | 0];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.random() * Math.PI);
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * (0.45 + Math.random() * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < 14; i++) {
        const x = 40 + Math.random() * (W - 80), y = 40 + Math.random() * (H - 80);
        ctx.globalAlpha = 0.6 * fleckA;
        ctx.fillStyle = mat.golds[(Math.random() * 2) | 0];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.random() * Math.PI);
        ctx.fillRect(0, 0, 3.5 + Math.random() * 4.5, 2 + Math.random() * 3.5);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1.0;

    // 5. 题签（竖排诗笺；磁青 = 描金签；素笺模式省略）
    if (!pure) {
      const parts = poem.text.split('，');
      const cols = parts.length;
      const maxChars = Math.max(...parts.map(s => s.length));
      const slipW = cols === 2 ? 108 : 66;
      const slipH = maxChars * 42 + 74;
      const sx = W - 56 - slipW, sy = 128;
      ctx.fillStyle = mat.slipBg;
      ctx.strokeStyle = mat.slipBorder;
      roundRect(ctx, sx, sy, slipW, slipH, 5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = mat.slipDot;
      ctx.beginPath();
      ctx.arc(sx + slipW / 2, sy + 16, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mat.inkText;
      ctx.font = '26px ' + SERIF;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const colXs = cols === 2 ? [sx + slipW * 0.72, sx + slipW * 0.28] : [sx + slipW / 2];
      parts.forEach((part, ci) => {
        const chars = part.split('');
        const startY = sy + 52;
        for (let k = 0; k < chars.length; k++) {
          ctx.fillText(chars[k], colXs[ci], startY + k * 42);
        }
      });
      ctx.font = '15px ' + SERIF;
      ctx.fillStyle = mat.poetColor;
      ctx.fillText(poem.poet, cols === 2 ? colXs[1] : colXs[0], sy + 52 + maxChars * 42 + 2);
    }

    // 6. 心相签（左上小竖签；随材质配色，磁青为描金签）
    if (!pure && mind && mind.name) {
      const nw = 58;
      const nh = 40 + mind.name.length * 30 + 16;
      const nx = 64, ny = 128;
      ctx.fillStyle = mat.slipBg;
      ctx.strokeStyle = mat.slipBorder;
      roundRect(ctx, nx, ny, nw, nh, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = mat.slipDot;
      ctx.beginPath();
      ctx.arc(nx + nw / 2, ny + 14, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '13px ' + SERIF;
      ctx.fillStyle = mat.inkDim;
      ctx.fillText('心相', nx + nw / 2, ny + 32);
      ctx.font = '600 22px ' + SERIF;
      ctx.fillStyle = mat.inkText;
      const mchars = mind.name.split('');
      mchars.forEach((ch, k) => {
        ctx.fillText(ch, nx + nw / 2, ny + 56 + k * 30);
      });
    }

    // 7. 朱砂印（右下：署名印/默认水影笺印）
    drawSeal(ctx, W - 132, H - 208, 86, sealName, mat);

    // 8. 编号与年款（素笺模式省略）
    if (!pure) {
      ctx.textAlign = 'left';
      ctx.font = '20px ' + SERIF;
      ctx.fillStyle = mat.numberColor;
      ctx.fillText('流沙笺 · 第 ' + number + ' 号', 48, H - 76);
      ctx.font = '14px ' + SERIF;
      ctx.fillStyle = mat.yearColor;
      ctx.fillText('丙午年 · 全球仅此一张', 48, H - 48);
    }

    // 9. 细框 + 暗角
    ctx.strokeStyle = mat.borderOuter;
    ctx.lineWidth = 1;
    ctx.strokeRect(24.5, 24.5, W - 49, H - 49);
    ctx.strokeStyle = mat.borderInner;
    ctx.strokeRect(32.5, 32.5, W - 65, H - 65);

    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    grad.addColorStop(0, 'rgba(60, 45, 25, 0)');
    grad.addColorStop(1, mat.vignette);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    return canvas;
  }

  function drawSeal(ctx, sx, sy, s, name, mat) {
    ctx.save();
    ctx.translate(sx + s / 2, sy + s / 2);
    ctx.rotate((Math.random() - 0.5) * 0.04);
    ctx.translate(-s / 2, -s / 2);
    ctx.fillStyle = mat.sealFace;
    roundRect(ctx, 0, 0, s, s, 7);
    ctx.fill();
    ctx.strokeStyle = mat.sealInner;
    ctx.lineWidth = 1.5;
    roundRect(ctx, 5.5, 5.5, s - 11, s - 11, 4);
    ctx.stroke();
    // 印文布局：按署名字数定（右起竖读）——全部系统宋体，任意用户名不发生字体回退
    const { chars, font, col3 } = sealChars(name);
    ctx.fillStyle = mat.sealText;
    ctx.font = 'bold ' + font + 'px ' + SEAL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (chars.length === 1) {
      ctx.fillText(chars[0], s * 0.5, s * 0.5);
    } else if (col3) {
      // 三字名：右列三名，左列「印」
      ctx.fillText(chars[0], s * 0.71, s * 0.2);
      ctx.fillText(chars[1], s * 0.71, s * 0.5);
      ctx.fillText(chars[2], s * 0.71, s * 0.8);
      ctx.fillText(chars[3], s * 0.29, s * 0.5);
    } else {
      ctx.fillText(chars[0], s * 0.71, s * 0.29);
      ctx.fillText(chars[1], s * 0.71, s * 0.71);
      ctx.fillText(chars[2], s * 0.29, s * 0.29);
      ctx.fillText(chars[3], s * 0.29, s * 0.71);
    }
    // 残缺感：边缘随机蚀刻
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
      const edge = (Math.random() * 4) | 0;
      let x, y;
      if (edge === 0) { x = Math.random() * s; y = Math.random() < 0.5 ? 0 : s; }
      else { y = Math.random() * s; x = Math.random() < 0.5 ? 0 : s; }
      ctx.globalAlpha = 0.25 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + Math.random() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { create, preloadTextures, W, H };
})();
