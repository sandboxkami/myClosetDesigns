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
  createHangingGarment,
  createDimensions,
  disposeGroup,
  fitCamera,
  damp,
} from '../assets/js/viewer-core.js';

const DEFAULTS = {
  W: 1700,
  H: 2303,
  D: 800,
  backD: 400,
  benchW: 300,
  benchH: 420,
  benchPull: 500,
  t: 18,
  topGap: 0,
};

const LEFT_W = 408;
const NARROW_W = 420;
const GAP = 0.003;
const BACK_T = 0.012;
const CUSHION_T = 0.03;
const WHEEL_R = 0.015;
const NARROW_RATIOS = [460, 460, 160, 160, 230, 175, 130, 130, 130];
const NARROW_RATIO_SUM = NARROW_RATIOS.reduce((sum, value) => sum + value, 0);
const MID_UPPER_RATIOS = [180, 160, 120, 100, 370];
const MID_SHOE_RATIOS = [170, 170, 130, 100];
const BACK_RATIOS = [340, 340, 220, 220, 220, 220, 150, 150, 150, 100];
const BACK_RATIO_SUM = BACK_RATIOS.reduce((sum, value) => sum + value, 0);
const FRONT_BOTTOM = [200, 120, 130, 130, 170];
const FRONT_UPPER = [100, 120, 168, 180, 230];
const FRONT_DRAWER = 170;
const FRONT_NICHE = 370;

const state = {
  ...DEFAULTS,
  showDims: true,
  showProps: true,
  showDoors: true,
  frontD: 400,
  backW: 1220,
  backPull: 1220,
  midW: 0,
  kneeH: 0,
  backHeights: [],
  midDoorW: 0,
  benchMaxW: 0,
};

const SCENE = {
  doorT: 0.018,
  doorZ: 0.191,
  bodyFront: 0.182,
  interiorD: 0.37,
  interiorZ: -0.003,
  depth: 0.75,
  frontD: 0.4,
  backD: 0.35,
  backW: 0.42,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const format = (value, digits = 0) => Number(value).toFixed(digits);

const stage = document.getElementById('canvas-container');
const loading = document.getElementById('loading');
const tooltip = document.getElementById('tooltip');

const viewer = createViewer(stage);
viewer.renderer.domElement.setAttribute('aria-label', '鞋柜三维预览');
const materials = createMaterials();
createLights(viewer.scene);
const room = createRoom(viewer.scene, materials);

// Flat wall: the whole 750-deep cabinet stands against one wall, no niche.
room.baseboard.visible = false;

const cabinetGroup = new THREE.Group();
cabinetGroup.name = 'shoe-cabinet';
viewer.scene.add(cabinetGroup);

const MAT = {
  pull: new THREE.MeshStandardMaterial({ color: 0x4a443b, roughness: 0.66 }),
  cushion: new THREE.MeshStandardMaterial({ color: 0xb6a58d, roughness: 0.96 }),
  bag: new THREE.MeshStandardMaterial({ color: 0xb0825f, roughness: 0.7 }),
  bagEdge: new THREE.MeshStandardMaterial({ color: 0x7d5840, roughness: 0.66 }),
  box: new THREE.MeshStandardMaterial({ color: 0xcab99b, roughness: 0.9 }),
  boxLid: new THREE.MeshStandardMaterial({ color: 0xd9c8ab, roughness: 0.88 }),
  sole: new THREE.MeshStandardMaterial({ color: 0x3d3933, roughness: 0.85 }),
  shoe: [
    new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: 0x4b4842, roughness: 0.68 }),
    new THREE.MeshStandardMaterial({ color: 0xb08a62, roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: 0xb98d84, roughness: 0.74 }),
    new THREE.MeshStandardMaterial({ color: 0x77806d, roughness: 0.74 }),
    new THREE.MeshStandardMaterial({ color: 0xa8a29a, roughness: 0.7 }),
  ],
};

let interactiveParts = [];
let propsGroup = null;
let rackPropsGroup = null;
let doorsGroup = null;
let dimensionGroup = null;
let firstBuild = true;

function normalizeState() {
  state.W = clamp(state.W, 1600, 1800);
  state.H = clamp(state.H, 2100, 2500);
  state.D = clamp(state.D, 700, 900);
  state.backD = clamp(state.backD, 350, 450);
  state.t = clamp(Math.round(state.t), 16, 25);
  state.topGap = 0;
  state.benchH = clamp(state.benchH, 380, 460);
  state.benchPull = clamp(state.benchPull, 300, 600);
  state.benchMaxW = LEFT_W - 2 * state.t;
  state.benchW = clamp(state.benchW, 260, state.benchMaxW);

  state.frontD = state.D - state.backD;
  if (state.frontD < 350) {
    state.frontD = 350;
    state.backD = state.D - state.frontD;
  }
  if (state.frontD > 500) {
    state.frontD = 500;
    state.backD = state.D - state.frontD;
  }
  state.backD = clamp(state.backD, 350, 450);
  state.frontD = state.D - state.backD;

  state.midW = clamp(state.W - LEFT_W - NARROW_W - 4 * state.t, 700, 900);
  state.W = LEFT_W + state.midW + NARROW_W + 4 * state.t;
  state.backW = state.midW + NARROW_W;
  state.backPull = state.backW;

  state.kneeH = state.H - 3 * state.t - 400 - 980 - state.benchH;

  const backAvail = state.H - 11 * state.t;
  const backScale = Math.max(0.5, backAvail / BACK_RATIO_SUM);
  state.backHeights = BACK_RATIOS.map((value) => value * backScale);

  state.midDoorW = (state.midW - 9) / 2;
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
  document.getElementById('left-width').textContent = `${LEFT_W} mm`;
  document.getElementById('mid-width').textContent = `${format(state.midW, 0)} / ${NARROW_W} mm`;
  document.getElementById('hanging-depth').textContent = `${format(state.D, 0)} / ${format(state.D, 0)}（贯通）`;
  document.getElementById('width-layout').textContent =
    `${LEFT_W} / ${format(state.midW + NARROW_W, 0)} / ${format(state.backW, 0)}`;
  document.getElementById('left-back-width').textContent = `${format(LEFT_W + state.backW, 0)} mm`;
  document.getElementById('left-zones').textContent =
    `400 / 980 / ${format(state.kneeH, 0)} / ${format(state.benchH, 0)}`;
  document.getElementById('front-bottom').textContent =
    `${FRONT_BOTTOM.join(' / ')} mm`;
  document.getElementById('front-drawer').textContent = `${FRONT_DRAWER} mm`;
  document.getElementById('front-niche').textContent = `${FRONT_NICHE} mm`;
  document.getElementById('front-upper').textContent = `${FRONT_UPPER.join(' / ')} mm`;
  document.getElementById('mid-door-width').textContent = `${format(state.midDoorW, 1)} mm`;
  document.getElementById('bench-size').textContent =
    `${format(state.benchW, 0)} × ${format(state.benchH, 0)} / ${format(state.benchPull, 0)}`;
  document.getElementById('front-depth').textContent =
    `${format(state.frontD, 0)} / ${format(state.backD, 0)} mm`;
  document.getElementById('back-rack').textContent =
    `${format(state.backW, 0)} × ${format(state.H, 0)} / 抽拉 ${format(state.backPull, 0)}`;
  document.getElementById('back-heights').textContent =
    `${state.backHeights.map((value) => format(value, 0)).join(' / ')} mm`;

  const warnings = [];
  if (state.kneeH < 300) warnings.push(`坐凳上空 ${format(state.kneeH, 0)} mm < 300`);
  if (state.midW < 740) warnings.push(`前柜中段净宽 ${format(state.midW, 0)} mm < 740`);
  if (state.frontD - state.t - 12 < 340) warnings.push(`前层净深 ${format(state.frontD - state.t - 12, 0)} mm < 340`);
  if (state.backD - state.t - 12 < 300) warnings.push(`后层净深 ${format(state.backD - state.t - 12, 0)} mm < 300`);
  if (state.backHeights[9] < 90) warnings.push(`后层最下层 ${format(state.backHeights[9], 0)} mm < 90`);

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

function addDoor({ xLeft, xRight, yBottom, yTop, hinge, label }) {
  const doorW = xRight - xLeft;
  const doorH = yTop - yBottom;
  const group = new THREE.Group();
  const hingeX = hinge === 'left' ? xLeft : xRight;
  group.position.set(hingeX, 0, SCENE.doorZ);

  const panelCenterX = hinge === 'left' ? doorW / 2 : -doorW / 2;
  const panelCenterY = (yBottom + yTop) / 2;
  const panel = box(doorW, doorH, SCENE.doorT, materials.whiteDoor, {
    x: panelCenterX,
    y: panelCenterY,
    z: 0,
  });
  group.add(panel);

  const pullX = hinge === 'left' ? doorW - 0.012 : -(doorW - 0.012);
  const pull = box(0.007, Math.min(0.1, doorH * 0.2), 0.004, MAT.pull, {
    x: pullX,
    y: panelCenterY,
    z: SCENE.doorT / 2 + 0.001,
  });
  group.add(pull);

  const part = {
    type: 'door',
    group,
    hingeSign: hinge === 'left' ? -1 : 1,
    open: 0,
    target: 0,
    angle: Math.PI * 0.5,
    label,
  };
  group.userData.part = part;
  group.traverse((object) => {
    if (object.isMesh) object.userData.part = part;
  });
  interactiveParts.push(part);
  doorsGroup.add(group);
  return group;
}

function addDrawer({ xCenter, width, yBottom, yTop, label }) {
  const height = yTop - yBottom;
  const centerY = (yBottom + yTop) / 2;
  const group = new THREE.Group();
  group.position.set(xCenter, 0, 0);

  const front = box(width, height, SCENE.doorT, materials.whiteDoor, {
    y: centerY,
    z: SCENE.doorZ,
  });
  group.add(front);

  const pull = box(0.12, 0.006, 0.004, MAT.pull, {
    y: yTop - 0.018,
    z: SCENE.doorZ + SCENE.doorT / 2 + 0.001,
  });
  group.add(pull);

  const bodyD = Math.min(SCENE.interiorD - 0.02, 0.36);
  const bodyW = width - 0.03;
  const bodyH = height - 0.02;
  const bodyFrontZ = SCENE.doorZ - SCENE.doorT / 2;
  const bodyCenterZ = bodyFrontZ - bodyD / 2;
  const bodyCenterY = centerY;

  group.add(
    box(bodyW, 0.012, bodyD, materials.wood, { y: bodyCenterY - bodyH / 2 + 0.006, z: bodyCenterZ }),
    box(0.012, bodyH, bodyD, materials.wood, { x: -bodyW / 2 + 0.006, y: bodyCenterY, z: bodyCenterZ }),
    box(0.012, bodyH, bodyD, materials.wood, { x: bodyW / 2 - 0.006, y: bodyCenterY, z: bodyCenterZ }),
    box(bodyW, bodyH, 0.012, materials.wood, { y: bodyCenterY, z: bodyCenterZ - bodyD / 2 + 0.006 }),
  );

  const part = {
    type: 'drawer',
    group,
    open: 0,
    target: 0,
    travel: Math.min(0.4, bodyD * 0.9),
    label,
  };
  group.userData.part = part;
  group.traverse((object) => {
    if (object.isMesh) object.userData.part = part;
  });
  interactiveParts.push(part);
  cabinetGroup.add(group);
  return group;
}

function createShoeShape(type) {
  const shape = new THREE.Shape();
  if (type === 'heel') {
    shape.moveTo(0, 0.02);
    shape.lineTo(0.22, 0.02);
    shape.lineTo(0.22, 0.045);
    shape.lineTo(0.16, 0.065);
    shape.lineTo(0.08, 0.11);
    shape.lineTo(0.03, 0.11);
    shape.lineTo(0, 0.06);
  } else if (type === 'slipper') {
    shape.moveTo(0, 0.02);
    shape.lineTo(0.23, 0.02);
    shape.lineTo(0.23, 0.04);
    shape.lineTo(0.16, 0.06);
    shape.lineTo(0.06, 0.055);
    shape.lineTo(0, 0.04);
  } else if (type === 'boot') {
    shape.moveTo(0, 0.02);
    shape.lineTo(0.23, 0.02);
    shape.lineTo(0.23, 0.045);
    shape.lineTo(0.17, 0.07);
    shape.lineTo(0.1, 0.085);
    shape.lineTo(0.04, 0.08);
    shape.lineTo(0, 0.055);
  } else {
    shape.moveTo(0, 0.02);
    shape.lineTo(0.24, 0.02);
    shape.lineTo(0.24, 0.05);
    shape.lineTo(0.18, 0.08);
    shape.lineTo(0.1, 0.095);
    shape.lineTo(0.04, 0.085);
    shape.lineTo(0, 0.055);
  }
  shape.closePath();
  return shape;
}

function createShoePair(type, colorIndex) {
  const group = new THREE.Group();
  const color = MAT.shoe[colorIndex % MAT.shoe.length];

  const makeShoe = (x) => {
    const shoe = new THREE.Group();
    const geometry = new THREE.ExtrudeGeometry(createShoeShape(type), {
      depth: 0.085,
      bevelEnabled: false,
    });
    geometry.translate(-0.12, 0, -0.0425);
    const upper = new THREE.Mesh(geometry, color);
    upper.rotation.y = -Math.PI / 2;
    upper.castShadow = true;
    upper.receiveShadow = true;
    shoe.add(upper);

    const sole = box(0.092, 0.015, 0.25, MAT.sole, { y: 0.0075, z: 0 });
    shoe.add(sole);

    if (type === 'heel') {
      shoe.add(box(0.075, 0.055, 0.035, color, { y: 0.0275, z: -0.1 }));
    }
    if (type === 'boot') {
      shoe.add(box(0.085, 0.32, 0.105, color, { y: 0.18, z: -0.07 }));
    }

    shoe.position.x = x;
    shoe.rotation.y = 0.04 * Math.sign(x || 1);
    return shoe;
  };

  group.add(makeShoe(-0.055), makeShoe(0.055));
  return group;
}

function createShoeBox(width = 0.22, height = 0.075, depth = 0.17) {
  const group = new THREE.Group();
  const body = box(width, height, depth, MAT.box, { y: height / 2 });
  const lid = box(width + 0.012, 0.012, depth + 0.012, MAT.boxLid, { y: height + 0.006 });
  const band = box(0.025, height + 0.002, depth + 0.014, MAT.boxLid, { x: 0, y: height / 2 });
  group.add(body, lid, band);
  return group;
}

function createBag() {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.13, 0);
  shape.quadraticCurveTo(-0.16, 0.02, -0.155, 0.17);
  shape.quadraticCurveTo(0, 0.225, 0.155, 0.17);
  shape.quadraticCurveTo(0.16, 0.02, 0.13, 0);
  shape.quadraticCurveTo(0, -0.025, -0.13, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  geometry.translate(0, 0, -0.06);
  const body = new THREE.Mesh(geometry, MAT.bag);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const flap = box(0.29, 0.035, 0.122, MAT.bagEdge, { y: 0.165, z: 0 });
  group.add(flap);

  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.068, 0.009, 8, 20, Math.PI),
    MAT.bagEdge,
  );
  handle.position.set(0, 0.205, 0);
  handle.castShadow = true;
  group.add(handle);
  return group;
}

function createCushion(width, depth) {
  const group = new THREE.Group();
  const base = box(width, CUSHION_T, depth, MAT.cushion, { y: CUSHION_T / 2 });
  const top = box(width - 0.025, 0.012, depth - 0.025, MAT.cushion, { y: CUSHION_T - 0.002 });
  group.add(base, top);
  return group;
}

function addShoeRow(parent, { xCenter, y, z, count, type, colorOffset = 0, spacing = 0.25, scale = 1 }) {
  const start = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i += 1) {
    const pair = createShoePair(type, colorOffset + i);
    pair.position.set(xCenter + start + i * spacing, y, z);
    pair.scale.setScalar(scale);
    parent.add(pair);
  }
}

function addShoeBoxRow(parent, { xCenter, y, z, count, spacing = 0.25, scale = 1 }) {
  const start = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i += 1) {
    const boxProp = createShoeBox();
    boxProp.position.set(xCenter + start + i * spacing, y, z);
    boxProp.rotation.y = (i - 1) * 0.04;
    boxProp.scale.setScalar(scale);
    parent.add(boxProp);
  }
}

function buildCabinet() {
  interactiveParts = [];

  const W = state.W / 1000;
  const H = state.H / 1000;
  const D = state.D / 1000;
  const frontD = state.frontD / 1000;
  const backD = state.backD / 1000;
  const backW = state.backW / 1000;
  const backPull = state.backPull / 1000;
  const t = state.t / 1000;
  const topGap = state.topGap / 1000;
  const leftW = LEFT_W / 1000;
  const midW = state.midW / 1000;
  const narrowW = NARROW_W / 1000;
  const benchW = state.benchW / 1000;
  const benchH = state.benchH / 1000;
  const benchPull = state.benchPull / 1000;

  const doorT = t;
  const frontCenterZ = backD / 2;
  const bodyFront = frontD / 2 - doorT + frontCenterZ;
  const carcassD = frontD - doorT;
  const carcassZ = -doorT / 2 + frontCenterZ;
  const interiorD = frontD - doorT - BACK_T;
  const interiorZ = (BACK_T - doorT) / 2 + frontCenterZ;
  const leftInteriorD = D - BACK_T;
  const leftInteriorZ = BACK_T / 2;
  const doorZ = frontD / 2 - doorT / 2 + frontCenterZ;
  const topPanelTop = H - topGap;
  const topPanelBottom = topPanelTop - t;

  SCENE.doorT = doorT;
  SCENE.doorZ = doorZ;
  SCENE.bodyFront = bodyFront;
  SCENE.interiorD = interiorD;
  SCENE.interiorZ = interiorZ;
  SCENE.depth = D;
  SCENE.frontD = frontD;
  SCENE.backD = backD;
  SCENE.backW = backW;

  const x0 = -W / 2;
  const leftInner0 = x0 + t;
  const leftInner1 = leftInner0 + leftW;
  const midInner0 = leftInner1 + t;
  const midInner1 = midInner0 + midW;
  const narrowInner0 = midInner1 + t;
  const narrowInner1 = narrowInner0 + narrowW;
  const x1 = W / 2;

  const leftCenter = (leftInner0 + leftInner1) / 2;
  const midCenter = (midInner0 + midInner1) / 2;
  const narrowCenter = (narrowInner0 + narrowInner1) / 2;
  const divider1X = leftInner1 + t / 2;
  const divider2X = midInner1 + t / 2;

  doorsGroup = new THREE.Group();
  doorsGroup.name = 'doors';
  cabinetGroup.add(doorsGroup);

  // Carcass: the 408 left cabinet runs the full 800 depth; the 1220 front
  // middle/right is 400 deep, with the 1220 back shoe rack behind it.
  cabinetGroup.add(
    box(t, H, D, materials.whiteCarcass, { x: x0 + t / 2, y: H / 2, z: 0 }),
    box(t, H, carcassD, materials.whiteCarcass, { x: x1 - t / 2, y: H / 2, z: carcassZ }),
    box(t, H, D, materials.whiteCarcass, { x: divider1X, y: H / 2, z: 0 }),
    box(leftInner1 - x0, t, D, materials.whiteCarcass, {
      x: (x0 + leftInner1) / 2,
      y: topPanelBottom + t / 2,
      z: 0,
    }),
    box(x1 - leftInner1, t, carcassD, materials.whiteCarcass, {
      x: (leftInner1 + x1) / 2,
      y: topPanelBottom + t / 2,
      z: carcassZ,
    }),
    box(W - 2 * t, H, BACK_T, materials.wood, {
      y: H / 2,
      z: -D / 2 + BACK_T / 2,
      cast: false,
    }),
    box(narrowInner1 - leftInner1, H, BACK_T, materials.wood, {
      x: (leftInner1 + narrowInner1) / 2,
      y: H / 2,
      z: frontCenterZ - frontD / 2 + BACK_T / 2,
      cast: false,
    }),
  );

  // No toe kick or bottom panel in the front row: the lowest layer is the floor.

  // The cabinet runs to 2303 without a top gap; no separate top filler.

  // Left column: bag niche, hanging zone, knee space, bench.
  const benchTop = benchH;
  const kneeTop = benchTop + state.kneeH / 1000;
  const hangShelfY = kneeTop + t / 2;
  const hangBottom = kneeTop + t;
  const hangTop = hangBottom + 0.98;
  const bagShelfY = hangTop + t / 2;
  const bagBottom = hangTop + t;

  cabinetGroup.add(
    box(leftW, t, leftInteriorD, materials.wood, { x: leftCenter, y: hangShelfY, z: leftInteriorZ }),
    box(leftW, t, leftInteriorD, materials.wood, { x: leftCenter, y: bagShelfY, z: leftInteriorZ }),
  );

  const rodY = hangTop - 0.06;
  const rod = cylinder(0.0125, leftW - 0.02, materials.woodDark, {
    x: leftCenter,
    y: rodY,
    z: leftInteriorZ,
  });
  rod.rotation.z = Math.PI / 2;
  cabinetGroup.add(rod);

  // Left cabinet is intentionally open: no doors on the 408-wide full-depth bay.

  // Front bank: middle 800 + right 420 = 1220 net; the bottom two layers
  // run through both; 170 drawer, 370 entry counter, upper 5.
  const frontX0 = midInner0;
  const frontX1 = narrowInner1;
  const frontW = frontX1 - frontX0;
  const frontCenterX = (frontX0 + frontX1) / 2;
  const midMeetingX = (midInner0 + midInner1) / 2;

  const addFullShelf = (y) =>
    cabinetGroup.add(box(frontW, t, interiorD, materials.wood, {
      x: frontCenterX, y: y + t / 2, z: interiorZ,
    }));
  const addSplitShelf = (y) =>
    cabinetGroup.add(
      box(midW, t, interiorD, materials.wood, { x: midCenter, y: y + t / 2, z: interiorZ }),
      box(narrowW, t, interiorD, materials.wood, { x: narrowCenter, y: y + t / 2, z: interiorZ }),
    );

  let fy = 0;
  const frontBottomCells = [];
  FRONT_BOTTOM.forEach((heightMm, index) => {
    const height = heightMm / 1000;
    frontBottomCells.push({ bottom: fy, top: fy + height });
    fy += height;
    if (index < FRONT_BOTTOM.length - 1) {
      if (index < 2) addFullShelf(fy);
      else addSplitShelf(fy);
      fy += t;
    }
  });
  // Shelf above the 170 layer is the drawer bottom, split at the middle/right.
  addSplitShelf(fy);
  fy += t;
  const drawerBottom = fy;
  const drawerTop = drawerBottom + FRONT_DRAWER / 1000;
  addDrawer({
    xCenter: midCenter,
    width: midW - 0.006,
    yBottom: drawerBottom + GAP / 2,
    yTop: drawerTop - GAP / 2,
    label: '前柜抽屉 170',
  });

  // Entry counter: full-width surface above the drawer; 370 open niche above.
  addFullShelf(drawerTop);
  const nicheBottom = drawerTop + t;
  const nicheTop = nicheBottom + FRONT_NICHE / 1000;
  addFullShelf(nicheTop);
  const upperBottom = nicheTop + t;

  let uy = upperBottom;
  const frontUpperCells = [];
  FRONT_UPPER.forEach((heightMm, index) => {
    const height = heightMm / 1000;
    frontUpperCells.push({ bottom: uy, top: uy + height });
    uy += height;
    if (index < FRONT_UPPER.length - 1) {
      addSplitShelf(uy);
      uy += t;
    }
  });
  const topPanelThickness = Math.max(0.012, H - uy);
  cabinetGroup.add(box(frontW, topPanelThickness, interiorD, materials.wood, {
    x: frontCenterX, y: uy + topPanelThickness / 2, z: interiorZ,
  }));

  // Middle upper 5 doors; right upper 5 open; no lower doors.
  addDoor({
    xLeft: midInner0 + GAP,
    xRight: midMeetingX - GAP / 2,
    yBottom: upperBottom + GAP / 2,
    yTop: H - GAP,
    hinge: 'left',
    label: '前柜上门（左）',
  });
  addDoor({
    xLeft: midMeetingX + GAP / 2,
    xRight: midInner1 - GAP,
    yBottom: upperBottom + GAP / 2,
    yTop: H - GAP,
    hinge: 'right',
    label: '前柜上门（右）',
  });

  // Divider 2 only above the through bottom two layers and above the niche:
  // 356-1010 for the upper-3 + drawer, 1416-2303 for the upper 5.
  cabinetGroup.add(
    box(t, 1.010 - 0.356, carcassD, materials.whiteCarcass, {
      x: divider2X, y: (0.356 + 1.010) / 2, z: carcassZ,
    }),
    box(t, H - 1.416, carcassD, materials.whiteCarcass, {
      x: divider2X, y: (1.416 + H) / 2, z: carcassZ,
    }),
  );

  // Pull-out bench: 300 wide, right-aligned against the middle divider.
  const benchCenterX = leftInner1 - benchW / 2;
  const benchGroup = new THREE.Group();
  benchGroup.name = 'shoe-bench';
  benchGroup.position.set(benchCenterX, 0, 0);
  cabinetGroup.add(benchGroup);

  const bodyBottom = WHEEL_R * 2;
  const bodyHeight = benchH - CUSHION_T - bodyBottom;
  const bodyCenterY = bodyBottom + bodyHeight / 2;
  const bodyDepth = interiorD - 0.02;

  benchGroup.add(
    box(benchW, bodyHeight, bodyDepth, materials.whiteCarcass, {
      y: bodyCenterY,
      z: interiorZ,
    }),
    box(benchW, bodyHeight, doorT, materials.whiteDoor, {
      y: bodyCenterY,
      z: bodyFront - doorT / 2,
    }),
    box(benchW - 0.02, CUSHION_T, bodyDepth - 0.02, MAT.cushion, {
      y: benchH - CUSHION_T / 2,
      z: interiorZ,
    }),
    box(0.12, 0.006, 0.004, MAT.pull, {
      y: benchH - CUSHION_T - 0.028,
      z: bodyFront + 0.002,
    }),
  );

  const wheelPositions = [
    [-benchW / 2 + 0.045, interiorZ - bodyDepth / 2 + 0.07],
    [benchW / 2 - 0.045, interiorZ - bodyDepth / 2 + 0.07],
    [-benchW / 2 + 0.045, interiorZ + bodyDepth / 2 - 0.07],
    [benchW / 2 - 0.045, interiorZ + bodyDepth / 2 - 0.07],
  ];
  wheelPositions.forEach(([x, z]) => {
    const wheel = cylinder(WHEEL_R, 0.018, materials.metal, {
      x,
      y: WHEEL_R,
      z,
      radialSegments: 14,
    });
    wheel.rotation.z = Math.PI / 2;
    benchGroup.add(wheel);
    benchGroup.add(
      box(0.018, 0.02, 0.03, materials.metal, { x, y: bodyBottom + 0.005, z }),
    );
  });

  const benchPart = {
    type: 'bench',
    group: benchGroup,
    open: 0,
    target: 0,
    travel: benchPull,
    label: '抽拉换鞋凳 420',
  };
  benchGroup.userData.part = benchPart;
  benchGroup.traverse((object) => {
    if (object.isMesh) object.userData.part = benchPart;
  });
  interactiveParts.push(benchPart);

  // Props.
  propsGroup = new THREE.Group();
  propsGroup.name = 'props';
  cabinetGroup.add(propsGroup);

  const bag = createBag();
  bag.position.set(leftCenter, bagBottom + 0.02, interiorZ + 0.02);
  propsGroup.add(bag);

  for (let i = 0; i < 2; i += 1) {
    const garment = createHangingGarment(materials, i + 1, 0.86, 0.3);
    garment.position.set(leftCenter + (i === 0 ? -0.085 : 0.085), rodY, leftInteriorZ);
    propsGroup.add(garment);
  }

  // Bottom five layers: bottom two run through the full 1220; upper three split.
  frontBottomCells.forEach((cell, index) => {
    if (index < 2) {
      addShoeRow(propsGroup, {
        xCenter: frontCenterX,
        y: cell.bottom + 0.002,
        z: interiorZ + 0.035,
        count: 6,
        type: index === 0 ? 'slipper' : 'sneaker',
        colorOffset: index * 3,
        spacing: 0.2,
      });
    } else {
      addShoeRow(propsGroup, {
        xCenter: midCenter,
        y: cell.bottom + 0.002,
        z: interiorZ + 0.035,
        count: 4,
        type: index === 4 ? 'boot' : 'sneaker',
        colorOffset: index * 2,
        spacing: 0.2,
      });
      addShoeRow(propsGroup, {
        xCenter: narrowCenter,
        y: cell.bottom + 0.002,
        z: interiorZ + 0.03,
        count: 2,
        type: index === 4 ? 'boot' : 'heel',
        colorOffset: index + 1,
        spacing: 0.2,
      });
    }
  });

  // 370 entry niche: bag, tray, keys.
  const nicheBag = createBag();
  nicheBag.position.set(frontCenterX - 0.32, nicheBottom, interiorZ + 0.02);
  propsGroup.add(nicheBag);

  const tray = box(0.42, 0.018, 0.24, materials.woodDark, {
    x: frontCenterX + 0.24,
    y: nicheBottom + 0.02,
    z: interiorZ + 0.06,
  });
  const trayRimA = box(0.42, 0.035, 0.018, materials.woodDark, {
    x: frontCenterX + 0.24,
    y: nicheBottom + 0.035,
    z: interiorZ + 0.06 - 0.111,
  });
  const trayRimB = box(0.42, 0.035, 0.018, materials.woodDark, {
    x: frontCenterX + 0.24,
    y: nicheBottom + 0.035,
    z: interiorZ + 0.06 + 0.111,
  });
  const keyA = box(0.08, 0.012, 0.025, materials.metal, {
    x: frontCenterX + 0.12,
    y: nicheBottom + 0.045,
    z: interiorZ + 0.06,
  });
  const keyB = box(0.07, 0.012, 0.025, materials.metal, {
    x: frontCenterX + 0.33,
    y: nicheBottom + 0.045,
    z: interiorZ + 0.06,
  });
  propsGroup.add(tray, trayRimA, trayRimB, keyA, keyB);

  // Upper 5: middle behind doors, right open; shoe boxes.
  frontUpperCells.forEach((cell) => {
    addShoeBoxRow(propsGroup, {
      xCenter: midCenter,
      y: cell.bottom + 0.002,
      z: interiorZ + 0.035,
      count: 3,
      spacing: 0.24,
      scale: 0.8,
    });
    addShoeBoxRow(propsGroup, {
      xCenter: narrowCenter,
      y: cell.bottom + 0.002,
      z: interiorZ + 0.035,
      count: 1,
      spacing: 0,
      scale: 0.8,
    });
  });

  // Right under-counter 170 slot: a basket.
  const counterBasket = createBasket(0.28, 0.14, 0.3, materials);
  counterBasket.position.set(narrowCenter, drawerBottom + 0.002, interiorZ + 0.02);
  propsGroup.add(counterBasket);

  // Back layer: 1220 wide, exactly the front middle+right width, behind the
  // front 400 and against the flat wall. It slides out to the right.
  const rackLeft = midInner0;
  const rackRight = midInner0 + backW;
  const rackCenterX = (rackLeft + rackRight) / 2;
  const rackBackZ = -backD;
  const rackCenterZ = -backD / 2;
  const backInteriorZ = -backD / 2 + BACK_T;
  const backInteriorD = backD - 2 * BACK_T;
  const rackInnerW = backW - 2 * t;

  const rackGroup = new THREE.Group();
  rackGroup.name = 'back-rack';
  cabinetGroup.add(rackGroup);

  rackGroup.add(
    box(t, H, backD, materials.whiteCarcass, { x: rackLeft + t / 2, y: H / 2, z: rackCenterZ }),
    box(t, H, backD, materials.whiteCarcass, { x: rackRight - t / 2, y: H / 2, z: rackCenterZ }),
    box(backW, t, backD, materials.whiteCarcass, { x: rackCenterX, y: topPanelBottom + t / 2, z: rackCenterZ }),
    box(backW, t, backD, materials.whiteCarcass, { x: rackCenterX, y: t / 2, z: rackCenterZ }),
    box(backW - 2 * t, H, BACK_T, materials.whiteCarcass, {
      x: rackCenterX,
      y: H / 2,
      z: rackBackZ + BACK_T * 1.5,
      cast: false,
    }),
    box(backW, topGap, backD, materials.whiteEdge, {
      x: rackCenterX,
      y: H - topGap / 2,
      z: rackCenterZ,
    }),
  );

  let rackCursor = t;
  const rackCells = [];
  [...state.backHeights].reverse().forEach((heightMm, index, list) => {
    const height = heightMm / 1000;
    rackCells.push({ bottom: rackCursor, top: rackCursor + height, height });
    rackCursor += height;
    if (index < list.length - 1) {
      rackGroup.add(
        box(rackInnerW, t, backInteriorD, materials.whiteCarcass, {
          x: rackCenterX,
          y: rackCursor + t / 2,
          z: backInteriorZ,
        }),
      );
      rackCursor += t;
    }
  });

  rackPropsGroup = new THREE.Group();
  rackGroup.add(rackPropsGroup);
  const rackCount = 5;
  const rackShoeScale = 0.72;
  const rackShoeSpacing = 0.23;
  const rackBoxScale = 0.66;

  rackCells.forEach((cell, index) => {
    if (index === rackCells.length - 1) {
      addShoeBoxRow(rackPropsGroup, {
        xCenter: rackCenterX,
        y: cell.bottom + 0.002,
        z: backInteriorZ + 0.02,
        count: 4,
        spacing: 0.16,
        scale: rackBoxScale,
      });
    } else if (index === rackCells.length - 2) {
      addShoeRow(rackPropsGroup, {
        xCenter: rackCenterX,
        y: cell.bottom + 0.002,
        z: backInteriorZ + 0.02,
        count: 2,
        type: 'boot',
        colorOffset: 2,
        spacing: 0.3,
        scale: 0.8,
      });
    } else if (index >= 4) {
      addShoeRow(rackPropsGroup, {
        xCenter: rackCenterX,
        y: cell.bottom + 0.002,
        z: backInteriorZ + 0.02,
        count: rackCount,
        type: index % 2 === 0 ? 'heel' : 'sneaker',
        colorOffset: index + 1,
        spacing: rackShoeSpacing,
        scale: rackShoeScale,
      });
    } else {
      addShoeRow(rackPropsGroup, {
        xCenter: rackCenterX,
        y: cell.bottom + 0.002,
        z: backInteriorZ + 0.02,
        count: 4,
        type: 'slipper',
        colorOffset: index + 3,
        spacing: rackShoeSpacing,
        scale: rackShoeScale,
      });
    }
  });

  const rackHandleZ = -0.06;
  rackGroup.add(
    box(0.02, 0.12, 0.03, materials.metal, {
      x: rackRight + 0.01,
      y: 1.0,
      z: rackHandleZ,
    }),
    box(0.012, 0.02, 0.02, materials.metal, {
      x: rackRight + 0.003,
      y: 0.94,
      z: rackHandleZ,
    }),
    box(0.012, 0.02, 0.02, materials.metal, {
      x: rackRight + 0.003,
      y: 1.06,
      z: rackHandleZ,
    }),
  );

  const rackPart = {
    type: 'backRack',
    group: rackGroup,
    open: 0,
    target: 0,
    travel: backPull,
    label: '后层抽拉鞋架（向右拉出）',
  };
  rackGroup.userData.part = rackPart;
  rackGroup.traverse((object) => {
    if (object.isMesh) object.userData.part = rackPart;
  });
  interactiveParts.push(rackPart);

  dimensionGroup = createDimensions({ width: W, height: H, depth: D }, materials);
  cabinetGroup.add(dimensionGroup);

  updateRoom(room, { width: W, height: H, depth: D });
  applyVisibility();
}

function applyVisibility() {
  if (propsGroup) propsGroup.visible = state.showProps;
  if (rackPropsGroup) rackPropsGroup.visible = state.showProps;
  if (dimensionGroup) dimensionGroup.visible = state.showDims;
  if (doorsGroup) doorsGroup.visible = state.showDoors;
}

function fitCabinet(direction) {
  const W = state.W / 1000;
  const H = state.H / 1000;
  const D = state.D / 1000;
  fitCamera(viewer.camera, viewer.controls, { width: W, height: H, depth: D }, {
    direction,
    margin: 1.32,
  });
}

function rebuild() {
  normalizeState();
  const direction = viewer.camera.position.clone().sub(viewer.controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.62, 0.16, 1);
  direction.normalize();

  disposeGroup(cabinetGroup);
  buildCabinet();

  fitCabinet(firstBuild ? new THREE.Vector3(0.62, 0.16, 1) : direction);
  firstBuild = false;

  renderUI();
  if (loading) loading.classList.add('is-hidden');
}

function resetView() {
  fitCabinet(new THREE.Vector3(0.62, 0.16, 1));
}

function setPartTargets(open) {
  interactiveParts.forEach((part) => {
    part.target = open ? 1 : 0;
  });
}

function isVisible(object) {
  let current = object;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return true;
}

function findPart(intersections) {
  for (const hit of intersections) {
    if (!isVisible(hit.object)) continue;
    let object = hit.object;
    while (object) {
      if (object.userData && object.userData.part) return object.userData.part;
      object = object.parent;
    }
  }
  return null;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = { x: 0, y: 0 };

function updatePointer(event) {
  const rect = viewer.renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickPart(event) {
  updatePointer(event);
  raycaster.setFromCamera(pointer, viewer.camera);
  return findPart(raycaster.intersectObjects(cabinetGroup.children, true));
}

viewer.renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY };
});

viewer.renderer.domElement.addEventListener('pointerup', (event) => {
  if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) return;
  const part = pickPart(event);
  if (part) part.target = part.target > 0.5 ? 0 : 1;
});

viewer.renderer.domElement.addEventListener('pointermove', (event) => {
  const part = pickPart(event);
  viewer.renderer.domElement.style.cursor = part ? 'pointer' : 'grab';
  if (!part) {
    tooltip.classList.remove('is-visible');
    return;
  }
  tooltip.textContent = part.label;
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
  tooltip.classList.add('is-visible');
});

viewer.renderer.domElement.addEventListener('pointerleave', () => {
  tooltip.classList.remove('is-visible');
  viewer.renderer.domElement.style.cursor = 'grab';
});

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

document.getElementById('open-all').addEventListener('click', () => setPartTargets(true));
document.getElementById('close-all').addEventListener('click', () => setPartTargets(false));
document.getElementById('reset-view').addEventListener('click', resetView);

document.getElementById('show-dims').addEventListener('change', (event) => {
  state.showDims = event.target.checked;
  if (dimensionGroup) dimensionGroup.visible = state.showDims;
});

document.getElementById('show-props').addEventListener('change', (event) => {
  state.showProps = event.target.checked;
  applyVisibility();
});

document.getElementById('show-doors').addEventListener('change', (event) => {
  state.showDoors = event.target.checked;
  applyVisibility();
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  for (const part of interactiveParts) {
    if (Math.abs(part.open - part.target) > 0.0005) {
      part.open = damp(part.open, part.target, 8.5, delta);
      if (part.type === 'door') {
        part.group.rotation.y = part.hingeSign * part.open * part.angle;
      } else if (part.type === 'drawer' || part.type === 'bench') {
        part.group.position.z = part.open * part.travel;
      } else if (part.type === 'backRack') {
        part.group.position.x = part.open * part.travel;
      }
    }
  }
  viewer.controls.update();
  viewer.renderer.render(viewer.scene, viewer.camera);
  viewer.labelRenderer.render(viewer.scene, viewer.camera);
}

normalizeState();
renderUI();
rebuild();
animate();
