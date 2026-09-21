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
    const targetAspect = width / height;
    const crop = Math.min(
      source.width,
      source.height,
      Math.round(source.height * targetAspect),
      Math.round(source.width / targetAspect)
    );
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
      alpha: true,
      antialias: true,
      depth: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssWidth, cssHeight, false);
    renderer.setClearColor(0x000000, 0);
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

/* 长物斋里的真实 3D 旋转：每个可见瓷瓶一个轻量实例，离屏自动暂停。 */
window.PORCELAIN_GALLERY3D = (function () {
  'use strict';

  const instances = new Map();
  const PROFILE_CONTROL = [
    [0, 902], [30, 896], [66, 884], [104, 840], [138, 782],
    [176, 714], [204, 638], [216, 560], [202, 492], [176, 434],
    [150, 384], [130, 338], [116, 294], [108, 252], [104, 218],
    [112, 192], [126, 176], [88, 166], [0, 158]
  ];
  const SEGMENTS = 128;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const instance = instances.get(entry.target);
      if (!instance) return;
      instance.visible = entry.isIntersecting;
      if (instance.visible && !document.hidden) instance.start();
      else instance.stop();
    });
  }, { threshold: .05 });

  function buildGeometry() {
    const points = PROFILE_CONTROL.map(point => new THREE.Vector2(point[0] / 100, (530 - point[1]) / 100));
    const geometry = new THREE.LatheGeometry(points, SEGMENTS);
    geometry.computeVertexNormals();
    const position = geometry.attributes.position;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      uv[i * 2] = (position.getX(i) + 2.4) / 4.8;
      uv[i * 2 + 1] = (position.getY(i) + 3.8) / 7.6;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geometry;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      if (source && source.width && source.height) {
        resolve(source);
        return;
      }
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('瓷器展品纹理加载失败'));
      image.src = source;
    });
  }

  function buildTexture(image) {
    const width = 480;
    const height = 760;
    const crop = Math.min(520, image.width, Math.round(image.height * .625));
    const sx = (image.width - crop) / 2;
    const sy = (image.height - crop) * .36;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(image, sx, sy, crop, crop, 0, 0, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  function destroy(canvas) {
    const instance = instances.get(canvas);
    if (!instance) return;
    observer.unobserve(canvas);
    instance.stop();
    instance.group.remove(instance.mesh);
    instance.mesh.geometry.dispose();
    instance.material.dispose();
    instance.texture.dispose();
    instance.renderer.dispose();
    instances.delete(canvas);
  }

  function unmountAll(root) {
    Array.from(instances.keys()).forEach(canvas => {
      if (!root || root.contains(canvas) || !canvas.isConnected) destroy(canvas);
    });
  }

  function mount(target, source) {
    if (!window.THREE || !target || instances.has(target)) return false;
    const instance = { canvas: target, visible: false, running: false, rafId: 0, start: 0, lastTime: 0 };
    instances.set(target, instance);

    instance.start = () => {
      if (!instance.renderer || instance.running || !instance.visible || document.hidden) return;
      instance.running = true;
      instance.start = performance.now();
      if (!instance.rafId) instance.rafId = requestAnimationFrame(instance.renderFrame);
    };
    instance.stop = () => {
      instance.running = false;
      if (instance.rafId) cancelAnimationFrame(instance.rafId);
      instance.rafId = 0;
      instance.lastTime = 0;
    };
    instance.renderFrame = time => {
      if (!instance.running || !instance.renderer) return;
      if (time - instance.lastTime < 40) {
        instance.rafId = requestAnimationFrame(instance.renderFrame);
        return;
      }
      if (!instance.lastTime) instance.lastTime = time;
      instance.group.rotation.y = (time - instance.start) * .00034;
      instance.group.rotation.x = -.015;
      instance.renderer.render(instance.scene, instance.camera);
      instance.rafId = requestAnimationFrame(instance.renderFrame);
    };

    loadImage(source).then(image => {
      if (!target.isConnected) {
        destroy(target);
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const cssWidth = target.clientWidth || 220;
      const cssHeight = target.clientHeight || 300;
      target.width = Math.round(cssWidth * dpr);
      target.height = Math.round(cssHeight * dpr);

      instance.renderer = new THREE.WebGLRenderer({
        canvas: target,
        alpha: true,
        antialias: true,
        depth: true,
        powerPreference: 'low-power'
      });
      instance.renderer.setPixelRatio(dpr);
      instance.renderer.setSize(cssWidth, cssHeight, false);
      instance.renderer.setClearColor(0x000000, 0);
      instance.renderer.outputEncoding = THREE.sRGBEncoding;
      instance.renderer.toneMapping = THREE.NoToneMapping;

      instance.scene = new THREE.Scene();
      instance.camera = new THREE.PerspectiveCamera(34, cssWidth / Math.max(1, cssHeight), .2, 30);
      instance.camera.position.set(0, .08, 13.8);
      instance.camera.lookAt(0, .02, 0);

      instance.group = new THREE.Group();
      instance.scene.add(instance.group);
      instance.texture = buildTexture(image);
      instance.material = new THREE.MeshPhysicalMaterial({
        map: instance.texture,
        color: new THREE.Color(1, 1, 1),
        roughness: .24,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: .08,
        envMapIntensity: .55
      });
      instance.mesh = new THREE.Mesh(buildGeometry(), instance.material);
      instance.group.add(instance.mesh);

      instance.scene.add(new THREE.AmbientLight(0xfff6e2, .72));
      instance.scene.add(new THREE.HemisphereLight(0xe7efd2, 0x050505, .38));
      const keyLight = new THREE.DirectionalLight(0xfff8e8, .78);
      keyLight.position.set(-3.2, 4.2, 6.2);
      instance.scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xd8e8d0, .22);
      fillLight.position.set(4.5, .8, 3.0);
      instance.scene.add(fillLight);
      const rimLight = new THREE.DirectionalLight(0xe8f5d8, .36);
      rimLight.position.set(1.5, 2.4, -6.5);
      instance.scene.add(rimLight);

      observer.observe(target);
      instance.visible = true;
      instance.start();
    }).catch(error => {
      console.warn('PORCELAIN_GALLERY3D fallback:', error);
      destroy(target);
    });
    return true;
  }

  return { mount, unmount: destroy, unmountAll };
})();
