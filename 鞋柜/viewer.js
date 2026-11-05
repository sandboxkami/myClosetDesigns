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
  createDimensionLabel,
  createDimensionAnnotation,
  createLeaderAnnotation,
  disposeGroup,
  fitCamera,
  damp,
} from '../assets/js/viewer-core.js';

const FIXED = Object.freeze({ W: 1700, D: 800, backD: 400 });

const DEFAULTS = {
  W: FIXED.W,
  H: 2303,
  D: FIXED.D,
  backD: 400,
  benchW: 350,
  benchD: 450,
  benchH: 420,
  benchPull: 500,
  benchStopH: 100,
  benchStopOn: true,
  t: 18,
  frontShelfInset: 50,
  topGap: 0,
};

const LEFT_W = 408;
const NARROW_W = 420;
const GAP = 0.003;
const BACK_T = 0.012;
const CUSHION_T = 0.03;
const WHEEL_R = 0.015;
const LEFT_BAG_H = 500;
const LEFT_HANG_H = 980;
const LEFT_SHELF_STEP = 350;
const LEFT_SHELF_DEPTH = 250;
const ROD_FROM_OPENING = 275;
const BENCH_STOP_D = 350;
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
// Right 420 tower: the two bottom layers are the through 200/120; above them
// are 9 layers: 130/130/175/230/160/160/160/260 plus N (remaining space).
const RIGHT_FIXED = [130, 130, 175, 230, 160, 160, 160, 260];
const RIGHT_FIXED_SUM = RIGHT_FIXED.reduce((sum, value) => sum + value, 0);

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
  rightN: 0,
  midDoorW: 0,
  benchMaxW: 0,
  benchStopD: 0,
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
let benchStopGroup = null;
let doorsGroup = null;
let dimensionGroup = null;
let firstBuild = true;
let layout = null;
let focusGroup = null;

const focusFillMat = new THREE.MeshBasicMaterial({
  color: 0xff9a4d,
  transparent: true,
  opacity: 0.13,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const focusEdgeMat = new THREE.LineBasicMaterial({
  color: 0xffc27d,
  transparent: true,
  opacity: 0.9,
  depthTest: false,
});
const focusLineMat = new THREE.LineBasicMaterial({
  color: 0xffc27d,
  transparent: true,
  opacity: 0.8,
  depthTest: false,
});
const focusDimMat = new THREE.LineBasicMaterial({
  color: 0xffb347,
  transparent: true,
  opacity: 0.95,
  depthTest: false,
});

const tourOverlay = document.getElementById('focus-tour');
const tourProgress = document.getElementById('tour-progress');
const tourTitle = document.getElementById('tour-title');
const tourDesc = document.getElementById('tour-desc');
const tourPart = document.getElementById('tour-part');
const tourValue = document.getElementById('tour-value');
const tourBar = document.getElementById('tour-bar');
const tourPrev = document.getElementById('tour-prev');
const tourNext = document.getElementById('tour-next');
const tourEnd = document.getElementById('tour-end');
const startTourButton = document.getElementById('start-tour');
const startTourLabel = startTourButton ? startTourButton.innerHTML : '';

const tour = {
  active: false,
  index: 0,
  elapsed: 0,
  phase: 'idle',
  moveDuration: 0.65,
  stops: [],
  fromPos: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
  returnPos: new THREE.Vector3(),
  returnTarget: new THREE.Vector3(),
  openLabels: [],
};

function normalizeState() {
  // Overall width and depth are fixed; the height and internal layout stay adjustable.
  state.W = FIXED.W;
  state.H = clamp(state.H, 2100, 2500);
  state.D = FIXED.D;
  state.backD = FIXED.backD;
  state.t = clamp(Math.round(state.t), 16, 25);
  state.frontShelfInset = clamp(Math.round(state.frontShelfInset / 5) * 5, 0, 120);
  state.topGap = 0;
  state.benchH = clamp(state.benchH, 380, 460);
  state.benchD = clamp(Math.round(state.benchD / 10) * 10, 350, 500);
  state.benchPull = clamp(state.benchPull, 300, 600);
  state.benchStopH = clamp(Math.round(state.benchStopH / 10) * 10, 50, 200);
  state.benchMaxW = LEFT_W - 2 * state.t;
  state.benchW = clamp(state.benchW, 260, state.benchMaxW);
  // The stop block fills the gap between the back panel and the bench.
  // With an 800 deep cabinet, 12 back panel and 450 bench, this is 338 mm
  // (about the requested 350); it is clamped if the bench depth changes.
  state.benchStopD = clamp(Math.min(BENCH_STOP_D, state.D - 12 - state.benchD), 100, 500);

  state.frontD = state.D - state.backD;

  state.midW = clamp(state.W - LEFT_W - NARROW_W - 4 * state.t, 700, 900);
  state.W = LEFT_W + state.midW + NARROW_W + 4 * state.t;
  state.backW = state.midW + NARROW_W;
  state.backPull = state.backW;

  // The shelf above the bench was removed in v1.12, so only the top panel
  // and the bag shelf remain in the left-column height chain.
  state.kneeH = state.H - 2 * state.t - LEFT_BAG_H - LEFT_HANG_H - state.benchH;

  const backAvail = state.H - 11 * state.t;
  const backScale = Math.max(0.5, backAvail / BACK_RATIO_SUM);
  state.backHeights = BACK_RATIOS.map((value) => value * backScale);

  // Right tower: above the through 200/120 bottom two, 9 layers with the last
  // one taking the remaining space. The tower starts at the top of the 120
  // layer: 200 + t + 120 + t.
  const openBottomTopMm = FRONT_BOTTOM[0] + FRONT_BOTTOM[1] + 2 * state.t;
  state.rightN = state.H - openBottomTopMm - 8 * state.t - 18 - RIGHT_FIXED_SUM;

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

  // Decision board, block 2: unfixed key dimensions.
  document.getElementById('decision-H').textContent = `${format(state.H, 0)} mm`;
  document.getElementById('decision-benchW').textContent = `${format(state.benchW, 0)} mm`;
  document.getElementById('decision-benchD').textContent = `${format(state.benchD, 0)} mm`;
  document.getElementById('decision-benchH').textContent = `${format(state.benchH, 0)} mm`;
  document.getElementById('decision-benchPull').textContent = `${format(state.benchPull, 0)} mm`;
  document.getElementById('decision-benchStopH').textContent = `${format(state.benchStopH, 0)} mm`;
  document.getElementById('decision-benchStopD').textContent = `${format(state.benchStopD, 0)} mm`;
  document.getElementById('decision-frontShelfInset').textContent = `${format(state.frontShelfInset, 0)} mm`;
  document.getElementById('decision-t').textContent = `${format(state.t, 0)} mm`;
  document.getElementById('decision-midW').textContent = `${format(state.midW, 0)} mm`;
  document.getElementById('decision-midDoorW').textContent = `${format(state.midDoorW, 1)} mm`;
  document.getElementById('decision-rightN').textContent = `${format(state.rightN, 0)} mm`;
  document.getElementById('decision-kneeH').textContent = `${format(state.kneeH, 0)} mm`;

  document.getElementById('left-width').textContent = `${LEFT_W} mm`;
  document.getElementById('mid-width').textContent = `${format(state.midW, 0)} / ${NARROW_W} mm`;
  document.getElementById('hanging-depth').textContent = `${format(state.D, 0)} / ${format(state.D, 0)}（贯通）`;
  document.getElementById('width-layout').textContent =
    `${LEFT_W} / ${format(state.midW + NARROW_W, 0)} / ${format(state.backW, 0)}`;
  document.getElementById('left-back-width').textContent = `${format(LEFT_W + state.backW, 0)} mm`;
  document.getElementById('left-zones').textContent =
    `${LEFT_BAG_H} / ${LEFT_HANG_H} / ${format(state.kneeH, 0)} / ${format(state.benchH, 0)}`;
  document.getElementById('left-storage-info').textContent =
    `距开口 ${ROD_FROM_OPENING} / 3 块·${LEFT_SHELF_STEP}·深${LEFT_SHELF_DEPTH}`;
  document.getElementById('front-bottom').textContent =
    `${FRONT_BOTTOM.join(' / ')} mm`;
  document.getElementById('front-drawer').textContent = `${FRONT_DRAWER} mm × 2（左右）`;
  document.getElementById('front-inset').textContent = `${format(state.frontShelfInset, 0)} mm`;
  document.getElementById('front-niche').textContent = `${FRONT_NICHE} mm`;
  document.getElementById('front-upper').textContent = `${FRONT_UPPER.join(' / ')} mm`;
  document.getElementById('right-heights').textContent =
    `${RIGHT_FIXED.join(' / ')} / ${format(state.rightN, 0)} mm`;
  document.getElementById('mid-door-width').textContent = `${format(state.midDoorW, 1)} mm`;
  document.getElementById('bench-size').textContent =
    `${format(state.benchW, 0)} × ${format(state.benchH, 0)} × ${format(state.benchD, 0)} / 前伸 ${format(state.benchPull, 0)}`;
  document.getElementById('bench-stop-info').textContent =
    `${LEFT_W} × ${format(state.benchStopH, 0)} × ${format(state.benchStopD, 0)} / ${state.benchStopOn ? '可取出' : '已取出'}`;
  document.getElementById('front-depth').textContent =
    `${format(state.frontD, 0)} / ${format(state.backD, 0)} mm`;
  document.getElementById('back-rack').textContent =
    `${format(state.backW, 0)} × ${format(state.H, 0)} / 抽拉 ${format(state.backPull, 0)} / 中竖板`;
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
  const stopButton = document.getElementById('toggle-bench-stop');
  if (stopButton) stopButton.textContent = state.benchStopOn ? '取出挡块' : '放回挡块';
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

function addDoor({ xLeft, xRight, yBottom, yTop, hinge, label, pullY = null }) {
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
    y: pullY ?? panelCenterY,
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
  const benchD = state.benchD / 1000;
  const benchH = state.benchH / 1000;
  const benchPull = state.benchPull / 1000;
  const benchStopH = state.benchStopH / 1000;
  const benchStopD = state.benchStopD / 1000;

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
  // v1.12: the shelf above the bench is removed. The hanging zone now runs
  // straight down to the open space above the bench.
  const hangBottom = kneeTop;
  const hangTop = hangBottom + LEFT_HANG_H / 1000;
  const bagShelfY = hangTop + t / 2;
  const bagBottom = hangTop + t;

  cabinetGroup.add(
    box(leftW, t, leftInteriorD - doorT, materials.wood, {
      x: leftCenter,
      y: bagShelfY,
      z: leftInteriorZ - doorT / 2,
    }),
  );

  // Upper-left bag compartment: one right-hinged flat door.
  addDoor({
    xLeft: leftInner0 + GAP,
    xRight: leftInner1 - GAP,
    yBottom: bagBottom + GAP / 2,
    yTop: topPanelBottom - GAP / 2,
    hinge: 'right',
    label: '包袋格柜门',
    pullY: bagBottom + 0.14,
  });

  // Short shelves below the bag compartment: every 350 down, 250 deep from the
  // back panel, three levels (350/700/1050). The lowest one sits above the
  // bench; the front part of the 800-deep bay stays open for sitting.
  const leftBackZ = -D / 2 + BACK_T;
  const leftShelfDepth = LEFT_SHELF_DEPTH / 1000;
  const leftShortShelfYs = [];
  for (let offset = LEFT_SHELF_STEP / 1000; offset < (bagBottom - benchTop); offset += LEFT_SHELF_STEP / 1000) {
    if (leftShortShelfYs.length >= 3) break;
    const shelfTopY = bagBottom - offset;
    if (shelfTopY - t < benchTop + 0.05) break;
    const shelfCenterY = shelfTopY - t / 2;
    leftShortShelfYs.push(shelfCenterY);
    cabinetGroup.add(
      box(leftW, t, leftShelfDepth, materials.wood, {
        x: leftCenter,
        y: shelfCenterY,
        z: leftBackZ + leftShelfDepth / 2,
      }),
    );
  }

  const rodZ = D / 2 - ROD_FROM_OPENING / 1000;
  const rodY = hangTop - 0.06;
  const rod = cylinder(0.0125, leftW - 0.02, materials.woodDark, {
    x: leftCenter,
    y: rodY,
    z: rodZ,
  });
  rod.rotation.z = Math.PI / 2;
  cabinetGroup.add(rod);


  // Front middle 800: bottom 5 (through 200/120), 170 drawer, 370 counter,
  // upper 5. Right 420 keeps its 9-layer tower; only the bottom 2 are through.
  const frontX0 = midInner0;
  const frontX1 = narrowInner1;
  const frontW = frontX1 - frontX0;
  const frontCenterX = (frontX0 + frontX1) / 2;
  const midMeetingX = (midInner0 + midInner1) / 2;
  // Top of the through 120 layer: 200 + board + 120 + board.
  const openBottomTop = (FRONT_BOTTOM[0] + FRONT_BOTTOM[1]) / 1000 + 2 * t;

  const addFullShelf = (y, inset = 0) =>
    cabinetGroup.add(box(frontW, t, interiorD - inset, materials.wood, {
      x: frontCenterX, y: y + t / 2, z: interiorZ - inset / 2,
    }));
  const addMiddleShelf = (y) =>
    cabinetGroup.add(box(midW, t, interiorD, materials.wood, {
      x: midCenter, y: y + t / 2, z: interiorZ,
    }));
  const addRightShelf = (y) =>
    cabinetGroup.add(box(narrowW, t, interiorD, materials.wood, {
      x: narrowCenter, y: y + t / 2, z: interiorZ,
    }));

  let fy = 0;
  const frontBottomCells = [];
  FRONT_BOTTOM.forEach((heightMm, index) => {
    const height = heightMm / 1000;
    frontBottomCells.push({ bottom: fy, top: fy + height });
    fy += height;
    if (index < FRONT_BOTTOM.length - 1) {
      if (index < 2) addFullShelf(fy, index === 0 ? state.frontShelfInset / 1000 : 0);
      else addMiddleShelf(fy);
      fy += t;
    }
  });
  addMiddleShelf(fy);
  fy += t;
  const drawerBottom = fy;
  const drawerTop = drawerBottom + FRONT_DRAWER / 1000;
  // The 170 drawer is split into two equal drawers, one on each side.
  // Match the upper doors: 3 mm outer margins and a 3 mm centre gap.
  const drawerW = midW / 2 - 1.5 * GAP;
  const drawerOffset = drawerW / 2 + GAP / 2;
  addDrawer({
    xCenter: midCenter - drawerOffset,
    width: drawerW,
    yBottom: drawerBottom + GAP / 2,
    yTop: drawerTop - GAP / 2,
    label: '前柜抽屉 170（左）',
  });
  addDrawer({
    xCenter: midCenter + drawerOffset,
    width: drawerW,
    yBottom: drawerBottom + GAP / 2,
    yTop: drawerTop - GAP / 2,
    label: '前柜抽屉 170（右）',
  });

  addMiddleShelf(drawerTop);
  const nicheBottom = drawerTop + t;
  const nicheTop = nicheBottom + FRONT_NICHE / 1000;
  addMiddleShelf(nicheTop);
  const upperBottom = nicheTop + t;

  let uy = upperBottom;
  const frontUpperCells = [];
  FRONT_UPPER.forEach((heightMm, index) => {
    const height = heightMm / 1000;
    frontUpperCells.push({ bottom: uy, top: uy + height });
    uy += height;
    if (index < FRONT_UPPER.length - 1) {
      addMiddleShelf(uy);
      uy += t;
    }
  });
  cabinetGroup.add(box(midW, Math.max(0.012, H - uy), interiorD, materials.wood, {
    x: midCenter, y: uy + Math.max(0.012, H - uy) / 2, z: interiorZ,
  }));

  // Right 420 tower: the bottom two 200/120 are already the through shelves;
  // the upper 7 keep the original tower order, scaled to fit.
  let ry = openBottomTop;
  const rightTowerCells = [];
  const rightHeights = [...RIGHT_FIXED.map((value) => value / 1000), state.rightN / 1000];
  rightHeights.forEach((height, index) => {
    rightTowerCells.push({ bottom: ry, top: ry + height });
    ry += height;
    if (index < rightHeights.length - 1) {
      addRightShelf(ry);
      ry += t;
    }
  });
  cabinetGroup.add(box(narrowW, Math.max(0.012, H - ry), interiorD, materials.wood, {
    x: narrowCenter, y: ry + Math.max(0.012, H - ry) / 2, z: interiorZ,
  }));

  // Middle upper 5 doors; right tower open; no lower doors.
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

  // Lower pair covers the three shoe rows above the two open bottom rows.
  addDoor({
    xLeft: midInner0 + GAP,
    xRight: midMeetingX - GAP / 2,
    yBottom: openBottomTop + GAP / 2,
    yTop: drawerBottom - GAP / 2,
    hinge: 'left',
    label: '前柜下门（左）',
  });
  addDoor({
    xLeft: midMeetingX + GAP / 2,
    xRight: midInner1 - GAP,
    yBottom: openBottomTop + GAP / 2,
    yTop: drawerBottom - GAP / 2,
    hinge: 'right',
    label: '前柜下门（右）',
  });

  // Right 420 tower: one full-height door above the two open bottom rows.
  addDoor({
    xLeft: narrowInner0 + GAP,
    xRight: narrowInner1 - GAP,
    yBottom: openBottomTop + GAP / 2,
    yTop: H - GAP,
    hinge: 'right',
    label: '右柜门',
  });

  // Divider 2 runs from the top of the through 120 layer to the top.
  cabinetGroup.add(box(t, H - openBottomTop, carcassD, materials.whiteCarcass, {
    x: divider2X, y: (openBottomTop + H) / 2, z: carcassZ,
  }));

  // Pull-out bench: centered in the left bay, front face flush with the
  // left cabinet opening plane. Depth 450 includes the 18 mm front panel.
  const benchCenterX = leftCenter;
  const benchFrontZ = D / 2;
  const benchBackZ = benchFrontZ - benchD;
  const benchBodyD = benchD - doorT;
  const benchBodyCenterZ = benchBackZ + benchBodyD / 2;
  const benchGroup = new THREE.Group();
  benchGroup.name = 'shoe-bench';
  benchGroup.position.set(benchCenterX, 0, 0);
  cabinetGroup.add(benchGroup);

  const bodyBottom = WHEEL_R * 2;
  const bodyHeight = benchH - CUSHION_T - bodyBottom;
  const bodyCenterY = bodyBottom + bodyHeight / 2;

  benchGroup.add(
    box(benchW, bodyHeight, benchBodyD, materials.whiteCarcass, {
      y: bodyCenterY,
      z: benchBodyCenterZ,
    }),
    box(benchW, bodyHeight, doorT, materials.whiteDoor, {
      y: bodyCenterY,
      z: benchFrontZ - doorT / 2,
    }),
    box(benchW - 0.02, CUSHION_T, benchBodyD - 0.02, MAT.cushion, {
      y: benchH - CUSHION_T / 2,
      z: benchBodyCenterZ,
    }),
    box(0.12, 0.006, 0.004, MAT.pull, {
      y: benchH - CUSHION_T - 0.028,
      z: benchFrontZ + 0.002,
    }),
  );

  const wheelPositions = [
    [-benchW / 2 + 0.045, benchBodyCenterZ - benchBodyD / 2 + 0.07],
    [benchW / 2 - 0.045, benchBodyCenterZ - benchBodyD / 2 + 0.07],
    [-benchW / 2 + 0.045, benchBodyCenterZ + benchBodyD / 2 - 0.07],
    [benchW / 2 - 0.045, benchBodyCenterZ + benchBodyD / 2 - 0.07],
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

  // Removable stop block behind the bench: fills the gap between the bench
  // back and the back panel, so the bench cannot be pushed too deep.
  const stopBackZ = -D / 2 + BACK_T;
  const stopFrontZ = stopBackZ + benchStopD;
  benchStopGroup = new THREE.Group();
  benchStopGroup.name = 'bench-stop';
  benchStopGroup.add(
    box(leftW, benchStopH, benchStopD, materials.woodLight, {
      x: leftCenter,
      y: benchStopH / 2,
      z: stopBackZ + benchStopD / 2,
    }),
    box(0.12, 0.012, 0.02, materials.woodDark, {
      x: leftCenter,
      y: benchStopH - 0.018,
      z: stopFrontZ - 0.012,
    }),
  );
  cabinetGroup.add(benchStopGroup);

  // Props.
  propsGroup = new THREE.Group();
  propsGroup.name = 'props';
  cabinetGroup.add(propsGroup);

  const bag = createBag();
  bag.position.set(leftCenter, bagBottom + 0.02, interiorZ + 0.02);
  propsGroup.add(bag);

  for (let i = 0; i < 2; i += 1) {
    const garment = createHangingGarment(materials, i + 1, 0.86, 0.3);
    garment.position.set(leftCenter + (i === 0 ? -0.085 : 0.085), rodY, rodZ);
    propsGroup.add(garment);
  }

  // Shoe boxes on the short back shelves.
  leftShortShelfYs.forEach((shelfCenterY, index) => {
    const boxProp = createShoeBox(0.22, 0.075, 0.17);
    boxProp.position.set(leftCenter, shelfCenterY + t / 2, leftBackZ + 0.13);
    boxProp.rotation.y = (index - 0.5) * 0.08;
    propsGroup.add(boxProp);
  });

  // Middle 800 bottom five: bottom two run through the full 1220; upper three are middle only. Right 420 has its own tower props.
  frontBottomCells.forEach((cell, index) => {
    if (index < 2) {
      addShoeRow(propsGroup, {
        xCenter: frontCenterX,
        y: cell.bottom + 0.002,
        // The 120 layer sits on the inset lowest shelf, so its props move back too.
        z: interiorZ + 0.035 - (index === 1 ? state.frontShelfInset / 1000 : 0),
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
    }
  });

  // 370 entry niche: only the bag; no extra tray/keys props.
  const nicheBag = createBag();
  nicheBag.position.set(midCenter - 0.18, nicheBottom, interiorZ + 0.02);
  propsGroup.add(nicheBag);

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
  });

  // Right 420 tower upper 7 layers: open shoes/boxes.
  rightTowerCells.forEach((cell, index) => {
    if (index >= 7) {
      addShoeBoxRow(propsGroup, {
        xCenter: narrowCenter,
        y: cell.bottom + 0.002,
        z: interiorZ + 0.035,
        count: 2,
        spacing: 0.2,
        scale: 0.8,
      });
    } else {
      addShoeRow(propsGroup, {
        xCenter: narrowCenter,
        y: cell.bottom + 0.002,
        z: interiorZ + 0.03,
        count: 2,
        type: index % 2 === 0 ? 'sneaker' : 'boot',
        colorOffset: index + 2,
        spacing: 0.2,
        scale: 0.8,
      });
    }
  });

  // Back layer: 1220 wide, exactly the front middle+right width, behind the
  // front 400 and against the flat wall. It slides out to the right.
  const rackLeft = midInner0;
  const rackRight = midInner0 + backW;
  const rackCenterX = (rackLeft + rackRight) / 2;
  const rackBackZ = -backD;
  const rackCenterZ = -backD / 2;
  const backInteriorZ = -backD / 2 + BACK_T;
  const backInteriorD = backD - 2 * BACK_T;
  const rackHalfW = (backW - 3 * t) / 2;
  const rackLeftCenter = rackLeft + t + rackHalfW / 2;
  const rackRightCenter = rackCenterX + t / 2 + rackHalfW / 2;

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
    box(t, H, backD, materials.whiteCarcass, {
      x: rackCenterX,
      y: H / 2,
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
        box(rackHalfW, t, backInteriorD, materials.whiteCarcass, {
          x: rackLeftCenter,
          y: rackCursor + t / 2,
          z: backInteriorZ,
        }),
        box(rackHalfW, t, backInteriorD, materials.whiteCarcass, {
          x: rackRightCenter,
          y: rackCursor + t / 2,
          z: backInteriorZ,
        }),
      );
      rackCursor += t;
    }
  });

  rackPropsGroup = new THREE.Group();
  rackGroup.add(rackPropsGroup);
  const rackShoeScale = 0.72;
  const rackShoeSpacing = 0.2;
  const rackBoxScale = 0.66;

  rackCells.forEach((cell, index) => {
    const y = cell.bottom + 0.002;
    const z = backInteriorZ + 0.02;
    if (index === rackCells.length - 1) {
      addShoeBoxRow(rackPropsGroup, { xCenter: rackLeftCenter, y, z, count: 2, spacing: 0.16, scale: rackBoxScale });
      addShoeBoxRow(rackPropsGroup, { xCenter: rackRightCenter, y, z, count: 2, spacing: 0.16, scale: rackBoxScale });
    } else if (index === rackCells.length - 2) {
      addShoeRow(rackPropsGroup, { xCenter: rackLeftCenter, y, z, count: 1, type: 'boot', colorOffset: 2, spacing: 0, scale: 0.8 });
      addShoeRow(rackPropsGroup, { xCenter: rackRightCenter, y, z, count: 1, type: 'boot', colorOffset: 3, spacing: 0, scale: 0.8 });
    } else if (index >= 4) {
      addShoeRow(rackPropsGroup, { xCenter: rackLeftCenter, y, z, count: 2, type: index % 2 === 0 ? 'heel' : 'sneaker', colorOffset: index + 1, spacing: rackShoeSpacing, scale: rackShoeScale });
      addShoeRow(rackPropsGroup, { xCenter: rackRightCenter, y, z, count: 2, type: index % 2 === 0 ? 'sneaker' : 'heel', colorOffset: index + 3, spacing: rackShoeSpacing, scale: rackShoeScale });
    } else {
      addShoeRow(rackPropsGroup, { xCenter: rackLeftCenter, y, z, count: 2, type: 'slipper', colorOffset: index + 3, spacing: rackShoeSpacing, scale: rackShoeScale });
      addShoeRow(rackPropsGroup, { xCenter: rackRightCenter, y, z, count: 2, type: 'slipper', colorOffset: index + 5, spacing: rackShoeSpacing, scale: rackShoeScale });
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

  layout = {
    W,
    H,
    D,
    frontD,
    backD,
    backW,
    backPull,
    t,
    topGap,
    leftW,
    midW,
    narrowW,
    benchW,
    benchD,
    benchH,
    benchPull,
    benchStopH,
    benchStopD,
    benchStopOn: state.benchStopOn,
    benchFrontZ,
    benchBackZ,
    benchBodyD,
    benchBodyCenterZ,
    stopBackZ,
    stopFrontZ,
    leftShortShelfYs,
    leftShelfDepth,
    leftBackZ,
    rodZ,
    rodFromOpening: ROD_FROM_OPENING / 1000,
    leftShelfStep: LEFT_SHELF_STEP / 1000,
    frontShelfInset: state.frontShelfInset / 1000,
    rightN: state.rightN / 1000,
    kneeH: state.kneeH / 1000,
    midDoorW: state.midDoorW / 1000,
    doorT,
    frontCenterZ,
    bodyFront,
    carcassD,
    carcassZ,
    interiorD,
    interiorZ,
    leftInteriorD,
    leftInteriorZ,
    doorZ,
    frontZ: D / 2,
    x0,
    x1,
    leftInner0,
    leftInner1,
    midInner0,
    midInner1,
    narrowInner0,
    narrowInner1,
    leftCenter,
    midCenter,
    narrowCenter,
    divider1X,
    divider2X,
    benchTop,
    kneeTop,
    hangBottom,
    hangTop,
    bagShelfY,
    bagBottom,
    rodY,
    topPanelBottom,
    frontX0,
    frontX1,
    frontW,
    frontCenterX,
    midMeetingX,
    openBottomTop,
    bottomCells: frontBottomCells.map((cell) => ({ bottom: cell.bottom, top: cell.top })),
    drawerBottom,
    drawerTop,
    drawerTravel: Math.min(0.4, Math.min(interiorD - 0.02, 0.36) * 0.9),
    nicheBottom,
    nicheTop,
    upperBottom,
    upperCells: frontUpperCells.map((cell) => ({ bottom: cell.bottom, top: cell.top })),
    rightCells: rightTowerCells.map((cell) => ({ bottom: cell.bottom, top: cell.top })),
    benchCenterX,
    benchZ1: benchBackZ,
    benchZ2: benchFrontZ,
    rackLeft,
    rackRight,
    rackCenterX,
    rackBackZ,
    rackCenterZ,
    backInteriorZ,
    backInteriorD,
    rackHalfW,
    rackLeftCenter,
    rackRightCenter,
    rackCells: rackCells.map((cell) => ({ bottom: cell.bottom, top: cell.top })),
  };

  updateRoom(room, { width: W, height: H, depth: D });
  applyVisibility();
}

function applyVisibility() {
  if (propsGroup) propsGroup.visible = state.showProps;
  if (rackPropsGroup) rackPropsGroup.visible = state.showProps;
  if (dimensionGroup) dimensionGroup.visible = state.showDims;
  if (doorsGroup) doorsGroup.visible = state.showDoors;
  if (benchStopGroup) benchStopGroup.visible = state.benchStopOn;
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

function focusNum(value) {
  return Math.round(value * 1000);
}

function focusMm(value) {
  return `${focusNum(value)} mm`;
}

function focusMm1(value) {
  return `${(Math.round(value * 10000) / 10).toFixed(1)} mm`;
}

function focusBox(x1, x2, y1, y2, z1, z2, fill = true) {
  return { x1, x2, y1, y2, z1, z2, fill };
}

function focusLabel(text, x, y, z, type = 'dim') {
  return { text, x, y, z, type };
}

function focusLine(x1, y1, z1, x2, y2, z2) {
  return { x1, y1, z1, x2, y2, z2 };
}

function buildFocusStops() {
  if (!layout) return [];
  const L = layout;
  const front = L.frontZ;
  const door = L.doorZ;
  const bodyZ = L.bodyFront;
  const bottomCenterX = (L.midInner0 + L.narrowInner1) / 2;
  const bottomCell0 = L.bottomCells[0];
  const bottomCell1 = L.bottomCells[1];
  const bottomInsetZ2 = L.interiorZ + L.interiorD / 2 - L.frontShelfInset;
  const drawerZ = door + L.drawerTravel;
  const drawerW = L.midW / 2 - 1.5 * GAP;
  const upperValue = L.upperCells.map((cell) => focusNum(cell.top - cell.bottom)).join(' / ');
  const rightValue = L.rightCells.map((cell) => focusNum(cell.top - cell.bottom)).join(' / ');
  const bagHeight = L.topPanelBottom - L.bagBottom;
  const kneeH = L.kneeTop - L.benchH;
  const rackShift = L.backPull;
  const rackDividerCenter = L.rackCenterX + rackShift;
  const rackHalfNetW = (L.backW - 3 * L.t) / 2;
  const benchShift = L.benchPull;
  const benchFrontZ = L.benchZ2 + benchShift;
  const benchStopOn = state.benchStopOn;

  return [
    {
      id: 'overall',
      part: '整体外形',
      title: '整体外形',
      value: `${focusMm(L.W)} × ${focusMm(L.H)} × ${focusMm(L.D)}`,
      desc: `总宽 ${focusNum(L.W)}、总深 ${focusNum(L.D)} 固定，总高可在 2100–2500 调整；前柜 1220×400 + 后柜 1220×400，左柜 408×800 通深。`,
      boxes: [focusBox(-L.W / 2, L.W / 2, 0, L.H, -L.D / 2, L.D / 2, false)],
      dims: [
        {
          start: [-L.W / 2, L.H, front],
          end: [L.W / 2, L.H, front],
          offset: [0, 0.18, 0],
          label: `总宽 ${focusNum(L.W)}`,
          tick: 0.045,
        },
        {
          start: [-L.W / 2, 0, front],
          end: [-L.W / 2, L.H, front],
          offset: [-0.2, 0, 0],
          label: `总高 ${focusNum(L.H)}`,
          tick: 0.045,
        },
        {
          start: [L.W / 2, L.H * 0.35, -L.D / 2],
          end: [L.W / 2, L.H * 0.35, L.D / 2],
          offset: [0.2, 0, 0],
          label: `总深 ${focusNum(L.D)}`,
          tick: 0.045,
        },
      ],
      labels: [
        focusLabel('整体外形', 0, L.H * 0.56, front + 0.04, 'part'),
      ],
      lines: [],
      dir: [0.62, 0.16, 1],
      margin: 1.32,
    },
    {
      id: 'left-bay',
      part: '左柜 408 通深',
      title: '左柜 408 × 800 通深',
      value: `${focusNum(L.leftW)} × ${focusNum(L.D)}`,
      desc: `左柜 408 宽、800 深贯通，包袋格加 1 扇右铰平板门，其余开放；上为包袋格 ${focusNum(bagHeight)}，中为挂衣区 ${LEFT_HANG_H}，下为坐凳上空约 ${focusNum(kneeH)} + 抽拉换鞋凳 ${L.benchW * 1000}×${L.benchH * 1000}×${L.benchD * 1000}。`,
      openParts: ['包袋格柜门'],
      boxes: [
        focusBox(L.leftInner0, L.leftInner1, 0, L.H, -L.D / 2, L.D / 2, false),
        focusBox(L.leftInner0, L.leftInner1, L.bagShelfY - L.t / 2, L.bagShelfY + L.t / 2,
          L.leftInteriorZ - L.leftInteriorD / 2, L.leftInteriorZ + L.leftInteriorD / 2 - L.doorT),
      ],
      dims: [
        {
          start: [L.leftInner0, L.H, front],
          end: [L.leftInner1, L.H, front],
          offset: [0, 0.14, 0],
          label: `左柜 ${focusNum(L.leftW)}`,
          tick: 0.03,
        },
        {
          start: [L.leftInner0, L.H * 0.35, -L.D / 2],
          end: [L.leftInner0, L.H * 0.35, L.D / 2],
          offset: [-0.28, 0, 0],
          label: `通深 ${focusNum(L.D)}`,
          tick: 0.035,
        },
        {
          start: [L.leftInner0, 0, front],
          end: [L.leftInner0, L.benchH, front],
          offset: [-0.14, 0, 0.02],
          label: `换鞋凳 ${focusNum(L.benchH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.leftInner0, L.benchH, front],
          end: [L.leftInner0, L.kneeTop, front],
          offset: [-0.14, 0, 0.02],
          label: `坐凳上空 ${focusNum(kneeH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.leftInner0, L.hangBottom, front],
          end: [L.leftInner0, L.hangTop, front],
          offset: [-0.14, 0, 0.02],
          label: `挂衣区 ${focusNum(L.hangTop - L.hangBottom)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.leftInner0, L.bagBottom, front],
          end: [L.leftInner0, L.topPanelBottom, front],
          offset: [-0.14, 0, 0.02],
          label: `包袋格 ${focusNum(bagHeight)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
      ],
      labels: [
        focusLabel('包袋格门 / 其余开放', L.leftCenter, L.H * 0.64, front + 0.05, 'part'),
      ],
      lines: [],
      dir: [-0.5, 0.12, 1],
      margin: 1.55,
      minDistance: 1.2,
      targetY: 0.95,
    },
    {
      id: 'left-storage',
      part: '挂衣杆 / 短横板',
      hideProps: true,
      title: `挂衣杆距开口 ${focusNum(L.rodFromOpening)} + 短横板 3 块 / ${focusNum(L.leftShelfStep)}·深 ${focusNum(L.leftShelfDepth)}`,
      value: `${focusNum(L.rodFromOpening)} / 3×${focusNum(L.leftShelfStep)}·${focusNum(L.leftShelfDepth)}`,
      desc: `左柜挂衣杆向开口方向偏移，杆中心距柜格开口 ${focusNum(L.rodFromOpening)}，为格内深处留出位置；包柜向下每 ${focusNum(L.leftShelfStep)} 一块短横板，板深 ${focusNum(L.leftShelfDepth)}（从柜背向外），共 ${L.leftShortShelfYs.length} 块。`,
      boxes: [
        focusBox(L.leftInner0, L.leftInner1, L.rodY - 0.02, L.rodY + 0.02,
          L.rodZ - 0.02, L.rodZ + 0.02, true),
        ...L.leftShortShelfYs.map((shelfY) => focusBox(
          L.leftInner0, L.leftInner1,
          shelfY - L.t / 2, shelfY + L.t / 2,
          L.leftBackZ, L.leftBackZ + L.leftShelfDepth,
          true,
        )),
      ],
      dims: [
        {
          start: [L.leftInner1, L.rodY, front],
          end: [L.leftInner1, L.rodY, L.rodZ],
          offset: [0.14, 0, 0],
          label: `距开口 ${focusNum(L.rodFromOpening)}`,
          tick: 0.02,
        },
        {
          start: [L.leftInner0, L.bagBottom, front],
          end: [L.leftInner0, L.bagBottom - L.leftShelfStep, front],
          offset: [-0.14, 0, 0.02],
          label: `每 ${focusNum(L.leftShelfStep)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.leftInner0, L.leftShortShelfYs[0], L.leftBackZ],
          end: [L.leftInner0, L.leftShortShelfYs[0], L.leftBackZ + L.leftShelfDepth],
          offset: [-0.14, 0, 0],
          label: `深 ${focusNum(L.leftShelfDepth)}`,
          tick: 0.02,
        },
      ],
      labels: [
        focusLabel('挂衣杆 / 短横板', L.leftCenter, L.rodY - 0.12, front + 0.05, 'part'),
      ],
      lines: [],
      dir: [-0.22, 0.22, 1],
      margin: 2.2,
      minDistance: 1.7,
      targetY: 1.0,
    },
    {
      id: 'front-split',
      part: '前柜平面分配',
      title: `前柜净宽 ${focusNum(L.midW + L.narrowW)} = 中 ${focusNum(L.midW)} + 右 ${focusNum(L.narrowW)}`,
      value: `${focusNum(L.midW)} + ${focusNum(L.narrowW)}`,
      desc: `前柜净宽 ${focusNum(L.midW + L.narrowW)}（中段 ${focusNum(L.midW)} + 右段 ${focusNum(L.narrowW)}，不含竖板厚度）；后柜与前柜同宽，前柜背板挡住后柜。`,
      boxes: [
        focusBox(L.midInner0, L.midInner1, 0, L.H, 0, front, false),
        focusBox(L.narrowInner0, L.narrowInner1, 0, L.H, 0, front, false),
      ],
      dims: [
        {
          start: [L.midInner0, L.H, front],
          end: [L.midInner1, L.H, front],
          offset: [0, 0.14, 0],
          label: `中段 ${focusNum(L.midW)}`,
          tick: 0.03,
        },
        {
          start: [L.narrowInner0, L.H, front],
          end: [L.narrowInner1, L.H, front],
          offset: [0, 0.14, 0],
          label: `右段 ${focusNum(L.narrowW)}`,
          tick: 0.03,
        },
      ],
      labels: [],
      lines: [],
      dir: [0.15, 0.12, 1],
      margin: 1.5,
    },
    {
      id: 'bottom-open',
      part: '底下两排 / 最下层板',
      title: '底下两排 200 / 120 贯通开放',
      value: `200 / 120 · 前缩 ${focusNum(L.frontShelfInset)}`,
      desc: `中段与右柜底下两排 200/120 横向贯通、保持开放；200 层上方那块通长层板前缩 ${focusNum(L.frontShelfInset)}（0–120 可调），方便抽取最底层鞋子。`,
      boxes: [
        focusBox(L.midInner0, L.narrowInner1, bottomCell0.bottom, bottomCell0.top, 0, front, false),
        focusBox(L.midInner0, L.narrowInner1, bottomCell1.bottom, bottomCell1.top, 0, front, false),
        focusBox(L.midInner0, L.narrowInner1, bottomCell0.top, bottomCell0.top + L.t, bottomInsetZ2,
          L.interiorZ + L.interiorD / 2),
      ],
      dims: [
        {
          start: [L.midInner0, bottomCell0.bottom, bodyZ],
          end: [L.midInner0, bottomCell0.top, bodyZ],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(bottomCell0.top - bottomCell0.bottom)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.midInner0, bottomCell1.bottom, bodyZ],
          end: [L.midInner0, bottomCell1.top, bodyZ],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(bottomCell1.top - bottomCell1.bottom)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.midInner0, (bottomCell1.bottom + bottomCell1.top) / 2, front],
          end: [L.narrowInner1, (bottomCell1.bottom + bottomCell1.top) / 2, front],
          offset: [0, 0.08, 0],
          label: `贯通 ${focusNum(L.midW + L.narrowW)}`,
          tick: 0.03,
        },
        {
          start: [bottomCenterX, bottomCell0.top + L.t / 2, bottomInsetZ2],
          end: [bottomCenterX, bottomCell0.top + L.t / 2, L.interiorZ + L.interiorD / 2],
          offset: [0, -0.04, 0],
          label: `前缩 ${focusNum(L.frontShelfInset)}`,
          tick: 0.02,
        },
      ],
      labels: [],
      lines: [],
      dir: [0.1, 0.14, 1],
      margin: 1.9,
      minDistance: 1.7,
    },
    {
      id: 'drawers-niche',
      part: '170 抽屉 / 370 台面',
      openParts: ['前柜抽屉 170（左）', '前柜抽屉 170（右）'],
      title: '170 抽屉分左右 + 370 台面',
      value: `${FRONT_DRAWER} × 2 / ${FRONT_NICHE}`,
      desc: `门上方 ${FRONT_DRAWER} 抽屉分成左右两个；抽屉上方 ${FRONT_NICHE} 玄关台面开放，放钥匙、包包。`,
      boxes: [
        focusBox(L.midInner0 + GAP, L.midMeetingX - GAP / 2, L.drawerBottom, L.drawerTop,
          drawerZ - 0.014, drawerZ + 0.014),
        focusBox(L.midMeetingX + GAP / 2, L.midInner1 - GAP, L.drawerBottom, L.drawerTop,
          drawerZ - 0.014, drawerZ + 0.014),
        focusBox(L.midInner0, L.midInner1, L.nicheBottom, L.nicheTop, 0, front, false),
      ],
      dims: [
        {
          start: [L.midInner0, L.drawerBottom, drawerZ],
          end: [L.midInner0, L.drawerTop, drawerZ],
          offset: [-0.14, 0, 0.02],
          label: `${FRONT_DRAWER}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.midInner0, L.drawerTop, drawerZ],
          end: [L.midMeetingX - GAP / 2, L.drawerTop, drawerZ],
          offset: [0, 0.1, 0],
          label: focusMm1(drawerW),
          tick: 0.02,
        },
        {
          start: [L.midMeetingX + GAP / 2, L.drawerTop, drawerZ],
          end: [L.midInner1, L.drawerTop, drawerZ],
          offset: [0, 0.1, 0],
          label: focusMm1(drawerW),
          tick: 0.02,
        },
        {
          start: [L.midInner1, L.nicheBottom, front],
          end: [L.midInner1, L.nicheTop, front],
          offset: [0.14, 0, 0],
          label: `${FRONT_NICHE}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
      ],
      labels: [],
      lines: [],
      dir: [0.18, 0.12, 1],
      margin: 1.7,
      targetY: 1.05,
    },
    {
      id: 'mid-upper',
      part: '中段台上 5 层',
      openParts: ['前柜上门（左）', '前柜上门（右）'],
      title: '中段台上 5 层 + 对开门',
      value: upperValue,
      desc: `台面以上中段共 5 层：${upperValue}；外加一对上门，门后放鞋盒。`,
      boxes: L.upperCells.map((cell) =>
        focusBox(L.midInner0, L.midInner1, cell.bottom, cell.top, 0, front, false),
      ),
      dims: L.upperCells.map((cell) => ({
        start: [L.midInner0, cell.bottom, bodyZ],
        end: [L.midInner0, cell.top, bodyZ],
        offset: [-0.14, 0, 0.02],
        label: `${focusNum(cell.top - cell.bottom)}`,
        labelClass: 'focus-ratio-label',
        tick: 0.02,
      })),
      labels: [],
      lines: [],
      dir: [0.08, 0.12, 1],
      margin: 1.45,
      targetY: 1.74,
    },
    {
      id: 'right-tower',
      part: '右柜 420 / 9 层',
      openParts: ['右柜门'],
      title: '右柜 9 层 + 整高门',
      value: `9 层 / 门 1 扇`,
      desc: `右柜 ${focusNum(L.narrowW)} 底下两层与中段通长开放；往上 9 层 ${rightValue}，外加一扇整高门（右铰、拉手在左）。`,
      boxes: [
        focusBox(L.narrowInner0, L.narrowInner1, L.openBottomTop, L.H, 0, front, false),
      ],
      dims: [
        {
          start: [L.narrowInner0, L.H, front],
          end: [L.narrowInner1, L.H, front],
          offset: [0, 0.14, 0],
          label: `右柜 ${focusNum(L.narrowW)}`,
          tick: 0.03,
        },
        ...L.rightCells.map((cell) => ({
          start: [L.narrowInner1, cell.bottom, front],
          end: [L.narrowInner1, cell.top, front],
          offset: [0.16, 0, 0],
          label: `${focusNum(cell.top - cell.bottom)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        })),
      ],
      labels: [
        focusLabel('整高门 1 扇', L.narrowCenter, L.H * 0.82, front + 0.05, 'part'),
      ],
      lines: [],
      dir: [0.55, 0.12, 1],
      margin: 1.6,
      targetY: 1.05,
    },
    {
      id: 'back-rack',
      part: '后柜 / 中间竖板',
      openParts: ['后层抽拉鞋架（向右拉出）'],
      title: '后柜 1220 × 400 侧抽 + 10 层',
      value: `10 层 / 抽 ${focusNum(L.backPull)}`,
      desc: `后柜 ${focusNum(L.backW)}×${focusNum(L.backD)}，藏在前柜背后，向右侧抽出 ${focusNum(L.backPull)}；中间一块通高竖板，左右各约 ${focusNum(rackHalfNetW)}；10 层净高见图标注。`,
      boxes: [
        focusBox(L.rackLeft + rackShift, L.rackRight + rackShift, 0, L.H, -L.backD, 0, false),
        focusBox(rackDividerCenter - L.t / 2, rackDividerCenter + L.t / 2, 0, L.H, -L.backD, 0),
      ],
      dims: [
        {
          start: [L.rackLeft + rackShift, L.H, -L.backD / 2],
          end: [L.rackRight + rackShift, L.H, -L.backD / 2],
          offset: [0, 0.16, 0],
          label: `后柜宽 ${focusNum(L.backW)}`,
          tick: 0.045,
        },
        {
          start: [L.rackRight + rackShift, L.H * 0.35, -L.backD],
          end: [L.rackRight + rackShift, L.H * 0.35, 0],
          offset: [0.18, 0, 0],
          label: `深 ${focusNum(L.backD)}`,
          tick: 0.04,
        },
        {
          start: [L.rackRight, L.H * 0.5, -L.backD / 2],
          end: [L.rackRight + rackShift, L.H * 0.5, -L.backD / 2],
          offset: [0, 0.18, 0],
          label: `侧抽 ${focusNum(L.backPull)}`,
          tick: 0.045,
        },
        ...L.rackCells.map((cell) => ({
          start: [rackDividerCenter + 0.16, cell.bottom, -L.backD / 2],
          end: [rackDividerCenter + 0.16, cell.top, -L.backD / 2],
          offset: [0.12, 0, 0],
          label: `${focusNum(cell.top - cell.bottom)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        })),
      ],
      labels: [
        focusLabel('中间通高竖板', rackDividerCenter, L.H * 0.82, -L.backD / 2, 'part'),
      ],
      lines: [],
      dir: [0.55, 0.16, 0.9],
      margin: 1.7,
      minDistance: 2.2,
      targetY: 0.6,
    },
    {
      id: 'bench',
      part: '抽拉换鞋凳',
      openParts: ['抽拉换鞋凳 420'],
      title: `抽拉换鞋凳 ${focusNum(L.benchW)} × ${focusNum(L.benchH)} × ${focusNum(L.benchD)}`,
      value: `${focusNum(L.benchW)} × ${focusNum(L.benchH)} × ${focusNum(L.benchD)} / 前伸 ${focusNum(L.benchPull)}`,
      desc: `左柜坐凳上空约 ${focusNum(kneeH)}；换鞋凳 ${focusNum(L.benchW)} 宽、${focusNum(L.benchH)} 高、${focusNum(L.benchD)} 深，正面与左柜开口齐平；向前拉出 ${focusNum(L.benchPull)}，无底带轮。${benchStopOn ? `凳后挡块 ${focusNum(L.benchStopH)} 高，防止推入过深，可取出。` : '当前已取出凳后挡块，凳子可继续向里推。'}`,
      boxes: [
        focusBox(L.benchCenterX - L.benchW / 2, L.benchCenterX + L.benchW / 2, 0, L.benchH,
          L.benchZ1 + benchShift, benchFrontZ, false),
        focusBox(L.benchCenterX - L.benchW / 2, L.benchCenterX + L.benchW / 2,
          L.benchH - CUSHION_T, L.benchH, L.benchZ1 + benchShift, benchFrontZ),
        ...(benchStopOn ? [
          focusBox(L.leftInner0, L.leftInner1, 0, L.benchStopH, L.stopBackZ, L.stopFrontZ, false),
          focusBox(L.leftInner0, L.leftInner1, L.benchStopH - 0.012, L.benchStopH,
            L.stopBackZ, L.stopFrontZ, true),
        ] : []),
      ],
      dims: [
        {
          start: [L.benchCenterX - L.benchW / 2, L.benchH, benchFrontZ],
          end: [L.benchCenterX + L.benchW / 2, L.benchH, benchFrontZ],
          offset: [0, 0.12, 0],
          label: `宽 ${focusNum(L.benchW)}`,
          tick: 0.025,
        },
        {
          start: [L.benchCenterX - L.benchW / 2, 0, benchFrontZ],
          end: [L.benchCenterX - L.benchW / 2, L.benchH, benchFrontZ],
          offset: [-0.14, 0, 0],
          label: `高 ${focusNum(L.benchH)}`,
          tick: 0.025,
        },
        {
          start: [L.benchCenterX + L.benchW / 2, L.benchH * 0.5, L.benchZ2],
          end: [L.benchCenterX + L.benchW / 2, L.benchH * 0.5, benchFrontZ],
          offset: [0.16, 0, 0],
          label: `前伸 ${focusNum(L.benchPull)}`,
          tick: 0.03,
        },
        {
          start: [L.benchCenterX - L.benchW / 2, L.benchH * 0.5, L.benchZ1 + benchShift],
          end: [L.benchCenterX - L.benchW / 2, L.benchH * 0.5, L.benchZ2 + benchShift],
          offset: [-0.14, 0, 0],
          label: `深 ${focusNum(L.benchD)}`,
          tick: 0.025,
        },
        ...(benchStopOn ? [{
          start: [L.leftInner1, 0, L.stopFrontZ],
          end: [L.leftInner1, L.benchStopH, L.stopFrontZ],
          offset: [0.14, 0, 0],
          label: `挡块 ${focusNum(L.benchStopH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        }] : []),
      ],
      labels: benchStopOn
        ? [focusLabel('凳后挡块 / 可取出', L.leftCenter, L.benchStopH + 0.12, L.stopFrontZ - 0.04, 'part')]
        : [],
      lines: [],
      dir: [-0.4, 0.55, 1],
      margin: 3.2,
      minDistance: 2.4,
      targetY: 0.08,
    },
  ];
}

function clearFocusGroup() {
  if (focusGroup) {
    disposeGroup(focusGroup);
    viewer.scene.remove(focusGroup);
    focusGroup = null;
  }
}

function renderFocusStop(stop) {
  clearFocusGroup();
  focusGroup = new THREE.Group();
  focusGroup.name = 'focus-highlight';
  viewer.scene.add(focusGroup);

  stop.boxes.forEach((spec) => {
    const width = spec.x2 - spec.x1;
    const height = spec.y2 - spec.y1;
    const depth = spec.z2 - spec.z1;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const fill = new THREE.Mesh(geometry, focusFillMat);
    fill.position.set((spec.x1 + spec.x2) / 2, (spec.y1 + spec.y2) / 2, (spec.z1 + spec.z2) / 2);
    fill.renderOrder = 20;
    fill.visible = spec.fill !== false;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), focusEdgeMat);
    edges.position.copy(fill.position);
    edges.renderOrder = 21;
    focusGroup.add(fill, edges);
  });

  stop.lines.forEach((line) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(line.x1, line.y1, line.z1),
      new THREE.Vector3(line.x2, line.y2, line.z2),
    ]);
    const object = new THREE.Line(geometry, focusLineMat);
    object.renderOrder = 21;
    focusGroup.add(object);
  });

  (stop.dims || []).forEach((spec) => {
    focusGroup.add(createDimensionAnnotation({ material: focusDimMat, ...spec }));
  });

  (stop.leaders || []).forEach((spec) => {
    focusGroup.add(createLeaderAnnotation({ material: focusDimMat, ...spec }));
  });

  stop.labels.forEach((spec) => {
    const label = createDimensionLabel(spec.text);
    label.position.set(spec.x, spec.y, spec.z);
    label.element.classList.add(
      spec.type === 'part' ? 'focus-part-label'
        : spec.type === 'ratio' ? 'focus-ratio-label'
          : 'focus-dim-label',
    );
    focusGroup.add(label);
  });
}

function focusCameraPose(stop) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  stop.boxes.forEach((spec) => {
    minX = Math.min(minX, spec.x1);
    maxX = Math.max(maxX, spec.x2);
    minY = Math.min(minY, spec.y1);
    maxY = Math.max(maxY, spec.y2);
    minZ = Math.min(minZ, spec.z1);
    maxZ = Math.max(maxZ, spec.z2);
  });
  (stop.dims || []).forEach((dim) => {
    const ox = dim.offset[0];
    const oy = dim.offset[1];
    const oz = dim.offset[2];
    [[dim.start, 0], [dim.end, 0], [dim.start, 1], [dim.end, 1]].forEach(([point, offset]) => {
      const x = point[0] + (offset ? ox : 0);
      const y = point[1] + (offset ? oy : 0);
      const z = point[2] + (offset ? oz : 0);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    });
  });
  if (!Number.isFinite(minX)) {
    minX = -0.2; maxX = 0.2; minY = 0; maxY = 0.5; minZ = -0.2; maxZ = 0.2;
  }
  const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  if (Number.isFinite(stop.targetY)) center.y = stop.targetY;
  const size = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);
  const vFov = THREE.MathUtils.degToRad(viewer.camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(viewer.camera.aspect, 0.45));
  const margin = stop.margin ?? 1.6;
  const distanceV = (size.y * 0.5 * margin) / Math.tan(vFov / 2);
  const distanceH = (size.x * 0.5 * margin) / Math.tan(hFov / 2);
  const distanceD = size.z * 0.5 + 0.8;
  const distance = Math.max(distanceV, distanceH, distanceD, stop.minDistance ?? 0.85);
  const direction = new THREE.Vector3(...stop.dir).normalize();
  return {
    position: center.clone().add(direction.multiplyScalar(distance)),
    target: center,
  };
}

function setDimensionLabelsVisible(visible) {
  if (!dimensionGroup) return;
  dimensionGroup.visible = visible;
  dimensionGroup.traverse((object) => {
    if (object.isCSS2DObject) object.visible = visible;
  });
}

function computeDefaultPose() {
  const camera = viewer.camera.clone();
  const controls = { target: new THREE.Vector3(), update() {} };
  fitCamera(camera, controls, {
    width: state.W / 1000,
    height: state.H / 1000,
    depth: state.D / 1000,
  }, {
    direction: new THREE.Vector3(0.62, 0.16, 1),
    margin: 1.32,
  });
  return { position: camera.position.clone(), target: controls.target.clone() };
}

function updateTourOverlay(stop, index) {
  if (!tourOverlay) return;
  tourOverlay.hidden = false;
  tourProgress.textContent = `${index + 1} / ${tour.stops.length}`;
  tourTitle.textContent = stop.title;
  tourDesc.textContent = stop.desc;
  tourPart.textContent = `部件：${stop.part}`;
  tourValue.textContent = stop.value;
  if (tourBar) tourBar.style.width = `${((index + 1) / tour.stops.length) * 100}%`;
  if (tourPrev) tourPrev.disabled = index <= 0;
  if (tourNext) tourNext.disabled = index >= tour.stops.length - 1;
  if (tourEnd) tourEnd.disabled = false;
}

function setTourParts(labels) {
  tour.openLabels.forEach((label) => {
    const part = interactiveParts.find((item) => item.label === label);
    if (part) part.target = 0;
  });
  tour.openLabels = labels ? [...labels] : [];
  tour.openLabels.forEach((label) => {
    const part = interactiveParts.find((item) => item.label === label);
    if (part) part.target = 1;
  });
}

function showFocusStop(index) {
  if (!tour.active || tour.phase === 'returning') return;
  if (index < 0 || index >= tour.stops.length) return;
  const stop = tour.stops[index];
  tour.index = index;
  tour.phase = 'moving';
  tour.elapsed = 0;
  renderFocusStop(stop);
  setTourParts(stop.openParts || []);
  if (propsGroup) propsGroup.visible = state.showProps && !stop.hideProps;
  updateTourOverlay(stop, index);
  const pose = focusCameraPose(stop);
  tour.fromPos.copy(viewer.camera.position);
  tour.fromTarget.copy(viewer.controls.target);
  tour.toPos.copy(pose.position);
  tour.toTarget.copy(pose.target);
  viewer.controls.enabled = false;
}

function startTour() {
  if (tour.active || !layout) return;
  const stops = buildFocusStops();
  if (!stops.length) return;
  tour.stops = stops;
  tour.active = true;
  tour.index = 0;
  tour.elapsed = 0;
  tour.phase = 'moving';
  const defaultPose = computeDefaultPose();
  tour.returnPos.copy(defaultPose.position);
  tour.returnTarget.copy(defaultPose.target);
  setPartTargets(false);
  if (startTourButton) {
    startTourButton.disabled = true;
    startTourButton.innerHTML = '<span class="tour-start-icon">◌</span><span class="tour-start-copy"><strong>关键约束浏览中…</strong><small>用下方按钮切换 / 结束</small></span>';
  }
  setDimensionLabelsVisible(false);
  tooltip.classList.remove('is-visible');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  showFocusStop(0);
}

function finishTour() {
  tour.active = false;
  tour.phase = 'idle';
  tour.elapsed = 0;
  clearFocusGroup();
  tour.openLabels = [];
  if (tourOverlay) tourOverlay.hidden = true;
  viewer.camera.position.copy(tour.returnPos);
  viewer.controls.target.copy(tour.returnTarget);
  viewer.controls.enabled = true;
  viewer.controls.update();
  setPartTargets(false);
  if (startTourButton) {
    startTourButton.disabled = false;
    startTourButton.innerHTML = startTourLabel;
  }
  setDimensionLabelsVisible(state.showDims);
  applyVisibility();
}

function endTour() {
  if (!tour.active || tour.phase === 'returning') return;
  tour.phase = 'returning';
  tour.elapsed = 0;
  tour.fromPos.copy(viewer.camera.position);
  tour.fromTarget.copy(viewer.controls.target);
  clearFocusGroup();
  tour.openLabels = [];
  if (tourOverlay) tourOverlay.hidden = true;
  setPartTargets(false);
  if (propsGroup) propsGroup.visible = state.showProps;
  viewer.controls.enabled = false;
}

function abortTourForRebuild() {
  if (!tour.active) return;
  tour.active = false;
  tour.phase = 'idle';
  tour.elapsed = 0;
  clearFocusGroup();
  tour.openLabels = [];
  if (tourOverlay) tourOverlay.hidden = true;
  viewer.controls.enabled = true;
  if (startTourButton) {
    startTourButton.disabled = false;
    startTourButton.innerHTML = startTourLabel;
  }
  setDimensionLabelsVisible(state.showDims);
}

function updateTour(delta) {
  if (!tour.active) return;
  if (tour.phase !== 'moving' && tour.phase !== 'returning') return;
  tour.elapsed += delta;
  const k = Math.min(1, tour.elapsed / tour.moveDuration);
  const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  if (tour.phase === 'moving') {
    viewer.camera.position.lerpVectors(tour.fromPos, tour.toPos, eased);
    viewer.controls.target.lerpVectors(tour.fromTarget, tour.toTarget, eased);
  } else {
    viewer.camera.position.lerpVectors(tour.fromPos, tour.returnPos, eased);
    viewer.controls.target.lerpVectors(tour.fromTarget, tour.returnTarget, eased);
  }
  viewer.controls.update();
  if (k >= 1) {
    if (tour.phase === 'moving') {
      tour.phase = 'idle';
      tour.elapsed = 0;
      viewer.controls.enabled = true;
      viewer.controls.update();
    } else {
      finishTour();
    }
  }
}

function applyPartTransform(part) {
  if (part.type === 'door') {
    part.group.rotation.y = part.hingeSign * part.open * part.angle;
  } else if (part.type === 'drawer' || part.type === 'bench') {
    part.group.position.z = part.open * part.travel;
  } else if (part.type === 'backRack') {
    part.group.position.x = part.open * part.travel;
  }
}

function rebuild() {
  if (tour.active) abortTourForRebuild();
  normalizeState();
  const direction = viewer.camera.position.clone().sub(viewer.controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.62, 0.16, 1);
  direction.normalize();

  const openStates = new Map(
    interactiveParts.map((part) => [part.label, { open: part.open, target: part.target }]),
  );

  disposeGroup(cabinetGroup);
  buildCabinet();

  interactiveParts.forEach((part) => {
    const saved = openStates.get(part.label);
    if (!saved) return;
    part.open = saved.open;
    part.target = saved.target;
    applyPartTransform(part);
  });

  fitCabinet(firstBuild ? new THREE.Vector3(0.62, 0.16, 1) : direction);
  firstBuild = false;

  renderUI();
  if (loading) loading.classList.add('is-hidden');
}

function resetView() {
  if (tour.active) {
    showFocusStop(tour.index);
    return;
  }
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

document.querySelectorAll('.decision-item[data-target]').forEach((item) => {
  item.addEventListener('click', () => {
    const target = document.getElementById(item.dataset.target);
    if (!target) return;
    const details = target.closest('details');
    if (details) details.open = true;
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      if (typeof target.select === 'function') target.select();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
});

if (startTourButton) startTourButton.addEventListener('click', startTour);
if (tourPrev) tourPrev.addEventListener('click', () => showFocusStop(tour.index - 1));
if (tourNext) tourNext.addEventListener('click', () => showFocusStop(tour.index + 1));
if (tourEnd) tourEnd.addEventListener('click', endTour);

document.addEventListener('keydown', (event) => {
  if (!tour.active) return;
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    showFocusStop(tour.index - 1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    showFocusStop(tour.index + 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    endTour();
  }
});

document.getElementById('reset-dimensions').addEventListener('click', () => {
  Object.assign(state, DEFAULTS);
  normalizeState();
  renderUI();
  scheduleRebuild();
});

document.getElementById('toggle-bench-stop').addEventListener('click', () => {
  state.benchStopOn = !state.benchStopOn;
  renderUI();
  applyVisibility();
  if (tour.active) showFocusStop(tour.index);
});

document.getElementById('open-all').addEventListener('click', () => setPartTargets(true));
document.getElementById('close-all').addEventListener('click', () => setPartTargets(false));
document.getElementById('reset-view').addEventListener('click', resetView);

document.getElementById('show-dims').addEventListener('change', (event) => {
  state.showDims = event.target.checked;
  setDimensionLabelsVisible(state.showDims);
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
  if (tour.active) updateTour(delta);
  if (tour.active && focusGroup) {
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 6.2);
    focusFillMat.opacity = 0.07 + 0.13 * pulse;
    focusEdgeMat.opacity = 0.5 + 0.45 * pulse;
    focusLineMat.opacity = 0.45 + 0.4 * pulse;
  }
  for (const part of interactiveParts) {
    if (Math.abs(part.open - part.target) > 0.0005) {
      part.open = damp(part.open, part.target, 8.5, delta);
      applyPartTransform(part);
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
