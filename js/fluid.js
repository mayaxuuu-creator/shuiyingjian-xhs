/* 水影笺 · WebGL 流体引擎
   基于 Navier-Stokes 稳定流体（Jos Stam）+ 涡量约束
   管线参照 Pavel Dobryakov / WebGL-Fluid-Simulation（MIT）重写：
   Splat → Advection(vel) → Curl → Vorticity → Divergence
        → Pressure(Jacobi) → GradientSubtract → Advection(dye) → Display
   差异化：深色墨池渲染 + 拓印导出（同一 dye 两次色调映射）+ 纹样调度队列 */

window.FLUID = (function () {
  'use strict';

  const canvas = document.getElementById('pool');

  const config = {
    SIM_RESOLUTION: 144,
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 0.055,   // 墨迹保留（越小越持久，0.055 ≈ 每秒淡 ~5%）
    VELOCITY_DISSIPATION: 0.42,   // 水流衰减
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 24,
    CURL: 11,                     // 涡旋感：青绿 11 / 松烟 7（setTheme 时切换）
    SPLAT_RADIUS: 0.21,
    SPLAT_FORCE: 5200,
    TIME_STEP: 0.016,
    PAUSED: false,
  };

  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (isCoarse || Math.min(screen.width, screen.height) < 700) {
    config.SIM_RESOLUTION = 112;
    config.DYE_RESOLUTION = 640;
    config.PRESSURE_ITERATIONS = 20;
  }

  // ---------- WebGL 上下文（WebGL2 优先，WebGL1 + half float 兜底） ----------
  const params = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
  let gl = canvas.getContext('webgl2', params);
  const isWebGL2 = !!gl;
  if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

  let halfFloat, supportLinearFiltering;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
  }
  const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat ? halfFloat.HALF_FLOAT_OES : gl.UNSIGNED_BYTE);

  function getSupportedFormat(internalFormat, format, type) {
    if (!supportRenderTextureFormat(internalFormat, format, type)) {
      if (!isWebGL2) return { internalFormat: gl.RGBA, format: gl.RGBA };
      switch (internalFormat) {
        case gl.R16F:  return getSupportedFormat(gl.RG16F, gl.RG, type);
        case gl.RG16F: return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
        default: return null;
      }
    }
    return { internalFormat, format };
  }
  function supportRenderTextureFormat(internalFormat, format, type) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }

  const formatRGBA = getSupportedFormat(isWebGL2 ? gl.RGBA16F : gl.RGBA, gl.RGBA, halfFloatTexType);
  const formatRG   = isWebGL2 ? (getSupportedFormat(gl.RG16F, gl.RG, halfFloatTexType) || formatRGBA) : formatRGBA;
  const formatR    = isWebGL2 ? (getSupportedFormat(gl.R16F, gl.RED, halfFloatTexType) || formatRGBA) : formatRGBA;

  // ---------- Shader 编译 ----------
  function compileShader(type, source, keywords) {
    if (keywords) source = keywords.map(k => '#define ' + k + '\n').join('') + source;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(shader));
    return shader;
  }
  function createProgram(vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      console.error(gl.getProgramInfoLog(program));
    return program;
  }
  function getUniforms(program) {
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i).name;
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return uniforms;
  }
  class Program {
    constructor(vs, fs) {
      this.program = createProgram(vs, fs);
      this.uniforms = getUniforms(this.program);
    }
    bind() { gl.useProgram(this.program); }
  }

  // ---------- 全屏 quad ----------
  const blit = (function () {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    return (target) => {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  })();

  // ---------- Shader 源码 ----------
  const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`);

  const copyShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; uniform sampler2D uTexture;
    void main () { gl_FragColor = texture2D(uTexture, vUv); }`);

  const clearShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`);

  const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; uniform sampler2D uTarget;
    uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
    void main () {
      vec2 p = vUv - point.xy;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }`);

  const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity; uniform sampler2D uSource;
    uniform vec2 texelSize; uniform vec2 dyeTexelSize;
    uniform float dt; uniform float dissipation;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5;
      vec2 iuv = floor(st); vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }
    void main () {
    #ifdef MANUAL_FILTERING
      vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
      vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result = texture2D(uSource, coord);
    #endif
      float decay = 1.0 + dissipation * dt;
      gl_FragColor = result / decay;
    }`, supportLinearFiltering ? null : ['MANUAL_FILTERING']);

  const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) { L = -C.x; }
      if (vR.x > 1.0) { R = -C.x; }
      if (vT.y > 1.0) { T = -C.y; }
      if (vB.y < 0.0) { B = -C.y; }
      float div = 0.5 * (R - L + T - B);
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }`);

  const curlShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      float vorticity = R - L - T + B;
      gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }`);

  const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uVelocity; uniform sampler2D uCurl;
    uniform float curl; uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity += force * dt;
      velocity = min(max(velocity, -1000.0), 1000.0);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }`);

  const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure; uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float divergence = texture2D(uDivergence, vUv).x;
      float pressure = (L + R + B + T - divergence) * 0.25;
      gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }`);

  const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure; uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity.xy -= vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }`);

  /* 显示 shader：两种模式
     uPigment=0 → 墨池：颜料在深水中（加色发光感）
     uPigment=1 → 拓印：色相保持模型（色相看比例、深浅看浓度），
                  蓝+绿相叠出深青（不糊成黑），补色相遇变深灰（不出粉紫） */
  const displayShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec3 uPaper;
    uniform float uGain;
    uniform float uShimmer;
    uniform float uTime;
    uniform float uVignette;
    uniform float uFiber;
    uniform float uPigment;
    float hash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main () {
      vec3 dye = texture2D(uTexture, vUv).rgb;
      vec3 col;
      float density;
      if (uPigment > 0.5) {
        float total = dye.r + dye.g + dye.b;
        vec3 chroma = dye / max(total, 1e-4);
        float brightness = 0.22 + 0.78 * exp(-total * 1.1);
        col = chroma * brightness * 1.3;
        density = total;
      } else {
        float lum = dot(dye, vec3(0.299, 0.587, 0.114));
        col = dye * (1.0 / (1.0 + 0.22 * lum));   // 轻压高光，重叠不发白
        density = max(col.r, max(col.g, col.b)) * uGain;
      }
      float coverage = uPigment > 0.5
        ? smoothstep(0.06, 0.55, density)
        : smoothstep(0.02, 0.30, density);
      vec3 paper = uPaper;
      paper += (hash(floor(vUv * vec2(640.0))) - 0.5) * uFiber;
      float sh = sin(vUv.x * 44.0 + uTime * 0.6) * cos(vUv.y * 36.0 - uTime * 0.45);
      paper += sh * 0.006 * uShimmer;
      vec3 ink = uPigment > 0.5 ? col : col + paper * 0.08;
      vec3 outc = mix(paper, ink, coverage);
      vec2 c = vUv - 0.5;
      outc *= 1.0 - dot(c, c) * uVignette;
      gl_FragColor = vec4(outc, 1.0);
    }`);

  const copyProgram    = new Program(baseVertexShader, copyShader);
  const clearProgram   = new Program(baseVertexShader, clearShader);
  const splatProgram   = new Program(baseVertexShader, splatShader);
  const advectionProgram = new Program(baseVertexShader, advectionShader);
  const divergenceProgram = new Program(baseVertexShader, divergenceShader);
  const curlProgram    = new Program(baseVertexShader, curlShader);
  const vorticityProgram = new Program(baseVertexShader, vorticityShader);
  const pressureProgram = new Program(baseVertexShader, pressureShader);
  const gradienSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);
  const displayProgram = new Program(baseVertexShader, displayShader);

  // ---------- FBO ----------
  function createFBO(w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture, fbo, width: w, height: h,
      texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }
  function createDoubleFBO(w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);
    return {
      width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
      get read() { return fbo1; }, set read(v) { fbo1 = v; },
      get write() { return fbo2; }, set write(v) { fbo2 = v; },
      swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
    };
  }
  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
    return { width: min, height: max };
  }

  let dye, velocity, divergence, curl, pressure;
  function initFramebuffers() {
    const simRes = getResolution(config.SIM_RESOLUTION);
    const dyeRes = getResolution(config.DYE_RESOLUTION);
    const texType = halfFloatTexType;
    const rgba = formatRGBA, rg = formatRG, r = formatR;
    const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);
    dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      return true;
    }
    return false;
  }

  // ---------- 主题 ----------
  const theme = { key: 'qinglv', pool: [0.05, 0.085, 0.09], gain: 1.0, shimmer: 1.0, curl: config.CURL, fiber: 0.028 };
  function setTheme(palette) {
    theme.key = palette.key;
    theme.pool = palette.pool;
    theme.shimmer = palette.shimmer;
    theme.curl = palette.key === 'shui' ? 6 : 9;
    theme.fiber = palette.key === 'shui' ? 0.02 : 0.028;
    config.CURL = theme.curl;
  }

  // ---------- Splat ----------
  let aspectRatio = 1;
  function correctRadius(radius) {
    if (aspectRatio > 1) radius *= aspectRatio;
    return radius;
  }
  function splat(x, y, dx, dy, color, radiusScale) {
    // x,y 以画面左上为原点（0~1），内部转 GL 坐标
    const gx = x, gy = 1.0 - y;
    const radius = correctRadius(config.SPLAT_RADIUS / 100.0 * (radiusScale || 1.0));
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, aspectRatio);
    gl.uniform2f(splatProgram.uniforms.point, gx, gy);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, radius);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color[0], color[1], color[2]);
    blit(dye.write);
    dye.swap();
  }

  // 纹样/脚本化墨水队列：{ delay, x, y, dx, dy, color, radius }
  const scriptQueue = [];
  function queue(events) {
    const t0 = performance.now();
    for (const e of events) scriptQueue.push({ ...e, t: t0 + (e.delay || 0) });
  }

  // ---------- 指针 ----------
  function pointerPrototype() {
    return { id: -1, texcoordX: 0, texcoordY: 0, prevTexcoordX: 0, prevTexcoordY: 0, deltaX: 0, deltaY: 0, down: false, moved: false, holdTime: 0 };
  }
  const pointers = [pointerPrototype()];
  let currentInk = [0.3, 0.9, 1.0];

  function setInk(rgb) {
    // 归一化到最大分量，保证深色墨也有足够注入亮度
    const m = Math.max(rgb[0], rgb[1], rgb[2]) || 1;
    let s = rgb[3] || 0.78;   // rgb[3] 可选强度
    if (theme.key === 'shui') s *= 0.6;   // 淡色入黑水，防过曝
    currentInk = [rgb[0] / m * s, rgb[1] / m * s, rgb[2] / m * s];
  }

  function correctDeltaX(delta) { if (aspectRatio < 1) delta *= aspectRatio; return delta; }
  function correctDeltaY(delta) { if (aspectRatio > 1) delta /= aspectRatio; return delta; }

  function updatePointerDownData(pointer, id, posX, posY) {
    pointer.id = id; pointer.down = true; pointer.moved = false; pointer.holdTime = 0;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0; pointer.deltaY = 0;
  }
  function updatePointerMoveData(pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    const posX = e.offsetX * (canvas.width / canvas.clientWidth);
    const posY = e.offsetY * (canvas.height / canvas.clientHeight);
    updatePointerDownData(pointers[0], e.pointerId, posX, posY);
    // 点击滴墨：落笔即注一滴（快速点按不会触发拖拽/长按两条路径，必须在这里落墨）
    splat(posX / canvas.width, posY / canvas.height, 0, 0,
      [currentInk[0], currentInk[1], currentInk[2]], 1.0);
    document.dispatchEvent(new CustomEvent('pool-touch'));
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers[0];
    if (!p.down) return;
    updatePointerMoveData(p, e.offsetX * (canvas.width / canvas.clientWidth), e.offsetY * (canvas.height / canvas.clientHeight));
  });
  window.addEventListener('pointerup', () => { pointers[0].down = false; });
  window.addEventListener('pointercancel', () => { pointers[0].down = false; });

  function applyInputs(dt) {
    // 指针：滑动吹墨（速度 + 墨）
    const p = pointers[0];
    if (p.down) {
      p.holdTime += dt;
      if (p.moved) {
        p.moved = false;
        const strength = Math.min(1.0, 2.2 * Math.hypot(p.deltaX, p.deltaY) + 0.25);
        splat(p.texcoordX, 1.0 - p.texcoordY, p.deltaX * config.SPLAT_FORCE, p.deltaY * config.SPLAT_FORCE, [
          currentInk[0] * strength, currentInk[1] * strength, currentInk[2] * strength,
        ]);
      }
      // 按住不动 = 墨从笔尖持续渗出（画墨线/养墨滴）
      if (p.holdTime > 0.35) {
        const bleed = 0.16;
        splat(p.texcoordX, 1.0 - p.texcoordY, 0, 0, [currentInk[0] * bleed, currentInk[1] * bleed, currentInk[2] * bleed], 0.55);
      }
    }
    // 脚本队列（纹样保底）
    const now = performance.now();
    for (let i = scriptQueue.length - 1; i >= 0; i--) {
      const e = scriptQueue[i];
      if (e.t <= now) {
        splat(e.x, e.y, e.dx, e.dy, e.color, e.radius || 1.0);
        scriptQueue.splice(i, 1);
      }
    }
  }

  // ---------- 模拟步进 ----------
  function step(dt) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradienSubtractProgram.bind();
    gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  // ---------- 渲染 ----------
  let time = 0;
  function render(target, paperOverride, vignette) {
    displayProgram.bind();
    gl.uniform2f(displayProgram.uniforms.texelSize, 1.0 / (target ? target.width : gl.drawingBufferWidth), 1.0 / (target ? target.height : gl.drawingBufferHeight));
    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
    const paper = paperOverride || theme.pool;
    gl.uniform3f(displayProgram.uniforms.uPaper, paper[0], paper[1], paper[2]);
    gl.uniform1f(displayProgram.uniforms.uGain, theme.gain);
    gl.uniform1f(displayProgram.uniforms.uShimmer, paperOverride ? 0.0 : theme.shimmer);
    gl.uniform1f(displayProgram.uniforms.uTime, time);
    gl.uniform1f(displayProgram.uniforms.uVignette, vignette !== undefined ? vignette : (paperOverride ? 0.0 : 0.25));
    gl.uniform1f(displayProgram.uniforms.uFiber, paperOverride ? 0.006 : theme.fiber);
    gl.uniform1f(displayProgram.uniforms.uPigment, paperOverride ? 1.0 : 0.0);
    blit(target);
  }

  // ---------- 拓印导出：把 dye 以暖宣纸底渲到 8bit FBO 再读像素 ----------
  let readFBO = null, readPixelsBuf = null;
  function getPixels() {
    const w = dye.read.width, h = dye.read.height;
    if (!readFBO || readFBO.width !== w || readFBO.height !== h) {
      if (readFBO) { gl.deleteFramebuffer(readFBO.fbo); gl.deleteTexture(readFBO.texture); }
      const internalFormat = isWebGL2 ? gl.RGBA8 : gl.RGBA;
      readFBO = createFBO(w, h, internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      readPixelsBuf = new Uint8Array(w * h * 4);
    }
    render(readFBO, FLUID.paperForPrint, 0.0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, readFBO.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, readPixelsBuf);
    return { data: readPixelsBuf, width: w, height: h };
  }

  function clear() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    const targets = [dye, velocity, pressure];
    for (const t of targets) {
      for (const f of [t.read, t.write]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
        gl.viewport(0, 0, f.width, f.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
    scriptQueue.length = 0;
  }

  // ---------- 主循环 ----------
  let lastUpdateTime = performance.now();
  function calcDeltaTime() {
    const now = performance.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.0166);
    lastUpdateTime = now;
    return dt;
  }

  function updateFrame() {
    const dt = calcDeltaTime();
    if (resizeCanvas()) {
      aspectRatio = canvas.width / canvas.height;
      initFramebuffers();
    }
    time += dt;
    if (!config.PAUSED) {
      applyInputs(dt);
      step(dt);
    }
    render(null);
    requestAnimationFrame(updateFrame);
  }

  resizeCanvas();
  aspectRatio = canvas.width / canvas.height;
  initFramebuffers();
  requestAnimationFrame(updateFrame);

  // WebGL 上下文丢失（低端机/后台回收）→ 整页刷新自愈
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setTimeout(() => location.reload(), 300);
  });

  window.FLUID = {
    config,
    setInk,
    setTheme,
    queue,
    clear,
    getPixels,
    pause() { config.PAUSED = true; },
    resume() { config.PAUSED = false; lastUpdateTime = performance.now(); },
    // 拓印用纸色（由 main.js 按主题传入）
    paperForPrint: [0.965, 0.938, 0.878],
    _gl: gl, _dye: () => dye,
  };
  return window.FLUID;
})();
