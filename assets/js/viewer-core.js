import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export { THREE, OrbitControls, CSS2DRenderer, CSS2DObject };

function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export function createWoodTexture(base, grain, seed = 7) {
  const texture = makeCanvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const random = seededRandom(seed);
    for (let i = 0; i < 95; i += 1) {
      const x = random() * w;
      const wobble = 4 + random() * 14;
      ctx.beginPath();
      ctx.moveTo(x, -10);
      for (let y = -10; y <= h + 10; y += 18) {
        ctx.lineTo(x + Math.sin(y * 0.017 + random() * 6) * wobble, y);
      }
      ctx.strokeStyle = grain;
      ctx.globalAlpha = 0.035 + random() * 0.11;
      ctx.lineWidth = 0.5 + random() * 2.2;
      ctx.stroke();
    }
    ctx.globalAlpha = 0.11;
    for (let i = 0; i < 9; i += 1) {
      const x = random() * w;
      const y = random() * h;
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + random() * 5, 8 + random() * 22, 0, 0, Math.PI * 2);
      ctx.strokeStyle = grain;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  texture.repeat.set(2, 2);
  return texture;
}

function createFloorTexture() {
  const texture = makeCanvasTexture(512, 512, (ctx, w, h) => {
    const random = seededRandom(19);
    ctx.fillStyle = '#d8c2a1';
    ctx.fillRect(0, 0, w, h);
    const plankH = 64;
    for (let row = 0; row < h / plankH; row += 1) {
      const y = row * plankH;
      ctx.fillStyle = row % 2 === 0 ? 'rgba(255,255,255,.055)' : 'rgba(90,55,30,.035)';
      ctx.fillRect(0, y, w, plankH);
      ctx.strokeStyle = 'rgba(100,68,42,.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 2);
      ctx.lineTo(w, y + 2);
      ctx.stroke();
      for (let i = 0; i < 7; i += 1) {
        const gx = random() * w;
        ctx.strokeStyle = 'rgba(110,72,42,.09)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx, y + 6);
        ctx.bezierCurveTo(gx + 20, y + 18, gx - 26, y + 38, gx + 12, y + plankH - 5);
        ctx.stroke();
      }
    }
  });
  texture.repeat.set(5, 5);
  return texture;
}

function createWovenTexture() {
  const texture = makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#c5a173';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(92,60,32,.34)';
    ctx.lineWidth = 2;
    for (let i = -h; i < w + h; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + h, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 1;
    for (let i = -h; i < w + h; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i + 2, 0);
      ctx.lineTo(i + h + 2, h);
      ctx.stroke();
    }
  });
  texture.repeat.set(3, 3);
  return texture;
}

function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 18, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(48,34,20,.42)');
  gradient.addColorStop(0.55, 'rgba(48,34,20,.18)');
  gradient.addColorStop(1, 'rgba(48,34,20,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMaterials() {
  const woodTexture = createWoodTexture('#8b6b52', '#624936', 7);
  const woodLightTexture = createWoodTexture('#a9896d', '#7a5c44', 13);
  const floorTexture = createFloorTexture();
  const wovenTexture = createWovenTexture();

  const whiteDoor = new THREE.MeshPhysicalMaterial({
    color: 0xf0ede6,
    roughness: 0.46,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
  });
  const whiteCarcass = new THREE.MeshStandardMaterial({
    color: 0xe8e4dc,
    roughness: 0.72,
    metalness: 0,
  });
  const whiteEdge = new THREE.MeshStandardMaterial({
    color: 0xf4f1eb,
    roughness: 0.62,
    metalness: 0,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: woodTexture,
    roughness: 0.62,
    metalness: 0,
  });
  const woodLight = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: woodLightTexture,
    roughness: 0.68,
    metalness: 0,
  });
  const woodDark = new THREE.MeshStandardMaterial({
    color: 0x7b5437,
    roughness: 0.7,
    metalness: 0,
  });
  const knob = new THREE.MeshStandardMaterial({
    color: 0xb9885f,
    roughness: 0.48,
    metalness: 0,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0xb7b1a7,
    roughness: 0.3,
    metalness: 0.68,
  });
  const floor = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: floorTexture,
    roughness: 0.82,
    metalness: 0,
  });
  const wall = new THREE.MeshStandardMaterial({
    color: 0xece7de,
    roughness: 0.95,
    metalness: 0,
  });
  const basket = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: wovenTexture,
    roughness: 0.92,
    metalness: 0,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdce9e7,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shadow = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: createContactShadowTexture(),
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const dimensionLine = new THREE.LineBasicMaterial({
    color: 0x8c7a66,
    transparent: true,
    opacity: 0.78,
  });

  const bookColors = ['#9a5b45', '#5f6f62', '#b08a55', '#6e6a80', '#8d745f'].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.72 }),
  );
  const clothesColors = ['#cbbba6', '#7f8a76', '#b98d72', '#8c8d96', '#d4c4ad'].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.86 }),
  );

  return {
    whiteDoor,
    whiteCarcass,
    whiteEdge,
    wood,
    woodLight,
    woodDark,
    knob,
    metal,
    floor,
    wall,
    basket,
    glass,
    shadow,
    dimensionLine,
    bookColors,
    clothesColors,
    textures: { woodTexture, woodLightTexture, floorTexture, wovenTexture },
  };
}

export function createViewer(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
  camera.position.set(2.1, 1.8, 5.1);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-label', '次卧衣柜三维预览');
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.minDistance = 1.2;
  controls.maxDistance = 14;
  controls.minPolarAngle = 0.22;
  controls.maxPolarAngle = Math.PI / 2 - 0.035;
  controls.minAzimuthAngle = -Math.PI * 0.46;
  controls.maxAzimuthAngle = Math.PI * 0.46;
  controls.target.set(0, 1.2, 0);

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  controls.update();

  return { scene, camera, renderer, labelRenderer, controls, resizeObserver };
}

export function createLights(scene) {
  const hemisphere = new THREE.HemisphereLight(0xfff7ea, 0xc3b29a, 1.22);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xfff2df, 2.75);
  key.position.set(3.2, 5.5, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.9);
  fill.position.set(-4, 3.2, 2.4);
  scene.add(fill);

  const ambient = new THREE.AmbientLight(0xffffff, 0.28);
  scene.add(ambient);

  return { hemisphere, key, fill, ambient };
}

export function createRoom(scene, materials) {
  const group = new THREE.Group();
  group.name = 'room';
  scene.add(group);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  group.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.4), materials.wall);
  wall.position.set(0, 1.7, -0.4);
  wall.receiveShadow = true;
  group.add(wall);

  const baseboard = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 0.025), materials.whiteEdge);
  baseboard.position.set(0, 0.05, -0.38);
  baseboard.receiveShadow = true;
  group.add(baseboard);

  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materials.shadow);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.002, 0);
  contactShadow.renderOrder = 1;
  group.add(contactShadow);

  return { group, floor, wall, baseboard, contactShadow };
}

export function updateRoom(room, { width, height, depth }) {
  room.wall.position.z = -depth / 2 - 0.02;
  room.baseboard.position.z = -depth / 2 + 0.006;
  room.contactShadow.scale.set(width + 0.85, depth + 0.85, 1);
  room.contactShadow.position.set(0, 0.002, 0);
  void height;
}

export function box(width, height, depth, material, { x = 0, y = 0, z = 0, cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function cylinder(radius, height, material, { x = 0, y = 0, z = 0, radialSegments = 18 } = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, radialSegments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createBasket(width, height, depth, materials) {
  const group = new THREE.Group();
  const body = box(width, height, depth, materials.basket, { y: height / 2, cast: true, receive: true });
  group.add(body);
  const rim = box(width + 0.028, 0.035, depth + 0.028, materials.woodDark, {
    y: height,
    cast: true,
    receive: true,
  });
  group.add(rim);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(width * 0.18, 0.008, 6, 18, Math.PI),
    materials.woodDark,
  );
  handle.rotation.z = 0;
  handle.position.set(0, height + 0.01, 0);
  handle.castShadow = true;
  group.add(handle);
  return group;
}

export function createBookRow(materials, count = 6, maxHeight = 0.28) {
  const group = new THREE.Group();
  let x = 0;
  for (let i = 0; i < count; i += 1) {
    const w = 0.025 + ((i * 7) % 5) * 0.006;
    const h = maxHeight * (0.72 + ((i * 13) % 9) / 20);
    const d = 0.17 + ((i * 3) % 4) * 0.012;
    const book = box(w, h, d, materials.bookColors[i % materials.bookColors.length], {
      x: x + w / 2,
      y: h / 2,
      z: 0,
      cast: true,
      receive: true,
    });
    book.rotation.z = i === count - 1 ? -0.08 : 0;
    group.add(book);
    x += w + 0.008;
  }
  group.position.x = -x / 2;
  return group;
}

export function createHangingGarment(materials, colorIndex = 0, height = 1.02, width = 0.36) {
  const group = new THREE.Group();
  const hangerBar = box(width * 0.8, 0.018, 0.022, materials.knob, { y: -0.018, z: 0 });
  group.add(hangerBar);
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI),
    materials.metal,
  );
  hook.position.set(0, 0.012, 0);
  hook.rotation.z = Math.PI;
  group.add(hook);

  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.5, -0.04);
  shape.lineTo(-width * 0.36, -height * 0.18);
  shape.lineTo(-width * 0.3, -height * 0.78);
  shape.lineTo(-width * 0.38, -height);
  shape.lineTo(width * 0.38, -height);
  shape.lineTo(width * 0.3, -height * 0.78);
  shape.lineTo(width * 0.36, -height * 0.18);
  shape.lineTo(width * 0.5, -0.04);
  shape.lineTo(width * 0.24, -0.005);
  shape.lineTo(0, -0.03);
  shape.lineTo(-width * 0.24, -0.005);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.022,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -0.011);
  const garment = new THREE.Mesh(geometry, materials.clothesColors[colorIndex % materials.clothesColors.length]);
  garment.castShadow = true;
  garment.receiveShadow = true;
  group.add(garment);
  return group;
}

export function createDimensionLabel(text) {
  const element = document.createElement('div');
  element.className = 'dim-label';
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.center.set(0.5, 0.5);
  return label;
}

function lineFromPoints(points, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
}

export function createDimensions({ width, height, depth }, materials) {
  const group = new THREE.Group();
  group.name = 'dimensions';
  const mat = materials.dimensionLine;
  const tick = 0.035;
  const off = 0.2;

  const x0 = -width / 2;
  const x1 = width / 2;
  const zFront = depth / 2;

  group.add(lineFromPoints([
    new THREE.Vector3(x0, 0.012, zFront + off),
    new THREE.Vector3(x1, 0.012, zFront + off),
  ], mat));
  group.add(lineFromPoints([
    new THREE.Vector3(x0, 0.012, zFront + off - tick),
    new THREE.Vector3(x0, 0.012, zFront + off + tick),
  ], mat));
  group.add(lineFromPoints([
    new THREE.Vector3(x1, 0.012, zFront + off - tick),
    new THREE.Vector3(x1, 0.012, zFront + off + tick),
  ], mat));
  const widthLabel = createDimensionLabel(`宽 ${Math.round(width * 1000)} mm`);
  widthLabel.position.set(0, 0.06, zFront + off + 0.075);
  group.add(widthLabel);

  group.add(lineFromPoints([
    new THREE.Vector3(x0 - off, 0.012, zFront),
    new THREE.Vector3(x0 - off, height, zFront),
  ], mat));
  group.add(lineFromPoints([
    new THREE.Vector3(x0 - off - tick, 0.012, zFront),
    new THREE.Vector3(x0 - off + tick, 0.012, zFront),
  ], mat));
  group.add(lineFromPoints([
    new THREE.Vector3(x0 - off - tick, height, zFront),
    new THREE.Vector3(x0 - off + tick, height, zFront),
  ], mat));
  const heightLabel = createDimensionLabel(`高 ${Math.round(height * 1000)} mm`);
  heightLabel.position.set(x0 - off - 0.08, height / 2, zFront);
  group.add(heightLabel);

  group.add(lineFromPoints([
    new THREE.Vector3(x1 + off, 0.012, -depth / 2),
    new THREE.Vector3(x1 + off, 0.012, depth / 2),
  ], mat));
  group.add(lineFromPoints([
    new THREE.Vector3(x1 + off - tick, 0.012, -depth / 2),
    new THREE.Vector3(x1 + off + tick, 0.012, -depth / 2),
  ], mat));
  group.add(lineFromPoints([
    new THREE.Vector3(x1 + off - tick, 0.012, depth / 2),
    new THREE.Vector3(x1 + off + tick, 0.012, depth / 2),
  ], mat));
  const depthLabel = createDimensionLabel(`深 ${Math.round(depth * 1000)} mm`);
  depthLabel.position.set(x1 + off + 0.08, 0.06, 0);
  group.add(depthLabel);

  return group;
}

export function disposeGroup(group) {
  if (!group) return;
  const labels = [];
  group.traverse((object) => {
    if (object.isCSS2DObject) labels.push(object);
    if (object.geometry) object.geometry.dispose();
  });
  labels.forEach((label) => label.element.remove());
  group.clear();
}

export function fitCamera(camera, controls, { width, height, depth }, options = {}) {
  const target = new THREE.Vector3(0, height * 0.47, 0);
  let direction;
  if (options.direction) {
    direction = options.direction.clone();
  } else {
    direction = camera.position.clone().sub(controls.target);
  }
  if (direction.lengthSq() < 0.0001) direction.set(0.32, 0.16, 1);
  direction.normalize();

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.45));
  const margin = options.margin ?? 1.2;
  const distanceV = (height * 0.5 * margin) / Math.tan(vFov / 2);
  const distanceH = (width * 0.5 * margin) / Math.tan(hFov / 2);
  const distanceD = depth * 0.5 + 1.35;
  const distance = Math.max(distanceV, distanceH, distanceD);

  camera.position.copy(target).add(direction.multiplyScalar(distance));
  camera.near = Math.max(0.05, distance * 0.015);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();
}

export function damp(current, target, lambda, delta) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}
