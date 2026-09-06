/* 水影笺 · 覆纸拓印（Canvas 2D 二次渲染）
   输入：流体引擎导出的拓印像素 → 输出：720×1040 成笺
   v2.0：材质包（宣纸/磁青）· 素笺模式 · 署名印 · 诗句由外部传入（心相配诗）
   零外部素材，全部程序绘制（版权安全 + 小红书容器离线合规） */

window.RUBBING = (function () {
  'use strict';

  const W = 720, H = 1040;
  const SERIF = '"WenKai", "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", serif';

  /* 材质包：拓印载体各自的纸底/纤维/文字/框线配色与混合语义
     xuanzhi = 暖宣纸（墨为减光颜料，multiply 正片叠底）
     ciqing  = 磁青纸（颜料为月白粉/泥金粉，screen 滤色——银粉浮于蓝绢） */
  const MATERIALS = {
    xuanzhi: {
      blend: 'multiply',
      blendAlpha: 0.94,
      moonR: 0,
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

    // 1. 纸底
    ctx.fillStyle = mat.paper;
    ctx.fillRect(0, 0, W, H);

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
    // 印文布局：按署名字数定（右起竖读）
    const { chars, font, col3 } = sealChars(name);
    ctx.fillStyle = mat.sealText;
    ctx.font = 'bold ' + font + 'px ' + SERIF;
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

  return { create, W, H };
})();
