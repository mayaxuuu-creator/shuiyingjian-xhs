/* 水影笺 · 覆纸拓印（Canvas 2D 二次渲染）
   输入：流体引擎导出的"暖宣纸底"像素 → 输出：720×1040 成笺
   构成：宣纸底+纤维 → 墨纹 multiply 吸附 → 洒金 → 题签(唐诗+落款)
        → 心相签 → 朱砂印(程序残缺) → 编号 → 暗角细框
   零外部素材，全部程序绘制（版权安全 + 小红书容器离线合规） */

window.RUBBING = (function () {
  'use strict';

  const W = 720, H = 1040;
  // 首选内置楷体（拓印文字更贴手抄笺感），未就绪时回退系统宋体
  const SERIF = '"WenKai", "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", serif';

  // 唐人名句（公版），逗号分双列
  const POEMS = [
    { text: '秋水共长天一色', poet: '王勃' },
    { text: '春来江水绿如蓝', poet: '白居易' },
    { text: '春江潮水连海平', poet: '张若虚' },
    { text: '江碧鸟逾白，山青花欲燃', poet: '杜甫' },
    { text: '明月松间照，清泉石上流', poet: '王维' },
    { text: '月落乌啼霜满天，江枫渔火对愁眠', poet: '张继' },
    { text: '孤帆远影碧空尽，唯见长江天际流', poet: '李白' },
    { text: '日照香炉生紫烟，遥看瀑布挂前川', poet: '李白' },
  ];
  window.RUBBING_POEMS = POEMS;

  function create(opts) {
    const pixels = opts.pixels;               // { data, width, height }
    const number = opts.number;
    const poem = POEMS[number % POEMS.length];
    const mind = opts.mind;                   // { name, line } 心相读墨

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. 宣纸底
    ctx.fillStyle = '#f6efdc';
    ctx.fillRect(0, 0, W, H);

    // 2. 纸纤维：细噪点 + 长短纤维丝
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      ctx.fillStyle = Math.random() > 0.5
        ? `rgba(122, 98, 62, ${Math.random() * 0.05})`
        : `rgba(255, 252, 242, ${Math.random() * 0.07})`;
      ctx.fillRect(x, y, Math.random() > 0.8 ? 2 : 1, 1);
    }
    ctx.strokeStyle = 'rgba(120, 96, 60, 0.035)';
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

    // cover 裁切铺满
    const scale = Math.max(W / pw, H / ph);
    const dw = pw * scale, dh = ph * scale;
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.94;
    ctx.drawImage(temp, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // 4. 洒金（密一点、亮一点，压得住花哨的墨纹）
    const golds = ['#c9a227', '#d9b64a', '#b8912f', '#e8ca6b'];
    for (let i = 0; i < 130; i++) {
      const x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 60);
      const r = 1.0 + Math.random() * 3.0;
      ctx.globalAlpha = 0.6 + Math.random() * 0.38;
      ctx.fillStyle = golds[(Math.random() * golds.length) | 0];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * (0.45 + Math.random() * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 14; i++) {   // 大金片
      const x = 40 + Math.random() * (W - 80), y = 40 + Math.random() * (H - 80);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = golds[(Math.random() * 2) | 0];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillRect(0, 0, 3.5 + Math.random() * 4.5, 2 + Math.random() * 3.5);
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;

    // 5. 题签（竖排诗笺）
    const parts = poem.text.split('，');
    const cols = parts.length;                 // 1 或 2 列
    const maxChars = Math.max(...parts.map(s => s.length));
    const slipW = cols === 2 ? 108 : 66;
    const slipH = maxChars * 42 + 74;
    const sx = W - 56 - slipW, sy = 128;
    // 签纸
    ctx.fillStyle = 'rgba(246, 239, 220, 0.9)';
    ctx.strokeStyle = 'rgba(74, 64, 52, 0.45)';
    roundRect(ctx, sx, sy, slipW, slipH, 5);
    ctx.fill(); ctx.stroke();
    // 上签头小圆孔装饰
    ctx.fillStyle = 'rgba(165, 50, 42, 0.85)';
    ctx.beginPath();
    ctx.arc(sx + slipW / 2, sy + 16, 3.2, 0, Math.PI * 2);
    ctx.fill();
    // 诗句
    ctx.fillStyle = '#2e2a24';
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
    // 诗人落款
    ctx.font = '15px ' + SERIF;
    ctx.fillStyle = 'rgba(46, 42, 36, 0.62)';
    ctx.fillText(poem.poet, cols === 2 ? colXs[1] : colXs[0], sy + 52 + maxChars * 42 + 2);

    // 6. 心相签（左上小竖签：墨纹读出的名字）
    if (mind && mind.name) {
      const nw = 58;
      const nh = 40 + mind.name.length * 30 + 16;
      const nx = 64, ny = 128;
      ctx.fillStyle = 'rgba(246, 239, 220, 0.88)';
      ctx.strokeStyle = 'rgba(74, 64, 52, 0.4)';
      roundRect(ctx, nx, ny, nw, nh, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(165, 50, 42, 0.85)';
      ctx.beginPath();
      ctx.arc(nx + nw / 2, ny + 14, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '13px ' + SERIF;
      ctx.fillStyle = 'rgba(46, 42, 36, 0.55)';
      ctx.fillText('心相', nx + nw / 2, ny + 32);
      ctx.font = '600 22px ' + SERIF;
      ctx.fillStyle = '#2e2a24';
      const mchars = mind.name.split('');
      mchars.forEach((ch, k) => {
        ctx.fillText(ch, nx + nw / 2, ny + 56 + k * 30);
      });
    }

    // 7. 朱砂印（右下，程序做残缺边）
    drawSeal(ctx, W - 132, H - 208, 86);

    // 8. 编号与年款（左下）
    ctx.textAlign = 'left';
    ctx.font = '20px ' + SERIF;
    ctx.fillStyle = 'rgba(74, 64, 52, 0.8)';
    ctx.fillText('流沙笺 · 第 ' + number + ' 号', 48, H - 76);
    ctx.font = '14px ' + SERIF;
    ctx.fillStyle = 'rgba(74, 64, 52, 0.55)';
    ctx.fillText('丙午年 · 全球仅此一张', 48, H - 48);

    // 9. 细框 + 暗角
    ctx.strokeStyle = 'rgba(74, 64, 52, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(24.5, 24.5, W - 49, H - 49);
    ctx.strokeStyle = 'rgba(74, 64, 52, 0.25)';
    ctx.strokeRect(32.5, 32.5, W - 65, H - 65);

    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    grad.addColorStop(0, 'rgba(60, 45, 25, 0)');
    grad.addColorStop(1, 'rgba(60, 45, 25, 0.11)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    return canvas;
  }

  function drawSeal(ctx, sx, sy, s) {
    ctx.save();
    ctx.translate(sx + s / 2, sy + s / 2);
    ctx.rotate((Math.random() - 0.5) * 0.04);
    ctx.translate(-s / 2, -s / 2);
    // 印面
    ctx.fillStyle = 'rgba(158, 42, 32, 0.92)';
    roundRect(ctx, 0, 0, s, s, 7);
    ctx.fill();
    // 内框
    ctx.strokeStyle = 'rgba(246, 239, 220, 0.5)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 5.5, 5.5, s - 11, s - 11, 4);
    ctx.stroke();
    // 印文：右列 水影，左列 笺印（右起竖读）
    ctx.fillStyle = 'rgba(246, 239, 220, 0.95)';
    ctx.font = 'bold 30px ' + SERIF;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('水', s * 0.71, s * 0.29);
    ctx.fillText('影', s * 0.71, s * 0.71);
    ctx.fillText('笺', s * 0.29, s * 0.29);
    ctx.fillText('印', s * 0.29, s * 0.71);
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
