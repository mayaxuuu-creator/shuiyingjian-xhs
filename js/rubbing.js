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

  /* 汝窑开片（v3.2 花纸结构，K老师定稿）：开片纹直接绘制在纸底上（不是叠加层）
     铁线（主纹）2.0px 深褐 #6A5A4A；金丝（支纹）0.8px 淡金 #C8B888
     质感：分段手绘抖动（线宽/浓淡沿线变化），出"粗细不均的铁线"而非均匀描边 */
  function ruyaoTexture(ctx, W, H) {
    ctx.lineCap = 'round';
    // 一条裂纹：逐段绘制，每段线宽与浓淡微抖（手绘铁线的粗细不均）
    function crack(x, y, angle, len, seg, width, color) {
      let ax = angle;
      for (let i = 0; i < seg; i++) {
        ax += (Math.random() - 0.5) * 0.55;
        const nx = x + Math.cos(ax) * (len / seg);
        const ny = y + Math.sin(ax) * (len / seg);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.82 + Math.random() * 0.18;
        ctx.lineWidth = Math.max(0.4, width * (0.75 + Math.random() * 0.5));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        x = nx; y = ny;
      }
      ctx.globalAlpha = 1;
      return { x, y, a: ax };
    }
    const IRON = '#6A5A4A', GOLD = '#C8B888';
    // 铁线（主纹）：4~5 条纵贯
    const mains = [];
    const nMain = 4 + ((Math.random() * 2) | 0);
    for (let i = 0; i < nMain; i++) {
      const sx = W * (0.1 + 0.8 * ((i + Math.random() * 0.6) / nMain));
      mains.push(crack(sx, -20, Math.PI / 2 + (Math.random() - 0.5) * 0.5, H + 60, 22 + ((Math.random() * 10) | 0), 2.0, IRON));
    }
    // 金丝（支纹）：主纹中途 60°±25° 分叉
    for (let i = 0; i < mains.length * 4; i++) {
      const m = mains[i % mains.length];
      const bx = m.x * (0.25 + Math.random() * 0.5) + (Math.random() - 0.5) * 40;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const br = crack(bx, H * Math.random(), Math.PI / 2 + dir * (Math.PI / 3 + (Math.random() - 0.5) * 0.5), H * (0.14 + Math.random() * 0.22), 10, 0.8, GOLD);
      // 金丝细纹：再分叉一层
      for (let k = 0; k < 3; k++) {
        crack(br.x * Math.random(), br.y * Math.random() + H * 0.2, Math.random() * Math.PI, H * (0.06 + Math.random() * 0.09), 6, 0.8, GOLD);
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
    // ruyao 已改花纸结构（开片纹=纸底本身），不再走叠加层路径
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
      fleckR: 0.85,   // 磁青洒金 = 细小星子（v3.5 加大提亮：深青底上星子要看得见）
      fleckA: 0.9,
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

  /* 折扇只使用自己的 3:4 安全区；展开角收窄后，扇面横向不再触边。 */
  function foldingFanGeometry() {
    const cx = W / 2, cy = 836, r0 = 98, r1 = 430;
    const a0 = Math.PI * 1.125, a1 = Math.PI * 1.875;
    return {
      cx, cy, r0, r1, a0, a1,
      x: cx - r1 * Math.sin((a1 - a0) / 2) - 2,
      y: cy - r1,
      w: r1 * 2 * Math.sin((a1 - a0) / 2) + 4,
      h: r1 - r0,
      shape: 'fan',
    };
  }

  function fanPath(ctx, fan, inset) {
    const d = inset || 0;
    ctx.beginPath();
    ctx.arc(fan.cx, fan.cy, fan.r1 - d, fan.a0, fan.a1);
    ctx.arc(fan.cx, fan.cy, fan.r0 + d, fan.a1, fan.a0, true);
    ctx.closePath();
  }

  /* 扇面径向 UV：原图横轴映射展开角，纵轴映射扇骨半径。 */
  function drawFanLeafArtwork(ctx, source, fan) {
    if (!source || !source.width || !source.height) return;
    const cropW = Math.min(624, source.width);
    const cropH = Math.min(424, source.height);
    const sx = (source.width - cropW) / 2;
    const sy = (source.height - cropH) * .32;
    const tex = document.createElement('canvas');
    tex.width = cropW;
    tex.height = cropH;
    const tctx = tex.getContext('2d');
    tctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
    const src = tctx.getImageData(0, 0, cropW, cropH).data;

    const x0 = Math.max(0, Math.floor(fan.cx - fan.r1));
    const y0 = Math.max(0, Math.floor(fan.cy - fan.r1));
    const x1 = Math.min(W - 1, Math.ceil(fan.cx + fan.r1));
    const y1 = Math.min(H - 1, Math.ceil(fan.cy));
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const leaf = ctx.createImageData(bw, bh);
    const arc = fan.a1 - fan.a0;
    for (let y = 0; y < bh; y++) {
      const dy = y0 + y + .5 - fan.cy;
      for (let x = 0; x < bw; x++) {
        const dx = x0 + x + .5 - fan.cx;
        const dist = Math.hypot(dx, dy);
        if (dist < fan.r0 || dist > fan.r1) continue;
        let angle = Math.atan2(dy, dx);
        while (angle < fan.a0) angle += Math.PI * 2;
        if (angle > fan.a1) continue;
        const tx = Math.min(cropW - 1, (angle - fan.a0) / arc * (cropW - 1));
        const ty = Math.min(cropH - 1, (1 - (dist - fan.r0) / (fan.r1 - fan.r0)) * (cropH - 1));
        const si = ((ty | 0) * cropW + (tx | 0)) * 4;
        const di = (y * bw + x) * 4;
        leaf.data[di] = src[si];
        leaf.data[di + 1] = src[si + 1];
        leaf.data[di + 2] = src[si + 2];
        leaf.data[di + 3] = src[si + 3];
      }
    }

    const layer = document.createElement('canvas');
    layer.width = bw;
    layer.height = bh;
    layer.getContext('2d').putImageData(leaf, 0, 0);
    ctx.save();
    fanPath(ctx, fan, 1);
    ctx.clip();
    ctx.drawImage(layer, x0, y0);
    ctx.restore();
  }

  /* 盘内辅料：每盘最多两种白名单辅料，一次只选一种。
     v3.7 改为"器面处理"：少而大的实物颗粒 + 投影/高光，缩略图也要一眼可读 */
  function drawAuxiliary(ctx, W, H, aux, carrier) {
    if (!aux || !Array.isArray(aux.colors) || !aux.colors.length) return;
    const density = aux.density || 0.5;
    const clusterCount = Math.round(5 + density * 7);
    const isGold = aux.type === 'gold';
    const isMica = aux.type === 'mica';
    const region = carrier === 'fan'
      ? { x: 74, y: 114, w: 572, h: 572, cx: 360, cy: 400, r: 286, shape: 'circle' }
        : carrier === 'fanfold'
          ? foldingFanGeometry()
        : carrier === 'umbrella'
          ? { x: 84, y: 138, w: 552, h: 552, cx: 360, cy: 414, r: 276, shape: 'circle' }
        : carrier === 'porcelain'
          ? { x: 214, y: 212, w: 292, h: 636 }
      : carrier === 'bookmark'
        ? { x: 146, y: 44, w: 428, h: 952 }
        : { x: 42, y: 42, w: W - 84, h: H - 84 };
    const inside = (x, y) => region.shape === 'circle'
      ? ((x - region.cx) ** 2 + (y - region.cy) ** 2) <= (region.r - 16) ** 2
        : region.shape === 'fan'
          ? (() => {
              const dx = x - region.cx, dy = y - region.cy;
              const dist = Math.hypot(dx, dy);
              let angle = Math.atan2(dy, dx);
              while (angle < region.a0) angle += Math.PI * 2;
              return dist >= region.r0 + 14 && dist <= region.r1 - 14 &&
                angle >= region.a0 + 0.03 && angle <= region.a1 - 0.03;
            })()
      : x >= region.x + 12 && x <= region.x + region.w - 12 &&
        y >= region.y + 12 && y <= region.y + region.h - 12;

    for (let c = 0; c < clusterCount; c++) {
      const cx = region.x + 24 + Math.random() * (region.w - 48);
      const cy = region.y + 24 + Math.random() * (region.h - 48);
      if (!inside(cx, cy)) continue;
      const pieces = Math.round(9 + density * 8);
      for (let i = 0; i < pieces; i++) {
        const x = cx + (Math.random() - 0.5) * (94 + density * 46);
        const y = cy + (Math.random() - 0.5) * (94 + density * 46);
        if (!inside(x, y)) continue;
        const color = aux.colors[(Math.random() * aux.colors.length) | 0];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.random() * Math.PI);
        ctx.fillStyle = color;

        if (isGold) {
          const r = 2.4 + Math.random() * 4.0;
          ctx.globalAlpha = 0.58 + Math.random() * 0.34;
          ctx.shadowColor = 'rgba(48,26,4,.34)';
          ctx.shadowBlur = 2;
          ctx.shadowOffsetY = 1;
          ctx.beginPath();
          ctx.ellipse(0, 0, r * (1.15 + Math.random() * 0.45), r * (0.42 + Math.random() * 0.30), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.globalAlpha = 0.46 + Math.random() * 0.32;
          ctx.fillStyle = 'rgba(255,248,216,.82)';
          ctx.beginPath();
          ctx.ellipse(-r * .22, -r * .18, r * .40, r * .12, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (isMica) {
          const r = 2.0 + Math.random() * 3.6;
          ctx.globalAlpha = 0.36 + Math.random() * 0.36;
          ctx.shadowColor = 'rgba(16,20,26,.20)';
          ctx.shadowBlur = 2;
          ctx.shadowOffsetY = 1;
          ctx.beginPath();
          ctx.ellipse(0, 0, r * (1.25 + Math.random() * 0.45), r * (0.52 + Math.random() * 0.24), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.globalAlpha = 0.26 + Math.random() * 0.24;
          ctx.fillStyle = 'rgba(255,255,255,.72)';
          ctx.beginPath();
          ctx.ellipse(-r * .22, -r * .16, r * .42, r * .13, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const r = 2.0 + Math.random() * 3.4;
          ctx.globalAlpha = 0.42 + Math.random() * 0.32;
          ctx.shadowColor = 'rgba(30,22,12,.24)';
          ctx.shadowBlur = 2;
          ctx.shadowOffsetY = 1;
          ctx.beginPath();
          ctx.moveTo(-r, -.8 + Math.random() * 1.6);
          ctx.lineTo(r * .22, -r * .78);
          ctx.lineTo(r, -.5 + Math.random());
          ctx.lineTo(-r * .18, r * .82);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* 成器：同一张拓印可入笺、入团扇、入书签。
     不做简单裁图；每种载体重排器骨、边界与配件。 */
  function displayScene(ctx, warm) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    if (warm) {
      bg.addColorStop(0, '#f1eadb');
      bg.addColorStop(.56, '#dcd2bd');
      bg.addColorStop(1, '#b9ab93');
    } else {
      bg.addColorStop(0, '#e8e7de');
      bg.addColorStop(.58, '#cfd0c6');
      bg.addColorStop(1, '#9ea295');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .035;
    ctx.strokeStyle = warm ? '#4d3d2a' : '#3f4741';
    ctx.lineWidth = 1;
    for (let y = 28; y < H; y += 14) {
      ctx.beginPath(); ctx.moveTo(0, y + (y % 28) * .03); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let x = 24; x < W; x += 18) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 2, H); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const room = ctx.createRadialGradient(W * .5, H * .38, H * .18, W * .5, H * .52, H * .80);
    room.addColorStop(0, warm ? 'rgba(255,252,240,.20)' : 'rgba(248,251,245,.20)');
    room.addColorStop(.62, 'rgba(120,98,70,.05)');
    room.addColorStop(1, warm ? 'rgba(58,45,30,.38)' : 'rgba(45,56,50,.38)');
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, W, H);
  }

  function displayStand(ctx, x, y, w) {
    ctx.fillStyle = 'rgba(58,44,30,.24)';
    roundRect(ctx, x + 8, y + 16, w - 16, 34, 16);
    ctx.fill();
    const stand = ctx.createLinearGradient(x, 0, x + w, 0);
    stand.addColorStop(0, '#61472b');
    stand.addColorStop(.24, '#8a653c');
    stand.addColorStop(.52, '#c69a5d');
    stand.addColorStop(.78, '#8a653c');
    stand.addColorStop(1, '#574028');
    ctx.fillStyle = stand;
    roundRect(ctx, x, y, w, 36, 16);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,235,196,.20)';
    roundRect(ctx, x + 18, y + 7, w - 36, 6, 4);
    ctx.fill();
  }

  function drawFoldingFan(ctx, source) {
    displayScene(ctx, true);
    const fan = foldingFanGeometry();
    const { cx, cy, r0, r1, a0, a1 } = fan;
    ctx.save();
    ctx.filter = 'blur(24px)';
    ctx.fillStyle = 'rgba(48,36,24,.34)';
    ctx.translate(8, 36);
    fanPath(ctx, fan, 4);
    ctx.fill();
    ctx.restore();

    displayStand(ctx, 172, 936, 376);

    // 护骨与扇钉先入画，让扇面被实体结构托住。
    ctx.lineCap = 'round';
    [a0, a1].forEach(a => {
      ctx.strokeStyle = 'rgba(58,40,22,.88)';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 52, cy + Math.sin(a) * 52);
      ctx.lineTo(cx + Math.cos(a) * (r1 + 13), cy + Math.sin(a) * (r1 + 13));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(211,172,113,.92)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56);
      ctx.lineTo(cx + Math.cos(a) * (r1 + 11), cy + Math.sin(a) * (r1 + 11));
      ctx.stroke();
    });

    ctx.save();
    fanPath(ctx, fan);
    ctx.clip();
    ctx.fillStyle = '#f4e9d0';
    ctx.fillRect(cx - r1, cy - r1, r1 * 2, r1 * 2);
    drawFanLeafArtwork(ctx, source, fan);
    const leaf = ctx.createLinearGradient(0, cy - r1, 0, cy);
    leaf.addColorStop(0, 'rgba(255,252,236,.13)');
    leaf.addColorStop(.46, 'rgba(255,255,255,0)');
    leaf.addColorStop(.84, 'rgba(78,54,26,.05)');
    leaf.addColorStop(1, 'rgba(70,50,25,.20)');
    ctx.fillStyle = leaf;
    ctx.fillRect(cx - r1, cy - r1, r1 * 2, r1 * 2);
    for (let i = 0; i < 20; i++) {
      if (i % 2) {
        const sa = a0 + (a1 - a0) * i / 20;
        const ea = a0 + (a1 - a0) * (i + 1) / 20;
        ctx.fillStyle = 'rgba(74,52,27,.045)';
        ctx.beginPath();
        ctx.arc(cx, cy, r1, sa, ea);
        ctx.arc(cx, cy, r0, ea, sa, true);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (let i = 1; i < 20; i++) {
      const a = a0 + (a1 - a0) * i / 20;
      ctx.strokeStyle = i % 2 ? 'rgba(58,40,22,.19)' : 'rgba(255,246,218,.20)';
      ctx.lineWidth = i % 2 ? 1.1 : .8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(69,48,26,.60)';
    ctx.lineWidth = 3;
    fanPath(ctx, fan, -1);
    ctx.stroke();
    fanPath(ctx, fan, 1);
    ctx.stroke();
    ctx.fillStyle = '#43301c';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(227,193,138,.94)';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9d6a33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 9);
    ctx.quadraticCurveTo(cx + 13, cy + 45, cx - 3, cy + 76);
    ctx.stroke();
    ctx.fillStyle = '#a5382b';
    roundRect(ctx, cx - 9, cy + 73, 13, 28, 6);
    ctx.fill();
  }

  function drawUmbrella(ctx, source) {
    displayScene(ctx, false);
    const cx = 360, cy = 414, r = 278;
    ctx.save();
    ctx.filter = 'blur(20px)';
    ctx.fillStyle = 'rgba(42,54,48,.34)';
    ctx.beginPath();
    ctx.ellipse(cx + 16, cy + 38, r * 1.02, r * .96, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    displayStand(ctx, 216, 908, 288);
    const shaft = ctx.createLinearGradient(cx - 8, 0, cx + 8, 0);
    shaft.addColorStop(0, '#755532');
    shaft.addColorStop(.38, '#bd9055');
    shaft.addColorStop(.68, '#98703f');
    shaft.addColorStop(1, '#6a4c2c');
    ctx.fillStyle = shaft;
    roundRect(ctx, cx - 8, 648, 16, 268, 8);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#f5ecd8';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const crop = 536;
    ctx.drawImage(source, (source.width - crop) / 2, (source.height - crop) * .36, crop, crop,
      cx - r, cy - r, r * 2, r * 2);
    const oil = ctx.createRadialGradient(cx - r * .25, cy - r * .35, r * .08, cx, cy, r);
    oil.addColorStop(0, 'rgba(255,252,235,.16)');
    oil.addColorStop(.65, 'rgba(255,255,255,0)');
    oil.addColorStop(1, 'rgba(46,42,26,.24)');
    ctx.fillStyle = oil;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * 2 * i / 18;
      ctx.strokeStyle = 'rgba(76,55,27,.24)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,246,218,.09)';
    ctx.lineWidth = 7;
    for (let i = 0; i < 6; i++) {
      const rr = r * (0.22 + i * .14);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 伞裙与竹骨：顶视图也要看出“一把伞”，不是圆瓷盘。
    for (let i = 0; i < 36; i++) {
      const a = Math.PI * 2 * i / 36;
      ctx.fillStyle = 'rgba(72,54,28,.70)';
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3), 7, 3.4, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(49,36,20,.62)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(187,144,85,.58)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#7c5a34';
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#bb9055';
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,207,.36)';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function porcelainPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(322, 178);
    ctx.lineTo(398, 178);
    ctx.bezierCurveTo(402, 242, 394, 284, 366, 314);
    ctx.bezierCurveTo(464, 342, 518, 428, 516, 552);
    ctx.bezierCurveTo(514, 686, 448, 784, 384, 830);
    ctx.lineTo(336, 830);
    ctx.bezierCurveTo(272, 784, 206, 686, 204, 552);
    ctx.bezierCurveTo(202, 428, 256, 342, 354, 314);
    ctx.bezierCurveTo(326, 284, 318, 242, 322, 178);
    ctx.closePath();
  }

  function drawPorcelain(ctx, source) {
    displayScene(ctx, false);
    const base = ctx.createLinearGradient(0, 856, 0, 936);
    base.addColorStop(0, 'rgba(38,45,41,.32)');
    base.addColorStop(1, 'rgba(38,45,41,.08)');
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(366, 900, 186, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    displayStand(ctx, 218, 892, 296);

    // 瓷胎底釉：先给形，再让墨纹被釉色吃进去。
    porcelainPath(ctx);
    const glaze = ctx.createLinearGradient(218, 190, 516, 850);
    glaze.addColorStop(0, '#b9cfc5');
    glaze.addColorStop(.42, '#8fb3a7');
    glaze.addColorStop(.78, '#5f8a80');
    glaze.addColorStop(1, '#3f655d');
    ctx.fillStyle = glaze;
    ctx.fill();

    ctx.save();
    porcelainPath(ctx);
    ctx.clip();
    const crop = 520;
    ctx.globalAlpha = .52;
    ctx.drawImage(source, (source.width - crop) / 2, (source.height - crop) * .38, crop, crop,
      192, 188, 336, 656);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = '#7fa598';
    ctx.fillRect(180, 160, 360, 700);
    ctx.globalCompositeOperation = 'screen';
    const gloss = ctx.createLinearGradient(250, 210, 452, 812);
    gloss.addColorStop(0, 'rgba(255,255,248,.34)');
    gloss.addColorStop(.24, 'rgba(255,255,255,.05)');
    gloss.addColorStop(.58, 'rgba(255,255,255,0)');
    gloss.addColorStop(1, 'rgba(224,245,236,.16)');
    ctx.fillStyle = gloss;
    ctx.fillRect(180, 160, 360, 700);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const x = 210 + Math.random() * 300, y = 200 + Math.random() * 610;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (Math.random() - .5) * 54, y + (Math.random() - .5) * 36, x + (Math.random() - .5) * 78, y + (Math.random() - .5) * 55);
      ctx.stroke();
    }
    ctx.restore();

    porcelainPath(ctx);
    ctx.strokeStyle = 'rgba(37,61,55,.58)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#e8efe9';
    roundRect(ctx, 318, 160, 84, 28, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,85,77,.58)';
    ctx.lineWidth = 2.5;
    roundRect(ctx, 318, 160, 84, 28, 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(228,238,232,.86)';
    roundRect(ctx, 330, 822, 72, 22, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,85,77,.48)';
    ctx.lineWidth = 2;
    roundRect(ctx, 330, 822, 72, 22, 8);
    ctx.stroke();
    ctx.save();
    ctx.filter = 'blur(4px)';
    ctx.strokeStyle = 'rgba(255,255,255,.30)';
    ctx.lineWidth = 8;
    porcelainPath(ctx);
    ctx.stroke();
    ctx.restore();
  }

  function makeCarrier(source, carrier) {
    if (!source || carrier === 'sheet') return source;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    if (carrier === 'fanfold') {
      drawFoldingFan(ctx, source);
      return canvas;
    }
    if (carrier === 'umbrella') {
      drawUmbrella(ctx, source);
      return canvas;
    }
    if (carrier === 'porcelain') {
      drawPorcelain(ctx, source);
      return canvas;
    }

    if (carrier === 'fan') {
      const cx = W / 2;
      const cy = 400;
      const r = 288;

      // 器物投影与立架
      ctx.save();
      ctx.filter = 'blur(20px)';
      ctx.fillStyle = 'rgba(48,36,24,.36)';
      ctx.beginPath();
      ctx.ellipse(cx + 15, cy + 28, r * 1.02, r * 1.00, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const stand = ctx.createLinearGradient(170, 0, 550, 0);
      stand.addColorStop(0, '#61472b');
      stand.addColorStop(.24, '#8a653c');
      stand.addColorStop(.52, '#c69a5d');
      stand.addColorStop(.78, '#8a653c');
      stand.addColorStop(1, '#574028');
      ctx.fillStyle = 'rgba(58,44,30,.24)';
      roundRect(ctx, 180, 918, 376, 34, 16);
      ctx.fill();
      ctx.fillStyle = stand;
      roundRect(ctx, 172, 902, 376, 36, 16);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,235,196,.20)';
      roundRect(ctx, 190, 909, 340, 6, 4);
      ctx.fill();

      // 竹柄：上下渐细，带木纹与漆圈
      const handle = ctx.createLinearGradient(cx - 9, 0, cx + 9, 0);
      handle.addColorStop(0, '#7c5a34');
      handle.addColorStop(.34, '#c69a5d');
      handle.addColorStop(.66, '#a37543');
      handle.addColorStop(1, '#6b4b2b');
      ctx.fillStyle = handle;
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy + 182);
      ctx.lineTo(cx + 9, cy + 182);
      ctx.lineTo(cx + 6, 914);
      ctx.lineTo(cx - 6, 914);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(82,55,29,.42)';
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 5; i++) {
        const y = cy + 216 + i * 84;
        ctx.beginPath();
        ctx.moveTo(cx - 5 + (i % 2), y);
        ctx.quadraticCurveTo(cx + 2, y + 22, cx - 2, y + 52);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(51,36,22,.62)';
      roundRect(ctx, cx - 10, cy + 178, 20, 13, 6);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const crop = 548;
      ctx.drawImage(source, (source.width - crop) / 2, (source.height - crop) * .40, crop, crop, cx - r, cy - r, r * 2, r * 2);
      const face = ctx.createRadialGradient(cx - r * .24, cy - r * .34, r * .12, cx, cy, r);
      face.addColorStop(0, 'rgba(255,250,235,.08)');
      face.addColorStop(.72, 'rgba(255,255,255,0)');
      face.addColorStop(1, 'rgba(42,28,14,.24)');
      ctx.fillStyle = face;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // 隐约竹丝：保留画面主纹，只给绢面一点方向感
      ctx.globalAlpha = .035;
      ctx.strokeStyle = '#4a3825';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + .12 + i * (Math.PI / 9);
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * .32);
        ctx.quadraticCurveTo(cx + Math.cos(a) * r * .70, cy + Math.sin(a) * r * .70, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      rim.addColorStop(0, '#8a653c');
      rim.addColorStop(.25, '#d0a263');
      rim.addColorStop(.54, '#7b5a35');
      rim.addColorStop(.80, '#b8894f');
      rim.addColorStop(1, '#63472a');
      ctx.lineWidth = 21;
      ctx.strokeStyle = 'rgba(45,31,17,.42)';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 16;
      ctx.strokeStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,232,190,.42)';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 11, Math.PI * 1.08, Math.PI * 1.86);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(232,206,142,.88)';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.stroke();

      // 流苏
      ctx.strokeStyle = '#9d6a33';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, 906);
      ctx.quadraticCurveTo(cx + 16, 938, cx - 4, 966);
      ctx.stroke();
      ctx.fillStyle = '#a5382b';
      roundRect(ctx, cx - 10, 962, 14, 31, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(246,224,196,.20)';
      roundRect(ctx, cx - 7, 967, 4, 21, 3);
      ctx.fill();
      return canvas;
    }

    if (carrier === 'bookmark') {
      ctx.fillStyle = '#ece7d8';
      ctx.fillRect(0, 0, W, H);
      const x = 146;
      const y = 44;
      const w = 428;
      const h = 952;
      const radius = 22;
      ctx.save();
      roundRect(ctx, x, y, w, h, radius);
      ctx.clip();
      const cropW = 398;
      const cropH = 920;
      ctx.drawImage(source, (source.width - cropW) / 2, (source.height - cropH) / 2, cropW, cropH, x, y, w, h);
      ctx.restore();

      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(74,64,52,.52)';
      roundRect(ctx, x, y, w, h, radius);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(201,169,97,.72)';
      roundRect(ctx, x + 8, y + 8, w - 16, h - 16, radius - 7);
      ctx.stroke();

      ctx.fillStyle = '#f6f1e2';
      ctx.strokeStyle = 'rgba(74,64,52,.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + 52, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(126,94,51,.58)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + h - 6);
      ctx.lineTo(x + w / 2, y + h + 22);
      ctx.stroke();
      ctx.fillStyle = '#a5382b';
      roundRect(ctx, x + w / 2 - 4, y + h + 22, 8, 36, 4);
      ctx.fill();
      return canvas;
    }

    return source;
  }

  function applyAuxiliary(target, auxiliary, carrier) {
    if (!target || !auxiliary) return;
    drawAuxiliary(target.getContext('2d'), target.width, target.height, auxiliary, carrier);
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

    // 1. 纸底：花纸套装（敦煌）用生图整幅做纸底（100% 呈现）；其余用套装声明的纸色（palette.paper），
    //    未声明时回落材质默认（宣纸 #f6efdc / 磁青 #0e162e）——汝窑天青 #A8C4C0 即由此接线
    const cssRGB = a => 'rgb(' + Math.round(a[0] * 255) + ',' + Math.round(a[1] * 255) + ',' + Math.round(a[2] * 255) + ')';
    const paperImgs = (opts.paperImg || []).map(s => TEXTURE_CACHE[s]).filter(Boolean);
    if (paperImgs.length) {
      const img = paperImgs[(Math.random() * paperImgs.length) | 0];
      const scale = Math.max(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * scale) / 2, (H - img.height * scale) / 2, img.width * scale, img.height * scale);
    } else {
      ctx.fillStyle = opts.paper ? cssRGB(opts.paper) : mat.paper;
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
    // 2.5 底纹：敦煌=三层拆分（裂纹层沉纸底，花纸模式下跳过）；汝窑=花纸开片（直接绘制在纸底上，实色）
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
    } else if (opts.suite === 'ruyao') {
      ruyaoTexture(ctx, W, H);   // 花纸结构：开片纹=纸底本身（铁线 2.0 深褐 + 金丝 0.8 淡金）
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
      const n = pattern === 'guiyu' ? 12 + ((Math.random() * 6) | 0) : 7 + ((Math.random() * 5) | 0);   // v3.5 加密：桂花在深青底上要数得出来
      for (let i = 0; i < n; i++) {
        const fx = 60 + Math.random() * (W - 120);
        const fy = H * 0.12 + Math.random() * H * 0.55;
        const fs = (pattern === 'guiyu' ? 5.0 : 4.4) + Math.random() * 2.6;   // 比星子大且亮（v3.5 加大）
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
    } else if (!paperImgs.length && opts.suite !== 'ruyao') {
      // 汝窑花纸结构无透墨层（K老师定稿：单层纸底）；此分支仅保留给未花纸化的套装
      drawSuiteTexture(ctx, opts.suite, W, H, 0.5, true, opts.texMode);
    }

    // 4. 洒金（宣纸=满铺金箔；磁青=星子聚类——簇状散布，去均匀噪点感）
    const fleckR = mat.fleckR || 1, fleckA = mat.fleckA || 1;
    if (mat.goldDust) {
      // 聚类生成：9~12 个簇心（v3.5 加密），每簇 3~8 片金箔，簇外稀疏
      const centers = [];
      const nc = 9 + ((Math.random() * 4) | 0);
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
      // 簇外散星（稀疏；v3.5 26→44 颗）
      for (let i = 0; i < 44; i++) {
        const x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 60);
        const r = 0.6 + Math.random() * 1.1;
        ctx.globalAlpha = 0.3 * fleckA;
        ctx.fillStyle = mat.golds[(Math.random() * mat.golds.length) | 0];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // v3.5 洒金加密：青绿/松烟/敦煌满铺密度 ×1.9（用户反馈点缀太少）；汝窑保持原密度（未提出此问题）
      const boost = (opts.suite === 'qinglv' || opts.suite === 'shui' || opts.suite === 'dunhuang') ? 1.9 : 1;
      const sizeK = boost > 1 ? 1.15 : 1;
      for (let i = 0; i < Math.round(130 * boost); i++) {
        const x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 60);
        const r = (0.7 + Math.random() * 1.8) * fleckR * sizeK;
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
      for (let i = 0; i < Math.round(14 * boost); i++) {
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

    // 4.5 盘内辅料：纸上轻撒，不进入流体池；一次只叠加一种，保持画面干净
    drawAuxiliary(ctx, W, H, opts.auxiliary);

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

  return { create, makeCarrier, applyAuxiliary, preloadTextures, W, H };
})();
