import {
  THREE,
  createViewer,
  createLights,
  createMaterials,
  createRoom,
  updateRoom,
  box,
  cylinder,
  createHangingGarment,
  createDimensions,
  disposeGroup,
  fitCamera,
  damp,
} from '../assets/js/viewer-core.js';

const DEFAULTS = {
  W: 1700,
  H: 2303,
  D: 750,
  backD: 350,
  backW: 350,
  backPull: 400,
  benchW: 300,
  benchH: 420,
  benchPull: 500,
  t: 18,
  toeKick: 50,
  topGap: 30,
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

const state = {
  ...DEFAULTS,
  showDims: true,
  showProps: true,
  showDoors: true,
  frontD: 400,
  midW: 0,
  kneeH: 0,
  midBottomH: 0,
  midShoeH: 0,
  midUpperH: 0,
  midUpperParts: [],
  midShoeParts: [],
  narrowHeights: [],
  backHeights: [],
  leftDoorW: 0,
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
  backW: 0.35,
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

// The shoe cabinet uses a stepped wall: the left/middle front layer sits
// against a 400-deep wall, while the right 350-wide back rack sits in a niche.
room.wall.visible = false;
room.baseboard.visible = false;

const shell = {
  front: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materials.wall),
  nicheBack: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materials.wall),
  nicheSide: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materials.wall),
};
Object.values(shell).forEach((piece) => {
  piece.receiveShadow = true;
  room.group.add(piece);
});

function updateShell() {
  const W = state.W / 1000;
  const frontD = state.frontD / 1000;
  const backD = state.backD / 1000;
  const backW = state.backW / 1000;

  shell.front.scale.set(Math.max(0.05, W - backW), 3.4, 1);
  shell.front.position.set(-backW / 2, 1.7, -frontD / 2 - 0.001);

  shell.nicheBack.scale.set(Math.max(0.05, backW), 3.4, 1);
  shell.nicheBack.position.set(W / 2 - backW / 2, 1.7, -frontD / 2 - backD - 0.001);

  shell.nicheSide.scale.set(Math.max(0.05, backD), 3.4, 1);
  shell.nicheSide.position.set(W / 2 - backW, 1.7, -frontD / 2 - backD / 2);
  shell.nicheSide.rotation.y = Math.PI / 2;

  room.contactShadow.position.z = -backD / 2;
}

const cabinetGroup = new THREE.Group();
cabinetGroup.name = 'shoe-cabinet';
viewer.scene.add(cabinetGroup);

const MAT = {
  toeKick: new THREE.MeshStandardMaterial({ color: 0x3c3731, roughness: 0.94 }),
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
let boardPropsGroup = null;
let rackPropsGroup = null;
let doorsGroup = null;
let dimensionGroup = null;
let firstBuild = true;

function normalizeState() {
  state.W = clamp(state.W, 1600, 1800);
  state.H = clamp(state.H, 2100, 2500);
  state.D = clamp(state.D, 650, 850);
  state.backD = clamp(state.backD, 300, 400);
  state.t = clamp(Math.round(state.t), 16, 25);
  state.toeKick = clamp(state.toeKick, 30, 100);
  state.topGap = clamp(state.topGap, 10, 60);
  state.benchH = clamp(state.benchH, 380, 460);
  state.benchPull = clamp(state.benchPull, 300, 600);
  state.benchMaxW = LEFT_W - 2 * state.t;
  state.benchW = clamp(state.benchW, 260, state.benchMaxW);
  state.backW = clamp(state.backW, 300, NARROW_W);
  state.backPull = clamp(state.backPull, 300, 600);

  state.frontD = state.D - state.backD;
  if (state.frontD < 350) {
    state.frontD = 350;
    state.backD = state.D - state.frontD;
  }
  if (state.frontD > 500) {
    state.frontD = 500;
    state.backD = state.D - state.frontD;
  }
  state.backD = clamp(state.backD, 300, 400);
  state.frontD = state.D - state.backD;

  state.midW = clamp(state.W - LEFT_W - NARROW_W - 4 * state.t, 700, 900);
  state.W = LEFT_W + state.midW + NARROW_W + 4 * state.t;

  state.kneeH = state.H - state.topGap - 3 * state.t - 400 - 980 - state.benchH;

  const midFixed = state.toeKick + state.topGap + 120 + 12 * state.t;
  const midScale = Math.max(0.5, (state.H - midFixed) / 1920);
  state.midBottomH = 420 * midScale;
  state.midShoeH = 570 * midScale;
  state.midUpperH = 930 * midScale;
  state.midUpperParts = MID_UPPER_RATIOS.map((value) => value * (state.midUpperH / 930));
  state.midShoeParts = MID_SHOE_RATIOS.map((value) => value * (state.midShoeH / 570));

  const narrowAvail = state.H - state.toeKick - state.topGap - 10 * state.t;
  const narrowScale = Math.max(0.5, narrowAvail / NARROW_RATIO_SUM);
  state.narrowHeights = NARROW_RATIOS.map((value) => value * narrowScale);

  const backAvail = state.H - state.topGap - 11 * state.t;
  const backScale = Math.max(0.5, backAvail / BACK_RATIO_SUM);
  state.backHeights = BACK_RATIOS.map((value) => value * backScale);

  state.leftDoorW = LEFT_W - 6;
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
  document.getElementById('mid-width').textContent = `${format(state.midW, 0)} mm`;
  document.getElementById('narrow-width').textContent = `${NARROW_W} mm`;
  document.getElementById('left-zones').textContent =
    `400 / 980 / ${format(state.kneeH, 0)} / ${format(state.benchH, 0)}`;
  document.getElementById('mid-zones').textContent =
    `${format(state.midUpperH, 0)} / 120 / ${format(state.midShoeH, 0)} / ${format(state.midBottomH, 0)}`;
  document.getElementById('left-door-width').textContent = `${format(state.leftDoorW, 1)} mm`;
  document.getElementById('mid-door-width').textContent = `${format(state.midDoorW, 1)} mm`;
  document.getElementById('bench-size').textContent =
    `${format(state.benchW, 0)} × ${format(state.benchH, 0)} / ${format(state.benchPull, 0)}`;
  document.getElementById('narrow-heights').textContent =
    `${state.narrowHeights.map((value) => format(value, 0)).join(' / ')} mm`;
  document.getElementById('front-depth').textContent =
    `${format(state.frontD, 0)} / ${format(state.backD, 0)} mm`;
  document.getElementById('back-rack').textContent =
    `${format(state.backW, 0)} × ${format(state.H, 0)} / 抽拉 ${format(state.backPull, 0)}`;
  document.getElementById('back-heights').textContent =
    `${state.backHeights.map((value) => format(value, 0)).join(' / ')} mm`;

  const warnings = [];
  if (state.kneeH < 300) warnings.push(`坐凳上空 ${format(state.kneeH, 0)} mm < 300`);
  if (state.midW < 740) warnings.push(`中段净宽 ${format(state.midW, 0)} mm < 740`);
  if (state.midShoeParts[3] < 90) warnings.push(`中段最下层 ${format(state.midShoeParts[3], 0)} mm < 90`);
  if (state.narrowHeights[8] < 100) warnings.push(`窄柜最下层 ${format(state.narrowHeights[8], 0)} mm < 100`);
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
  const toeKick = state.toeKick / 1000;
  const topGap = state.topGap / 1000;
  const leftW = LEFT_W / 1000;
  const midW = state.midW / 1000;
  const narrowW = NARROW_W / 1000;
  const benchW = state.benchW / 1000;
  const benchH = state.benchH / 1000;
  const benchPull = state.benchPull / 1000;

  const doorT = t;
  const bodyFront = frontD / 2 - doorT;
  const carcassD = frontD - doorT;
  const carcassZ = -doorT / 2;
  const interiorD = frontD - doorT - BACK_T;
  const interiorZ = (BACK_T - doorT) / 2;
  const doorZ = frontD / 2 - doorT / 2;
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

  // Carcass: five vertical panels, top, back, and the middle/narrow bottom.
  cabinetGroup.add(
    box(t, H, carcassD, materials.whiteCarcass, { x: x0 + t / 2, y: H / 2, z: carcassZ }),
    box(t, H, carcassD, materials.whiteCarcass, { x: x1 - t / 2, y: H / 2, z: carcassZ }),
    box(t, H, carcassD, materials.whiteCarcass, { x: divider1X, y: H / 2, z: carcassZ }),
    box(t, H, carcassD, materials.whiteCarcass, { x: divider2X, y: H / 2, z: carcassZ }),
    box(W, t, carcassD, materials.whiteCarcass, { y: topPanelBottom + t / 2, z: carcassZ }),
    box(W - 2 * t, H, BACK_T, materials.wood, {
      y: H / 2,
      z: -frontD / 2 + BACK_T / 2,
      cast: false,
    }),
    box(narrowInner1 - leftInner1, t, carcassD, materials.whiteCarcass, {
      x: (leftInner1 + narrowInner1) / 2,
      y: toeKick + t / 2,
      z: carcassZ,
    }),
  );

  // Recessed toe kick under the middle and open tower. The bench bay is open to the floor.
  cabinetGroup.add(
    box(narrowInner1 - leftInner1, toeKick, 0.018, MAT.toeKick, {
      x: (leftInner1 + narrowInner1) / 2,
      y: toeKick / 2,
      z: bodyFront - 0.05 - 0.009,
      cast: false,
    }),
  );

  // 30 mm top scribe/filler across the front.
  cabinetGroup.add(
    box(W, topGap, doorT, materials.whiteEdge, {
      y: H - topGap / 2,
      z: doorZ,
    }),
  );

  // Left column: bag niche, hanging zone, knee space, bench.
  const benchTop = benchH;
  const kneeTop = benchTop + state.kneeH / 1000;
  const hangShelfY = kneeTop + t / 2;
  const hangBottom = kneeTop + t;
  const hangTop = hangBottom + 0.98;
  const bagShelfY = hangTop + t / 2;
  const bagBottom = hangTop + t;

  cabinetGroup.add(
    box(leftW, t, interiorD, materials.wood, { x: leftCenter, y: hangShelfY, z: interiorZ }),
    box(leftW, t, interiorD, materials.wood, { x: leftCenter, y: bagShelfY, z: interiorZ }),
  );

  const rodY = hangTop - 0.06;
  const rod = cylinder(0.0125, leftW - 0.02, materials.woodDark, {
    x: leftCenter,
    y: rodY,
    z: interiorZ,
  });
  rod.rotation.z = Math.PI / 2;
  cabinetGroup.add(rod);

  // Left two doors: upper bag niche, lower hanging zone. They meet over the bag shelf.
  const leftDoorMeetingY = bagShelfY;
  addDoor({
    xLeft: leftInner0 + GAP,
    xRight: leftInner1 - GAP,
    yBottom: leftDoorMeetingY + GAP / 2,
    yTop: topPanelTop - GAP,
    hinge: 'left',
    label: '左柜上门（包袋格）',
  });
  addDoor({
    xLeft: leftInner0 + GAP,
    xRight: leftInner1 - GAP,
    yBottom: kneeTop - GAP / 2,
    yTop: leftDoorMeetingY - GAP / 2,
    hinge: 'left',
    label: '左柜下门（挂衣区）',
  });

  // Middle: bottom open bay, shoe shelves, 120 drawer, upper storage.
  const midBottomStart = toeKick + t;
  const midBottomTop = midBottomStart + state.midBottomH / 1000;
  const midBottomShelfY = midBottomTop + t / 2;

  cabinetGroup.add(
    box(midW, t, interiorD, materials.wood, { x: midCenter, y: midBottomShelfY, z: interiorZ }),
  );

  let cursorY = midBottomTop + t;
  const shoeCells = [];
  state.midShoeParts.forEach((heightMm, index) => {
    const height = heightMm / 1000;
    shoeCells.push({ bottom: cursorY, top: cursorY + height, height });
    cursorY += height;
    if (index < state.midShoeParts.length - 1) {
      cabinetGroup.add(
        box(midW, t, interiorD, materials.wood, { x: midCenter, y: cursorY + t / 2, z: interiorZ }),
      );
      cursorY += t;
    }
  });
  const shoeTop = cursorY;

  const drawerShelfY = shoeTop + t / 2;
  cabinetGroup.add(
    box(midW, t, interiorD, materials.wood, { x: midCenter, y: drawerShelfY, z: interiorZ }),
  );
  const drawerBottom = shoeTop + t;
  const drawerTop = drawerBottom + 0.12;
  const upperShelfY = drawerTop + t / 2;
  cabinetGroup.add(
    box(midW, t, interiorD, materials.wood, { x: midCenter, y: upperShelfY, z: interiorZ }),
  );

  const upperBottom = drawerTop + t;
  let upperCursor = upperBottom;
  const upperCells = [];
  state.midUpperParts.forEach((heightMm, index) => {
    const height = heightMm / 1000;
    upperCells.push({ bottom: upperCursor, top: upperCursor + height, height });
    upperCursor += height;
    if (index < state.midUpperParts.length - 1) {
      cabinetGroup.add(
        box(midW, t, interiorD, materials.wood, { x: midCenter, y: upperCursor + t / 2, z: interiorZ }),
      );
      upperCursor += t;
    }
  });

  // Middle lower pair of doors over the four shoe bays.
  const midMeetingX = (midInner0 + midInner1) / 2;
  addDoor({
    xLeft: midInner0 + GAP,
    xRight: midMeetingX - GAP / 2,
    yBottom: midBottomTop - GAP / 2,
    yTop: drawerBottom - GAP / 2,
    hinge: 'left',
    label: '中柜下门（左）',
  });
  addDoor({
    xLeft: midMeetingX + GAP / 2,
    xRight: midInner1 - GAP,
    yBottom: midBottomTop - GAP / 2,
    yTop: drawerBottom - GAP / 2,
    hinge: 'right',
    label: '中柜下门（右）',
  });

  // 120 drawer between the shoe area and the upper storage.
  addDrawer({
    xCenter: midCenter,
    width: midW - 0.006,
    yBottom: drawerBottom + GAP / 2,
    yTop: drawerTop - GAP / 2,
    label: '中部抽屉 120',
  });

  // Middle upper pair of doors.
  addDoor({
    xLeft: midInner0 + GAP,
    xRight: midMeetingX - GAP / 2,
    yBottom: drawerTop + GAP / 2,
    yTop: topPanelTop - GAP,
    hinge: 'left',
    label: '中柜上门（左）',
  });
  addDoor({
    xLeft: midMeetingX + GAP / 2,
    xRight: midInner1 - GAP,
    yBottom: drawerTop + GAP / 2,
    yTop: topPanelTop - GAP,
    hinge: 'right',
    label: '中柜上门（右）',
  });

  // Bottom pull-out shoe board in the middle open bay.
  const boardY = midBottomStart + clamp(state.midBottomH / 2000, 0.15, 0.26);
  const boardGroup = new THREE.Group();
  boardGroup.name = 'pull-out-board';
  cabinetGroup.add(boardGroup);

  boardGroup.add(
    box(midW - 0.02, t, interiorD - 0.02, materials.wood, {
      y: boardY - t / 2,
      z: interiorZ,
    }),
    box(midW - 0.02, 0.035, 0.018, materials.whiteEdge, {
      y: boardY + 0.017,
      z: bodyFront - 0.009,
    }),
    box(0.12, 0.006, 0.004, MAT.pull, {
      y: boardY + 0.02,
      z: bodyFront + 0.002,
    }),
  );

  boardPropsGroup = new THREE.Group();
  boardGroup.add(boardPropsGroup);
  addShoeRow(boardPropsGroup, {
    xCenter: midCenter,
    y: boardY,
    z: interiorZ + 0.03,
    count: 2,
    type: 'slipper',
    colorOffset: 0,
    spacing: 0.3,
  });

  const boardPart = {
    type: 'board',
    group: boardGroup,
    open: 0,
    target: 0,
    travel: 0.3,
    label: '底部抽拉鞋板',
  };
  boardGroup.userData.part = boardPart;
  boardGroup.traverse((object) => {
    if (object.isMesh) object.userData.part = boardPart;
  });
  interactiveParts.push(boardPart);

  // Narrow open tower: nine clear bays, two boot bays at top.
  let narrowCursor = toeKick + t;
  const narrowCells = [];
  // Ratios are stored top-to-bottom; build from the floor up.
  [...state.narrowHeights].reverse().forEach((heightMm, index, list) => {
    const height = heightMm / 1000;
    narrowCells.push({ bottom: narrowCursor, top: narrowCursor + height, height });
    narrowCursor += height;
    if (index < list.length - 1) {
      cabinetGroup.add(
        box(narrowW, t, interiorD, materials.wood, {
          x: narrowCenter,
          y: narrowCursor + t / 2,
          z: interiorZ,
        }),
      );
      narrowCursor += t;
    }
  });

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
    garment.position.set(leftCenter + (i === 0 ? -0.085 : 0.085), rodY, interiorZ);
    propsGroup.add(garment);
  }

  upperCells.forEach((cell, index) => {
    addShoeBoxRow(propsGroup, {
      xCenter: midCenter,
      y: cell.bottom + 0.002,
      z: interiorZ + 0.035,
      count: 3,
      spacing: 0.25,
    });
  });

  shoeCells.forEach((cell, index) => {
    addShoeRow(propsGroup, {
      xCenter: midCenter,
      y: cell.bottom + 0.002,
      z: interiorZ + 0.035,
      count: 3,
      type: index < 2 ? 'sneaker' : index === 2 ? 'heel' : 'slipper',
      colorOffset: index * 2 + 1,
      spacing: 0.25,
    });
  });

  narrowCells.forEach((cell, index) => {
    if (index >= narrowCells.length - 2) {
      addShoeRow(propsGroup, {
        xCenter: narrowCenter,
        y: cell.bottom + 0.002,
        z: interiorZ + 0.03,
        count: 1,
        type: 'boot',
        colorOffset: index + 1,
        spacing: 0.2,
      });
    } else if (index >= narrowCells.length - 4) {
      addShoeBoxRow(propsGroup, {
        xCenter: narrowCenter,
        y: cell.bottom + 0.002,
        z: interiorZ + 0.035,
        count: 1,
      });
    } else {
      addShoeRow(propsGroup, {
        xCenter: narrowCenter,
        y: cell.bottom + 0.002,
        z: interiorZ + 0.03,
        count: 1,
        type: index % 2 === 0 ? 'sneaker' : 'heel',
        colorOffset: index,
        spacing: 0.2,
      });
    }
  });

  addShoeRow(propsGroup, {
    xCenter: midCenter,
    y: midBottomStart + 0.002,
    z: interiorZ + 0.035,
    count: 2,
    type: 'slipper',
    colorOffset: 3,
    spacing: 0.3,
  });

  // Back layer: a 350-wide, 350-deep, full-height shoe rack behind the right
  // narrow tower. It slides out to the right (side pull) on the niche.
  const rackRight = W / 2;
  const rackLeft = W / 2 - backW;
  const rackCenterX = W / 2 - backW / 2;
  const rackFrontZ = -frontD / 2;
  const rackBackZ = -frontD / 2 - backD;
  const rackCenterZ = -frontD / 2 - backD / 2;
  const backInteriorZ = -frontD / 2 - backD / 2 + BACK_T / 2;
  const backInteriorD = backD - BACK_T;
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
      z: rackBackZ + BACK_T / 2,
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
  const rackCount = state.backW >= 340 ? 2 : 1;
  const rackShoeScale = state.backW >= 340 ? 0.72 : 0.8;
  const rackShoeSpacing = state.backW >= 340 ? 0.15 : 0;
  const rackBoxScale = state.backW >= 340 ? 0.66 : 0.8;

  rackCells.forEach((cell, index) => {
    if (index === rackCells.length - 1) {
      addShoeBoxRow(rackPropsGroup, {
        xCenter: rackCenterX,
        y: cell.bottom + 0.002,
        z: backInteriorZ + 0.02,
        count: rackCount,
        spacing: 0.16,
        scale: rackBoxScale,
      });
    } else if (index === rackCells.length - 2) {
      addShoeRow(rackPropsGroup, {
        xCenter: rackCenterX,
        y: cell.bottom + 0.002,
        z: backInteriorZ + 0.02,
        count: 1,
        type: 'boot',
        colorOffset: 2,
        spacing: 0,
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
        count: rackCount,
        type: 'slipper',
        colorOffset: index + 3,
        spacing: rackShoeSpacing,
        scale: rackShoeScale,
      });
    }
  });

  const rackHandleZ = -frontD / 2 - 0.06;
  rackGroup.add(
    box(0.02, 0.12, 0.03, materials.metal, {
      x: W / 2 + 0.01,
      y: 1.0,
      z: rackHandleZ,
    }),
    box(0.012, 0.02, 0.02, materials.metal, {
      x: W / 2 + 0.003,
      y: 0.94,
      z: rackHandleZ,
    }),
    box(0.012, 0.02, 0.02, materials.metal, {
      x: W / 2 + 0.003,
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
  dimensionGroup.position.z = -backD / 2;
  cabinetGroup.add(dimensionGroup);

  updateRoom(room, { width: W, height: H, depth: D });
  updateShell();
  applyVisibility();
}

function applyVisibility() {
  if (propsGroup) propsGroup.visible = state.showProps;
  if (boardPropsGroup) boardPropsGroup.visible = state.showProps;
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
  const zShift = -state.backD / 2000;
  viewer.camera.position.z += zShift;
  viewer.controls.target.z += zShift;
  viewer.controls.update();
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
      } else if (part.type === 'drawer' || part.type === 'bench' || part.type === 'board') {
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
