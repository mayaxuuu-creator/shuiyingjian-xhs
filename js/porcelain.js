/* 水影笺 · 瓷器 Three.js 3D 预览
   离线打包版 Three.js 只用于瓷器器身；保存/发笔记仍使用静态 paperCanvas。 */

window.PORCELAIN3D = (function () {
  'use strict';

  let renderer = null;
  let scene = null;
  let camera = null;
  let group = null;
  let mesh = null;
  let material = null;
  let texture = null;
  let canvas = null;
  let rafId = 0;
  let running = false;
  let start = 0;
  let lastTime = 0;
  let lost = false;

  /* 龙泉青瓷式梅瓶轮廓：外撇口、内撇唇口、细颈、垂腹、窄足；不展示内壁。 */
  const PROFILE_CONTROL = [
    [0, 902], [30, 896], [66, 884], [104, 840], [138, 782],
    [176, 714], [204, 638], [216, 560], [202, 492], [176, 434],
    [150, 384], [130, 338], [116, 294], [108, 252], [104, 218],
    [112, 192], [126, 176], [88, 166], [0, 158]
  ];
  const SEGMENTS = 160;

  function buildGeometry() {
    const points = PROFILE_CONTROL.map(point => new THREE.Vector2(point[0] / 100, (530 - point[1]) / 100));
    const geometry = new THREE.LatheGeometry(points, SEGMENTS);
    geometry.computeVertexNormals();

    /* 平面 UV：按器身包围盒取原拓印，避免环绕 UV 的接缝和拉伸。 */
    const position = geometry.attributes.position;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      uv[i * 2] = (position.getX(i) + 2.4) / 4.8;
      uv[i * 2 + 1] = (position.getY(i) + 3.8) / 7.6;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geometry;
  }

  function buildSourceCanvas(source) {
    const width = 480;
    const height = 760;
    const crop = Math.min(520, source.width, Math.round(source.height * .625));
    const sx = (source.width - crop) / 2;
    const sy = (source.height - crop) * .36;
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const context = sourceCanvas.getContext('2d');
    context.drawImage(source, sx, sy, crop, crop, 0, 0, width, height);
    return sourceCanvas;
  }

  function buildTexture(source) {
    const texture = new THREE.CanvasTexture(buildSourceCanvas(source));
    texture.encoding = THREE.sRGBEncoding;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  function buildScene(source) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, 3 / 4, .2, 30);
    camera.position.set(0, .08, 13.8);
    camera.lookAt(0, .02, 0);

    group = new THREE.Group();
    scene.add(group);

    texture = buildTexture(source);
    material = new THREE.MeshPhysicalMaterial({
      map: texture,
      color: new THREE.Color(1, 1, 1),
      roughness: .24,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: .08,
      envMapIntensity: .55
    });
    mesh = new THREE.Mesh(buildGeometry(), material);
    group.add(mesh);

    scene.add(new THREE.AmbientLight(0xfff6e2, .72));
    scene.add(new THREE.HemisphereLight(0xe7efd2, 0x050505, .38));

    const keyLight = new THREE.DirectionalLight(0xfff8e8, .78);
    keyLight.position.set(-3.2, 4.2, 6.2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd8e8d0, .22);
    fillLight.position.set(4.5, .8, 3.0);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xe8f5d8, .36);
    rimLight.position.set(1.5, 2.4, -6.5);
    scene.add(rimLight);
  }

  function initialize(target, source) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cssWidth = target.clientWidth || 320;
    const cssHeight = target.clientHeight || 420;
    target.width = Math.round(cssWidth * dpr);
    target.height = Math.round(cssHeight * dpr);

    renderer = new THREE.WebGLRenderer({
      canvas: target,
      alpha: false,
      antialias: true,
      depth: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssWidth, cssHeight, false);
    renderer.setClearColor(0x000000, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    buildScene(source);

    target.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      lost = true;
      stopRender();
    }, false);
    return true;
  }

  function updateTexture(source) {
    if (!renderer || !material) return;
    const next = buildTexture(source);
    if (texture) texture.dispose();
    texture = next;
    material.map = texture;
    material.needsUpdate = true;
  }

  function renderFrame(time) {
    if (!running || !renderer) return;
    if (time - lastTime < 33) {
      rafId = requestAnimationFrame(renderFrame);
      return;
    }
    if (!lastTime) lastTime = time;
    lastTime = time;
    group.rotation.y = (time - start) * .00038;
    group.rotation.x = -.015;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(renderFrame);
  }

  function stopRender() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    lastTime = 0;
  }

  function destroy() {
    stopRender();
    if (mesh) {
      mesh.geometry.dispose();
      mesh = null;
    }
    if (material) {
      material.dispose();
      material = null;
    }
    if (texture) {
      texture.dispose();
      texture = null;
    }
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    scene = null;
    camera = null;
    group = null;
    canvas = null;
    lost = false;
  }

  function show(target, source) {
    if (lost || !window.THREE) return false;
    if (canvas !== target) {
      destroy();
      canvas = target;
      try {
        initialize(target, source);
      } catch (error) {
        console.warn('PORCELAIN3D fallback:', error);
        destroy();
        return false;
      }
      const onVisibility = () => {
        if (document.hidden) stopRender();
        else if (canvas && !lost) {
          start = performance.now();
          running = true;
          if (!rafId) rafId = requestAnimationFrame(renderFrame);
        }
      };
      document.removeEventListener('visibilitychange', onVisibility);
      document.addEventListener('visibilitychange', onVisibility);
    } else {
      updateTexture(source);
    }

    start = performance.now();
    running = true;
    if (!rafId) rafId = requestAnimationFrame(renderFrame);
    return true;
  }

  return {
    show,
    stop: stopRender,
    destroy
  };
})();
