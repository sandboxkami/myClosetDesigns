import {
  THREE,
  createViewer,
  createLights,
  createMaterials,
  createRoom,
  updateRoom,
  box,
  cylinder,
  createBasket,
  createBookRow,
  createDimensions,
  disposeGroup,
  fitCamera,
} from '../assets/js/viewer-core.js';

const DEFAULTS = {
  W: 2900,
  H: 2340,
  D: 300,
  bottomH: 600,
  t: 18,
  catStepW: 550,
  catHoleD: 220,
};

// 7 modules: 400 / 400 / 400 / 500 / 400 / 400 / 400 = 2900.
const COL_RATIOS = [1, 1, 1, 1.25, 1, 1, 1];
const COL_RATIO_SUM = COL_RATIOS.reduce((sum, value) => sum + value, 0);
const BACK_T = 9;

const state = {
  ...DEFAULTS,
  showDims: true,
  showProps: true,
  unit: 0,
  leftZoneW: 0,
  rowH: 0,
  stagger: 0,
  holeClear: 0,
  cols: [],
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const format = (value, digits = 0) => Number(value).toFixed(digits);

const stage = document.getElementById('canvas-container');
const loading = document.getElementById('loading');

const viewer = createViewer(stage);
viewer.renderer.domElement.setAttribute('aria-label', '电视机柜三维预览');
const materials = createMaterials();
createLights(viewer.scene);
const room = createRoom(viewer.scene, materials);

// The cabinet stands flat against the wall; the baseboard would clip it.
room.baseboard.visible = false;

const cabinetGroup = new THREE.Group();
cabinetGroup.name = 'tv-cabinet';
viewer.scene.add(cabinetGroup);

const MAT = {
  holeRim: new THREE.MeshStandardMaterial({ color: 0x6c4e37, roughness: 0.62 }),
  wireRim: new THREE.MeshStandardMaterial({ color: 0x9a958b, metalness: 0.45, roughness: 0.4 }),
  cat: new THREE.MeshStandardMaterial({ color: 0x8c7d6b, roughness: 0.92 }),
  catLight: new THREE.MeshStandardMaterial({ color: 0xe8ddcc, roughness: 0.94 }),
  catPink: new THREE.MeshStandardMaterial({ color: 0xc79a92, roughness: 0.9 }),
  catDark: new THREE.MeshStandardMaterial({ color: 0x342f29, roughness: 0.82 }),
  pot: new THREE.MeshStandardMaterial({ color: 0xb07a5b, roughness: 0.86 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x6f8061, roughness: 0.86 }),
  leafLight: new THREE.MeshStandardMaterial({ color: 0x8c9a74, roughness: 0.88 }),
  toy: new THREE.MeshStandardMaterial({ color: 0xc27f6d, roughness: 0.76 }),
  toyAlt: new THREE.MeshStandardMaterial({ color: 0x7f8f9a, roughness: 0.76 }),
};

let propsGroup = null;
let dimensionGroup = null;
let catTail = null;
let firstBuild = true;

function normalizeState() {
  state.W = clamp(state.W, 2600, 3200);
  state.H = clamp(state.H, 2100, 2500);
  state.D = clamp(state.D, 280, 400);
  state.bottomH = clamp(state.bottomH, 500, 700);
  state.t = clamp(Math.round(state.t), 16, 25);
  state.catHoleD = clamp(state.catHoleD, 180, 260);

  state.unit = state.W / COL_RATIO_SUM;
  state.leftZoneW = 2 * state.unit;
  state.cols = COL_RATIOS.map((ratio) => ratio * state.unit);
  state.catStepW = Math.round(clamp(state.catStepW, 420, state.leftZoneW - 80));

  state.rowH = (state.H - state.bottomH) / 5;
  if (state.rowH < 260) {
    state.bottomH = Math.round(state.H - 5 * 260);
    state.rowH = 260;
  }
  state.stagger = Math.max(60, state.leftZoneW - state.catStepW - state.t);
  state.holeClear = (state.unit - state.t - state.catHoleD) / 2;
}

function syncInputs() {
  document.querySelectorAll('[data-range], [data-number]').forEach((input) => {
    const key = input.dataset.range || input.dataset.number;
    if (key in state) input.value = state[key];
  });
}

function updateReadouts() {
  document.getElementById('size-readout').textContent =
    `${Math.round(state.W)} × ${Math.round(state.H)} × ${Math.round(state.D)} mm`;
  document.getElementById('col-width').textContent =
    `${format(state.unit, 0)} × 6 + ${format(state.unit * 1.25, 0)} mm`;
  document.getElementById('row-height').textContent = `${format(state.rowH, 0)} mm × 5`;
  document.getElementById('bottom-open').textContent = `${format(state.bottomH, 0)} mm`;
  document.getElementById('left-zone').textContent = `${format(state.leftZoneW, 0)} mm`;
  document.getElementById('step-stagger').textContent = `${format(state.stagger, 0)} mm`;
  document.getElementById('cat-hole').textContent = `⌀${format(state.catHoleD, 0)} mm`;
  document.getElementById('hole-clear').textContent = `${format(state.holeClear, 0)} mm`;

  const warnings = [];
  if (state.rowH < 300) warnings.push(`层高 ${format(state.rowH, 0)} mm < 300`);
  if (state.stagger < 90) warnings.push(`猫踏步错位 ${format(state.stagger, 0)} mm < 90`);
  if (state.holeClear < 45) warnings.push(`猫洞净边 ${format(state.holeClear, 0)} mm < 45`);
  if (state.D - BACK_T - 20 < 250) warnings.push(`净深 ${format(state.D - BACK_T - 20, 0)} mm < 250`);

  const warning = document.getElementById('height-warning');
  warning.hidden = warnings.length === 0;
  warning.textContent = warnings.join('；');
}

function renderUI() {
  syncInputs();
  updateReadouts();
}

let rebuildPending = false;
function scheduleRebuild() {
  if (rebuildPending) return;
  rebuildPending = true;
  requestAnimationFrame(() => {
    rebuildPending = false;
    rebuild();
  });
}

function addFrontEdge(width, height, y, x) {
  cabinetGroup.add(
    box(width, height, 0.004, materials.whiteEdge, {
      x,
      y,
      z: state.D / 2000 + 0.001,
      cast: false,
      receive: true,
    }),
  );
}

// Horizontal shelf with a circular cat hole. The geometry is built in the
// shape's XY plane and rotated flat; after rotation it spans y = 0..thickness.
function shelfWithHole(width, depth, thickness, holeDiameter, holeX, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(holeX, 0, holeDiameter / 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 32,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness / 2, 0);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Vertical divider with a circular wire hole. The shape is built in ZY and
// extruded through the panel thickness; the hole centre stays at z = 0.
function dividerWithHole(depth, height, thickness, holeY, holeDiameter, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-depth / 2, 0);
  shape.lineTo(depth / 2, 0);
  shape.lineTo(depth / 2, height);
  shape.lineTo(-depth / 2, height);
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(0, holeY, holeDiameter / 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(thickness / 2, 0, 0);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Full back panel with the 50 mm pipe opening.
function backPanelWithHole(width, height, thickness, holeX, holeY, holeDiameter, material, z) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(holeX, holeY, holeDiameter / 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 24,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = z;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createPlant() {
  const group = new THREE.Group();
  const pot = cylinder(0.055, 0.095, MAT.pot, { y: 0.0475, radialSegments: 18 });
  const soil = cylinder(0.046, 0.01, materials.woodDark, { y: 0.096, radialSegments: 18 });
  group.add(pot, soil);

  const leaves = [
    { x: 0, y: 0.18, z: 0, ry: 0, tilt: 0.1, scale: 1.15 },
    { x: -0.045, y: 0.16, z: 0.01, ry: 0.7, tilt: 0.55, scale: 0.9 },
    { x: 0.045, y: 0.17, z: -0.01, ry: -0.6, tilt: -0.45, scale: 0.95 },
    { x: -0.02, y: 0.2, z: -0.03, ry: 1.6, tilt: 0.35, scale: 0.8 },
    { x: 0.025, y: 0.15, z: 0.035, ry: -1.5, tilt: -0.5, scale: 0.85 },
  ];
  leaves.forEach((leaf) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), leaf.scale > 1 ? MAT.leaf : MAT.leafLight);
    mesh.scale.set(0.55 * leaf.scale, 1.45 * leaf.scale, 0.45 * leaf.scale);
    mesh.position.set(leaf.x, leaf.y, leaf.z);
    mesh.rotation.set(leaf.tilt, leaf.ry, 0);
    mesh.castShadow = true;
    group.add(mesh);
  });
  return group;
}

function createCat() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), MAT.cat);
  body.scale.set(1.05, 1.28, 0.9);
  body.position.set(0, 0.135, 0);
  body.castShadow = true;
  group.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.058, 18, 14), MAT.catLight);
  chest.scale.set(0.82, 1.15, 0.5);
  chest.position.set(0, 0.15, 0.072);
  group.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.073, 24, 18), MAT.cat);
  head.scale.set(1, 0.94, 0.96);
  head.position.set(0, 0.268, 0.055);
  head.castShadow = true;
  group.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), MAT.catLight);
  muzzle.scale.set(1.2, 0.78, 0.8);
  muzzle.position.set(0, 0.25, 0.112);
  group.add(muzzle);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), MAT.catPink);
  nose.position.set(0, 0.258, 0.139);
  group.add(nose);

  [-1, 1].forEach((sign) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.027, 0.055, 4), MAT.cat);
    ear.position.set(sign * 0.038, 0.327, 0.05);
    ear.rotation.z = -sign * 0.18;
    ear.castShadow = true;
    group.add(ear);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 8), MAT.catDark);
    eye.position.set(sign * 0.027, 0.278, 0.116);
    group.add(eye);

    const leg = cylinder(0.018, 0.115, MAT.cat, {
      x: sign * 0.046,
      y: 0.058,
      z: 0.065,
      radialSegments: 12,
    });
    group.add(leg);

    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), MAT.catLight);
    paw.scale.set(1, 0.62, 1.2);
    paw.position.set(sign * 0.046, 0.012, 0.082);
    group.add(paw);
  });

  catTail = new THREE.Group();
  catTail.position.set(0.055, 0.065, -0.075);
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 22, Math.PI * 1.35), MAT.cat);
  tail.rotation.z = -0.25;
  tail.castShadow = true;
  catTail.add(tail);
  group.add(catTail);

  group.scale.setScalar(0.9);
  return group;
}

function buildCabinet() {
  const W = state.W / 1000;
  const H = state.H / 1000;
  const D = state.D / 1000;
  const bottom = state.bottomH / 1000;
  const rowH = state.rowH / 1000;
  const t = state.t / 1000;
  const catStepW = state.catStepW / 1000;
  const catHoleD = state.catHoleD / 1000;
  const backT = BACK_T / 1000;

  const x0 = -W / 2;
  const x1 = W / 2;
  const zBack = -D / 2;
  const zFront = D / 2;
  const shelfD = D - backT;
  const shelfZ = backT / 2;
  const backZ = zBack + backT / 2;

  const cols = state.cols.map((value) => value / 1000);
  const bounds = [x0];
  cols.forEach((value) => bounds.push(bounds[bounds.length - 1] + value));

  // Back panel, with the 50 mm pipe opening kept at the top right.
  const pipeX = x1 - 0.1;
  const pipeY = H - 0.15;
  cabinetGroup.add(
    backPanelWithHole(W, H, backT, pipeX, pipeY, 0.05, materials.whiteCarcass, zBack),
  );
  const pipeRim = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.0025, 6, 20), MAT.wireRim);
  pipeRim.position.set(pipeX, pipeY, zBack + backT + 0.001);
  cabinetGroup.add(pipeRim);

  // Side panels, top and bottom.
  cabinetGroup.add(
    box(t, H, D, materials.whiteCarcass, { x: x0 + t / 2, y: H / 2, z: 0 }),
    box(t, H, D, materials.whiteCarcass, { x: x1 - t / 2, y: H / 2, z: 0 }),
    box(W - 2 * t, t, D, materials.whiteCarcass, { x: 0, y: H - t / 2, z: 0 }),
    box(W - 2 * t, t, D, materials.whiteCarcass, { x: 0, y: t / 2, z: 0 }),
  );

  // Bottom 600: seven open compartments for baskets.
  bounds.slice(1, -1).forEach((x) => {
    cabinetGroup.add(
      box(t, bottom - 2 * t, shelfD, materials.wood, {
        x,
        y: bottom / 2,
        z: shelfZ,
      }),
    );
    addFrontEdge(t, bottom - 2 * t, bottom / 2, x);
  });

  // Upper dividers: 400 is removed above 600 so the left cat staircase is one
  // continuous 800-wide zone; 1200 and 1700 get 60 mm wire holes.
  bounds.slice(2, -1).forEach((x) => {
    const height = H - bottom - t;
    if (Math.abs(x - bounds[3]) < 1e-6 || Math.abs(x - bounds[4]) < 1e-6) {
      const holeY = rowH * 0.55;
      cabinetGroup.add(
        (() => {
          const panel = dividerWithHole(shelfD, height, t, holeY, 0.06, materials.wood);
          panel.position.set(x, bottom, shelfZ);
          return panel;
        })(),
      );
      [-1, 1].forEach((sign) => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0025, 6, 20), MAT.wireRim);
        rim.position.set(x + sign * (t / 2 + 0.001), bottom + holeY, shelfZ);
        rim.rotation.y = Math.PI / 2;
        cabinetGroup.add(rim);
      });
    } else {
      cabinetGroup.add(
        box(t, height, shelfD, materials.wood, {
          x,
          y: bottom + height / 2,
          z: shelfZ,
        }),
      );
    }
    addFrontEdge(t, height, bottom + height / 2, x);
  });

  // Five shelf levels. Main shelves occupy the five right-hand bays; the last
  // bay gets a 220 mm cat hole. The left two-bay zone gets alternating 550 mm
  // cat steps instead of full shelves.
  const leftInner = x0 + t;
  const leftZoneRight = bounds[2] - t / 2;
  const holeCenterX = x1 - 0.2;

  for (let level = 0; level < 5; level += 1) {
    const yTopShelf = bottom + level * rowH;

    for (let bay = 2; bay < 7; bay += 1) {
      const left = bounds[bay] + t / 2;
      const right = bay === 6 ? bounds[7] - t : bounds[bay + 1] - t / 2;
      const width = right - left;
      const centerX = (left + right) / 2;

      if (bay === 6) {
        const shelf = shelfWithHole(width, shelfD, t, catHoleD, holeCenterX - centerX, materials.wood);
        shelf.position.set(centerX, yTopShelf - t / 2, shelfZ);
        cabinetGroup.add(shelf);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(catHoleD / 2, catHoleD / 2 + 0.008, 32),
          MAT.holeRim,
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(holeCenterX, yTopShelf + 0.0008, 0);
        cabinetGroup.add(ring);
      } else {
        cabinetGroup.add(
          box(width, t, shelfD, materials.wood, {
            x: centerX,
            y: yTopShelf - t / 2,
            z: shelfZ,
          }),
        );
      }
      addFrontEdge(width, t, yTopShelf - t / 2, centerX);
    }

    const stepLeft = level % 2 === 0 ? leftInner : leftZoneRight - catStepW;
    const stepCenter = stepLeft + catStepW / 2;
    cabinetGroup.add(
      box(catStepW, t, shelfD, materials.woodLight, {
        x: stepCenter,
        y: yTopShelf - t / 2,
        z: shelfZ,
      }),
    );
    addFrontEdge(catStepW, t, yTopShelf - t / 2, stepCenter);
  }

  // Example items. All props live in one toggleable group.
  propsGroup = new THREE.Group();
  propsGroup.name = 'props';
  cabinetGroup.add(propsGroup);

  [0, 1, 4, 6].forEach((bay, index) => {
    const center = (bounds[bay] + bounds[bay + 1]) / 2;
    const basket = createBasket(0.3, 0.24, 0.22, materials);
    basket.position.set(center, t + 0.004, 0.005);
    basket.rotation.y = index % 2 === 0 ? 0.03 : -0.03;
    propsGroup.add(basket);
  });

  const bookLayout = [
    { bay: 2, level: 1, count: 6, maxHeight: 0.24, offset: -0.01 },
    { bay: 3, level: 1, count: 7, maxHeight: 0.26, offset: 0 },
    { bay: 2, level: 2, count: 5, maxHeight: 0.22, offset: 0.01 },
    { bay: 4, level: 2, count: 6, maxHeight: 0.25, offset: 0 },
    { bay: 3, level: 3, count: 6, maxHeight: 0.24, offset: -0.01 },
    { bay: 5, level: 3, count: 5, maxHeight: 0.23, offset: 0.01 },
    { bay: 2, level: 4, count: 5, maxHeight: 0.21, offset: 0 },
    { bay: 4, level: 4, count: 6, maxHeight: 0.24, offset: -0.01 },
  ];
  bookLayout.forEach(({ bay, level, count, maxHeight, offset }) => {
    const center = (bounds[bay] + bounds[bay + 1]) / 2 + offset;
    const row = createBookRow(materials, count, maxHeight);
    row.position.set(center, bottom + level * rowH + 0.002, 0.01);
    propsGroup.add(row);
  });

  const plant = createPlant();
  plant.position.set((bounds[5] + bounds[6]) / 2, bottom + 2 * rowH + 0.002, 0.005);
  plant.scale.setScalar(Math.min(1, Math.max(0.7, (rowH - 0.03) / 0.26)));
  propsGroup.add(plant);

  const cat = createCat();
  cat.position.set(leftInner + 0.2, bottom + 2 * rowH + 0.001, 0.025);
  cat.scale.setScalar(Math.min(0.9, Math.max(0.62, (rowH - 0.025) / 0.34)));
  propsGroup.add(cat);

  const toyA = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 12), MAT.toy);
  toyA.position.set((bounds[3] + bounds[4]) / 2 - 0.08, bottom + rowH + 0.03, 0.06);
  toyA.castShadow = true;
  propsGroup.add(toyA);

  const toyB = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 12), MAT.toyAlt);
  toyB.position.set((bounds[6] + bounds[7]) / 2 + 0.06, bottom + 3 * rowH + 0.024, 0.06);
  toyB.castShadow = true;
  propsGroup.add(toyB);

  // Dimensions. The depth label sits far to the right and would clip in the
  // wide 2900 view; the panel already shows the depth, so hide it in 3D.
  dimensionGroup = createDimensions({ width: W, height: H, depth: D }, materials);
  const depthLabel = dimensionGroup.children.find(
    (child) => child.isCSS2DObject && child.element.textContent.startsWith('深'),
  );
  if (depthLabel) depthLabel.visible = false;

  cabinetGroup.add(dimensionGroup);

  updateRoom(room, { width: W, height: H, depth: D });
  applyVisibility();
}

function applyVisibility() {
  if (propsGroup) propsGroup.visible = state.showProps;
  if (dimensionGroup) dimensionGroup.visible = state.showDims;
}

function fitCabinet(direction) {
  const W = state.W / 1000;
  const H = state.H / 1000;
  const D = state.D / 1000;
  fitCamera(viewer.camera, viewer.controls, { width: W, height: H, depth: D }, {
    direction,
    margin: 1.22,
  });
}

function rebuild() {
  normalizeState();
  const direction = viewer.camera.position.clone().sub(viewer.controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.36, 0.12, 1);
  direction.normalize();

  disposeGroup(cabinetGroup);
  catTail = null;
  buildCabinet();

  fitCabinet(firstBuild ? new THREE.Vector3(0.36, 0.12, 1) : direction);
  firstBuild = false;

  renderUI();
  if (loading) loading.classList.add('is-hidden');
}

function resetView() {
  fitCabinet(new THREE.Vector3(0.36, 0.12, 1));
}

document.querySelectorAll('[data-range]').forEach((input) => {
  input.addEventListener('input', () => {
    const key = input.dataset.range;
    state[key] = Number(input.value);
    normalizeState();
    renderUI();
    scheduleRebuild();
  });
});

document.querySelectorAll('[data-number]').forEach((input) => {
  input.addEventListener('change', () => {
    const key = input.dataset.number;
    state[key] = Number(input.value);
    normalizeState();
    renderUI();
    scheduleRebuild();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
});

document.getElementById('reset-dimensions').addEventListener('click', () => {
  Object.assign(state, DEFAULTS);
  normalizeState();
  renderUI();
  scheduleRebuild();
});

document.getElementById('reset-view').addEventListener('click', resetView);

document.getElementById('show-dims').addEventListener('change', (event) => {
  state.showDims = event.target.checked;
  if (dimensionGroup) dimensionGroup.visible = state.showDims;
});

document.getElementById('show-props').addEventListener('change', (event) => {
  state.showProps = event.target.checked;
  applyVisibility();
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (catTail) catTail.rotation.z = Math.sin(clock.elapsedTime * 1.6) * 0.1;
  viewer.controls.update();
  viewer.renderer.render(viewer.scene, viewer.camera);
  viewer.labelRenderer.render(viewer.scene, viewer.camera);
  void delta;
}

normalizeState();
renderUI();
rebuild();
animate();
