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
  W: 3700,
  H: 2400,
  D: 600,
  topRowH: 400,
  drawerH: 200,
  leftTopH: 832,
  leftPantsH: 664,
  shortH: 1000,
  narrowW: 399.2,
  t: 18,
  shelfRemoved: false,
};

const state = {
  ...DEFAULTS,
  showDims: true,
  showProps: true,
  largeW: 0,
  leftBottomH: 0,
  longH2: 0,
  longH3: 0,
  shelfH4: 0,
  shelfH4Upper: 0,
  narrowHangH: 0,
  doorW: 0,
};

const SCENE = {
  doorT: 0.018,
  doorZ: 0.291,
  frontZ: 0.3,
  drawerFrontZ: 0.25,
  depth: 0.6,
};

const GAP = 0.003;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;
const format = (value, digits = 0) => Number(value).toFixed(digits);

const stage = document.getElementById('canvas-container');
const loading = document.getElementById('loading');
const tooltip = document.getElementById('tooltip');

const viewer = createViewer(stage);
const materials = createMaterials();
createLights(viewer.scene);
const room = createRoom(viewer.scene, materials);

const cabinetGroup = new THREE.Group();
cabinetGroup.name = 'master-wardrobe';
viewer.scene.add(cabinetGroup);

let interactiveParts = [];
let movableShelfGroups = [];
let movableShelfProps = [];
let propsGroup = null;
let dimensionGroup = null;
let firstBuild = true;

function normalizeState() {
  state.W = clamp(state.W, 3000, 4500);
  state.H = clamp(state.H, 2200, 2800);
  state.D = clamp(state.D, 500, 700);
  state.topRowH = clamp(state.topRowH, 300, 500);
  state.drawerH = clamp(state.drawerH, 180, 250);
  state.leftTopH = clamp(state.leftTopH, 600, 1000);
  state.leftPantsH = clamp(state.leftPantsH, 500, 800);
  state.shortH = clamp(state.shortH, 800, 1200);
  state.narrowW = clamp(state.narrowW, 300, 500);
  state.t = clamp(Math.round(state.t), 16, 25);

  const minBottom = 300;
  const maxLeftCombined = state.H - 4 * state.t - minBottom;
  if (state.leftTopH + state.leftPantsH > maxLeftCombined) {
    let excess = state.leftTopH + state.leftPantsH - maxLeftCombined;
    const fromPants = Math.min(excess, state.leftPantsH - 500);
    state.leftPantsH -= fromPants;
    excess -= fromPants;
    if (excess > 0) state.leftTopH = Math.max(600, state.leftTopH - excess);
  }

  state.largeW = (state.W - 6 * state.t - state.narrowW) / 4;
  state.leftBottomH = state.H - state.leftTopH - state.leftPantsH - 4 * state.t;
  state.longH2 = state.H - state.topRowH - 2 * state.drawerH - 5 * state.t;
  state.longH3 = state.H - state.topRowH - 3 * state.drawerH - 6 * state.t;
  state.shelfH4 = (state.H - state.shortH - 5 * state.t) / 3;
  state.shelfH4Upper = (state.H - state.shortH - 6 * state.t - state.shelfH4) / 3;
  state.narrowHangH = state.H - state.topRowH - 3 * state.t;
  state.doorW = state.largeW / 2 - 1.5 * 3;
}

function setInputMax(key, value) {
  document.querySelectorAll(`[data-range="${key}"], [data-number="${key}"]`).forEach((input) => {
    input.max = value;
  });
}

function syncInputs() {
  document.querySelectorAll('[data-range], [data-number]').forEach((input) => {
    const key = input.dataset.range || input.dataset.number;
    if (key in state) input.value = state[key];
  });

  const leftTopMax = Math.max(600, Math.min(1000, state.H - state.leftPantsH - 4 * state.t - 300));
  const leftPantsMax = Math.max(500, Math.min(800, state.H - state.leftTopH - 4 * state.t - 300));
  setInputMax('leftTopH', leftTopMax);
  setInputMax('leftPantsH', leftPantsMax);
}

function updateReadouts() {
  document.getElementById('size-readout').textContent = `${Math.round(state.W)} × ${Math.round(state.H)} × ${Math.round(state.D)} mm`;
  document.getElementById('door-width').textContent = `${format(state.doorW, 1)} mm`;
  document.getElementById('left-bottom').textContent = `${format(state.leftBottomH, 0)} mm`;
  document.getElementById('long-2').textContent = `${format(state.longH2, 0)} mm`;
  document.getElementById('long-3').textContent = `${format(state.longH3, 0)} mm`;
  document.getElementById('shelf-4').textContent = `${format(state.shelfH4, 1)} / ${format(state.shelfH4Upper, 1)} mm`;
  document.getElementById('narrow-hang').textContent = `${format(state.narrowHangH, 0)} mm`;

  const warnings = [];
  if (state.leftBottomH < 500) warnings.push(`左侧下挂 ${format(state.leftBottomH, 0)} mm < 500`);
  if (state.longH2 < 1200) warnings.push(`第 2 格长衣 ${format(state.longH2, 0)} mm < 1200`);
  if (state.longH3 < 900) warnings.push(`第 3 格长衣 ${format(state.longH3, 0)} mm < 900`);
  if (state.shelfH4 < 250) warnings.push(`第 4 格下层 ${format(state.shelfH4, 0)} mm < 250`);
  if (state.shelfH4Upper < 180) warnings.push(`第 4 格上层 ${format(state.shelfH4Upper, 0)} mm < 180`);
  if (state.narrowHangH < 1400) warnings.push(`最右长衣 ${format(state.narrowHangH, 0)} mm < 1400`);

  const warning = document.getElementById('height-warning');
  warning.hidden = warnings.length === 0;
  warning.textContent = warnings.join('；');
}

function renderUI() {
  syncInputs();
  updateReadouts();
  const shelfButton = document.getElementById('toggle-shelves');
  if (shelfButton) shelfButton.textContent = state.shelfRemoved ? '放回活动层板' : '取下活动层板';
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

function createKnob() {
  const group = new THREE.Group();
  const stem = cylinder(0.009, 0.02, materials.knob);
  stem.rotation.x = Math.PI / 2;
  stem.position.z = 0.01;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 12), materials.knob);
  ball.position.z = 0.028;
  ball.castShadow = true;
  ball.receiveShadow = true;
  group.add(stem, ball);
  return group;
}

function addRod(x, y, z, length) {
  const rod = cylinder(0.0125, length, materials.metal, { x, y, z });
  rod.rotation.z = Math.PI / 2;
  cabinetGroup.add(rod);
  return rod;
}

function addShelfPins({ leftX, rightX, shelfCenterY, zCenter, zSpan, t, count = 4 }) {
  const radius = 0.004;
  const length = 0.022;
  const y = shelfCenterY - t / 2 - radius;
  for (let i = 0; i < count; i += 1) {
    const z = zCenter + (i / (count - 1) - 0.5) * zSpan;
    const leftPin = cylinder(radius, length, materials.metal, { x: leftX + length / 2, y, z });
    leftPin.rotation.z = Math.PI / 2;
    cabinetGroup.add(leftPin);
    const rightPin = cylinder(radius, length, materials.metal, { x: rightX - length / 2, y, z });
    rightPin.rotation.z = Math.PI / 2;
    cabinetGroup.add(rightPin);
  }
}

function addDoor({ xLeft, xRight, yBottom, yTop, hinge, label, knobY }) {
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

  const knob = createKnob();
  const knobX = hinge === 'left' ? doorW - 0.06 : -(doorW - 0.06);
  knob.position.set(knobX, knobY, SCENE.doorT / 2);
  group.add(knob);

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
  cabinetGroup.add(group);
  return group;
}

function addDrawer({ xCenter, width, yBottom, yTop, label }) {
  const height = yTop - yBottom;
  const centerY = (yBottom + yTop) / 2;
  const group = new THREE.Group();
  group.position.set(xCenter, 0, 0);

  const front = box(width, height, SCENE.doorT, materials.whiteDoor, {
    y: centerY,
    z: SCENE.drawerFrontZ,
  });
  group.add(front);

  const knob = createKnob();
  knob.position.set(0, centerY, SCENE.drawerFrontZ + SCENE.doorT / 2);
  group.add(knob);

  const boxW = width - 0.03;
  const boxH = height - 0.02;
  const boxD = Math.min(SCENE.depth - SCENE.doorT - 0.06, 0.5);
  const boxFrontZ = SCENE.drawerFrontZ - SCENE.doorT / 2;
  const boxCenterZ = boxFrontZ - boxD / 2;
  const boxCenterY = centerY;

  const bottom = box(boxW, 0.012, boxD, materials.wood, {
    y: boxCenterY - boxH / 2 + 0.006,
    z: boxCenterZ,
  });
  const leftSide = box(0.012, boxH, boxD, materials.wood, {
    x: -boxW / 2 + 0.006,
    y: boxCenterY,
    z: boxCenterZ,
  });
  const rightSide = box(0.012, boxH, boxD, materials.wood, {
    x: boxW / 2 - 0.006,
    y: boxCenterY,
    z: boxCenterZ,
  });
  const back = box(boxW, boxH, 0.012, materials.wood, {
    y: boxCenterY,
    z: boxCenterZ - boxD / 2 + 0.006,
  });
  group.add(bottom, leftSide, rightSide, back);

  const part = {
    type: 'drawer',
    group,
    open: 0,
    target: 0,
    travel: Math.min(0.4, boxD * 0.8),
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

function createFoldedStack(width = 0.3, depth = 0.3, layers = 5, offset = 0) {
  const group = new THREE.Group();
  for (let i = 0; i < layers; i += 1) {
    const h = 0.03 + (i % 2) * 0.004;
    const w = width * (0.9 + (i % 3) * 0.025);
    const d = depth * (0.9 + (i % 2) * 0.04);
    const layer = box(w, h, d, materials.clothesColors[(i + offset) % materials.clothesColors.length], {
      y: i * 0.032 + 0.015,
      z: 0,
    });
    layer.rotation.y = ((i % 3) - 1) * 0.025;
    group.add(layer);
  }
  return group;
}

function createPantsLayer(width, count, offset = 0, includeBar = true) {
  const group = new THREE.Group();
  if (includeBar) {
    const bar = cylinder(0.008, width, materials.metal, { y: 0, z: 0 });
    bar.rotation.z = Math.PI / 2;
    group.add(bar);
  }
  for (let i = 0; i < count; i += 1) {
    const x = -width / 2 + ((i + 0.5) * width) / count;
    const pants = box(0.2, 0.29, 0.025, materials.clothesColors[(i + offset) % materials.clothesColors.length], {
      x,
      y: -0.145,
      z: 0,
    });
    pants.rotation.z = (i - 1) * 0.025;
    group.add(pants);
  }
  return group;
}

function createBag() {
  const group = new THREE.Group();
  const body = box(0.26, 0.2, 0.1, materials.clothesColors[0], { y: 0.1 });
  const flap = box(0.26, 0.06, 0.105, materials.woodDark, { y: 0.17, z: 0.004 });
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.008, 6, 16, Math.PI),
    materials.knob,
  );
  handle.position.set(0, 0.23, 0);
  handle.castShadow = true;
  const clasp = box(0.035, 0.03, 0.02, materials.metal, { y: 0.11, z: 0.06 });
  group.add(body, flap, handle, clasp);
  return group;
}

function buildCabinet() {
  interactiveParts = [];
  movableShelfGroups = [];
  movableShelfProps = [];

  const W = state.W / 1000;
  const H = state.H / 1000;
  const D = state.D / 1000;
  const t = state.t / 1000;
  const backT = 0.009;
  const doorT = t;
  const carcassD = D - doorT;
  const interiorD = D - doorT - backT;
  const carcassZ = -doorT / 2;
  const interiorZ = (backT - doorT) / 2;
  const frontZ = D / 2;
  const doorZ = D / 2 - doorT / 2;
  const drawerFrontZ = doorZ;
  const drawerT = doorT;

  SCENE.doorT = doorT;
  SCENE.doorZ = doorZ;
  SCENE.frontZ = frontZ;
  SCENE.drawerFrontZ = drawerFrontZ;
  SCENE.depth = D;

  const largeW = state.largeW / 1000;
  const narrowW = state.narrowW / 1000;
  const topRowH = state.topRowH / 1000;
  const drawerH = state.drawerH / 1000;
  const leftTopH = state.leftTopH / 1000;
  const leftPantsH = state.leftPantsH / 1000;
  const leftBottomH = state.leftBottomH / 1000;
  const longH2 = state.longH2 / 1000;
  const longH3 = state.longH3 / 1000;
  const shortH = state.shortH / 1000;
  const shelfH4 = state.shelfH4 / 1000;
  const shelfH4Upper = state.shelfH4Upper / 1000;
  const narrowHangH = state.narrowHangH / 1000;

  const bay1L = -W / 2 + t;
  const bay1R = bay1L + largeW;
  const p1 = bay1R + t / 2;
  const bay2L = bay1R + t;
  const bay2R = bay2L + largeW;
  const p2 = bay2R + t / 2;
  const bay3L = bay2R + t;
  const bay3R = bay3L + largeW;
  const p3 = bay3R + t / 2;
  const bay4L = bay3R + t;
  const bay4R = bay4L + largeW;
  const p4 = bay4R + t / 2;
  const bay5L = bay4R + t;
  const bay5R = W / 2 - t;

  const bay1C = (bay1L + bay1R) / 2;
  const bay2C = (bay2L + bay2R) / 2;
  const bay3C = (bay3L + bay3R) / 2;
  const bay4C = (bay4L + bay4R) / 2;
  const bay5C = (bay5L + bay5R) / 2;

  // Carcass
  cabinetGroup.add(
    box(t, H, carcassD, materials.whiteCarcass, { x: -W / 2 + t / 2, y: H / 2, z: carcassZ }),
    box(t, H, carcassD, materials.whiteCarcass, { x: W / 2 - t / 2, y: H / 2, z: carcassZ }),
    box(W, t, carcassD, materials.whiteCarcass, { y: H - t / 2, z: carcassZ }),
    box(W, t, carcassD, materials.whiteCarcass, { y: t / 2, z: carcassZ }),
    box(W - 2 * t, H - 2 * t, backT, materials.wood, {
      y: H / 2,
      z: -D / 2 + backT / 2,
      cast: false,
    }),
  );

  [p1, p2, p3, p4].forEach((x) => {
    cabinetGroup.add(
      box(t, H - 2 * t, interiorD, materials.wood, {
        x,
        y: H / 2,
        z: interiorZ,
      }),
    );
  });

  // Bay 1: long hanging / double pants rack / long hanging
  const leftShelf1C = t + leftBottomH + t / 2;
  const leftShelf2C = t + leftBottomH + t + leftPantsH + t / 2;
  const leftBottomRodY = t + leftBottomH - 0.08;
  const leftTopRodY = H - t - 0.08;
  const leftMiddleBottom = leftShelf1C + t / 2;
  const leftMiddleTop = leftShelf2C - t / 2;
  const pantsRodY = leftMiddleTop - 0.08;
  const pantsZOffsets = [-0.13, 0.13];

  cabinetGroup.add(
    box(largeW, t, interiorD, materials.wood, { x: bay1C, y: leftShelf1C, z: interiorZ }),
  );

  // Upper shelf in bay 1 is removable; a row of support pins sits under it on both sides.
  const bay1MovableShelf = new THREE.Group();
  bay1MovableShelf.name = 'bay1-removable-shelf';
  bay1MovableShelf.add(
    box(largeW, t, interiorD, materials.wood, { x: bay1C, y: leftShelf2C, z: interiorZ }),
  );
  movableShelfGroups.push(bay1MovableShelf);
  cabinetGroup.add(bay1MovableShelf);
  addShelfPins({
    leftX: bay1L,
    rightX: bay1R,
    shelfCenterY: leftShelf2C,
    zCenter: interiorZ,
    zSpan: interiorD - 0.14,
    t,
  });

  addRod(bay1C, leftBottomRodY, interiorZ, largeW - 0.06);
  addRod(bay1C, leftTopRodY, interiorZ, largeW - 0.06);
  pantsZOffsets.forEach((zOffset) => {
    addRod(bay1C, pantsRodY, interiorZ + zOffset, largeW - 0.06);
  });

  // Bay 2: top row + long hanging + 2 drawers
  const bay2TopShelfC = H - t - topRowH - t / 2;
  const bay2DrawerZoneTop = t + 2 * drawerH + t;
  const bay2DrawerShelfC = bay2DrawerZoneTop + t / 2;
  const bay2LongRodY = bay2TopShelfC - t / 2 - 0.08;

  cabinetGroup.add(
    box(largeW, t, interiorD, materials.wood, { x: bay2C, y: bay2TopShelfC, z: interiorZ }),
    box(largeW, t, interiorD, materials.wood, { x: bay2C, y: bay2DrawerShelfC, z: interiorZ }),
  );
  addRod(bay2C, bay2LongRodY, interiorZ, largeW - 0.06);

  for (let i = 0; i < 2; i += 1) {
    const yBottom = t + i * (drawerH + t);
    addDrawer({
      xCenter: bay2C,
      width: largeW - 2 * GAP,
      yBottom,
      yTop: yBottom + drawerH,
      label: `第 2 格抽屉 ${i + 1}`,
    });
  }

  // Bay 3: top row + long hanging + 3 drawers
  const bay3TopShelfC = H - t - topRowH - t / 2;
  const bay3DrawerZoneTop = t + 3 * drawerH + 2 * t;
  const bay3DrawerShelfC = bay3DrawerZoneTop + t / 2;
  const bay3LongRodY = bay3TopShelfC - t / 2 - 0.08;

  cabinetGroup.add(
    box(largeW, t, interiorD, materials.wood, { x: bay3C, y: bay3TopShelfC, z: interiorZ }),
    box(largeW, t, interiorD, materials.wood, { x: bay3C, y: bay3DrawerShelfC, z: interiorZ }),
  );
  addRod(bay3C, bay3LongRodY, interiorZ, largeW - 0.06);

  for (let i = 0; i < 3; i += 1) {
    const yBottom = t + i * (drawerH + t);
    addDrawer({
      xCenter: bay3C,
      width: largeW - 2 * GAP,
      yBottom,
      yTop: yBottom + drawerH,
      label: `第 3 格抽屉 ${i + 1}`,
    });
  }

  // Bay 4: short hanging + 4 shelf compartments (bottom 1 + upper 3)
  const bay4ShortShelfC = H - t - shortH - t / 2;
  // The original lower shelf (B) stays fixed; above it, two shelves divide the space into 3.
  const bay4Shelf1C = t + shelfH4 + t / 2;
  const bay4Shelf2C = bay4Shelf1C + shelfH4Upper + t;
  const bay4Shelf3C = bay4Shelf2C + shelfH4Upper + t;
  const bay4ShortRodY = H - t - 0.08;

  cabinetGroup.add(
    box(largeW, t, interiorD, materials.wood, { x: bay4C, y: bay4ShortShelfC, z: interiorZ }),
    box(largeW, t, interiorD, materials.wood, { x: bay4C, y: bay4Shelf1C, z: interiorZ }),
    box(largeW, t, interiorD, materials.wood, { x: bay4C, y: bay4Shelf2C, z: interiorZ }),
  );

  // The upper of the two new shelves is removable, with support pins under it.
  const bay4MovableShelf = new THREE.Group();
  bay4MovableShelf.name = 'bay4-removable-shelf';
  bay4MovableShelf.add(
    box(largeW, t, interiorD, materials.wood, { x: bay4C, y: bay4Shelf3C, z: interiorZ }),
  );
  movableShelfGroups.push(bay4MovableShelf);
  cabinetGroup.add(bay4MovableShelf);
  addShelfPins({
    leftX: bay4L,
    rightX: bay4R,
    shelfCenterY: bay4Shelf3C,
    zCenter: interiorZ,
    zSpan: interiorD - 0.14,
    t,
  });

  addRod(bay4C, bay4ShortRodY, interiorZ, largeW - 0.06);

  // Bay 5: open narrow hanging, top shelf, no door
  const bay5TopShelfC = H - t - topRowH - t / 2;
  const bay5LongRodY = bay5TopShelfC - t / 2 - 0.08;
  const bay5ShelfC = bay4Shelf1C;
  cabinetGroup.add(
    box(narrowW, t, interiorD, materials.wood, { x: bay5C, y: bay5TopShelfC, z: interiorZ }),
    // New shelf aligned with bay 4's lowest shelf; set back 150 at the front.
    box(narrowW, t, interiorD - 0.15, materials.wood, {
      x: bay5C,
      y: bay5ShelfC,
      z: interiorZ - 0.075,
    }),
  );
  addRod(bay5C, bay5LongRodY, interiorZ, narrowW - 0.06);

  // Doors: 4 pairs over bays 1-4; bay 5 stays open.
  // Bays 2/3 stop above the drawer bank so the drawer fronts stay exposed and flush.
  const bays = [
    { left: bay1L, right: bay1R, name: '第 1 格', yBottom: GAP },
    { left: bay2L, right: bay2R, name: '第 2 格', yBottom: bay2DrawerZoneTop + GAP },
    { left: bay3L, right: bay3R, name: '第 3 格', yBottom: bay3DrawerZoneTop + GAP },
    { left: bay4L, right: bay4R, name: '第 4 格', yBottom: GAP },
  ];
  bays.forEach((bay) => {
    const center = (bay.left + bay.right) / 2;
    addDoor({
      xLeft: bay.left + GAP,
      xRight: center - GAP / 2,
      yBottom: bay.yBottom,
      yTop: H - GAP,
      hinge: 'left',
      label: `${bay.name}左门`,
      knobY: 1.1,
    });
    addDoor({
      xLeft: center + GAP / 2,
      xRight: bay.right - GAP,
      yBottom: bay.yBottom,
      yTop: H - GAP,
      hinge: 'right',
      label: `${bay.name}右门`,
      knobY: 1.1,
    });
  });

  // Props
  propsGroup = new THREE.Group();
  propsGroup.name = 'props';
  cabinetGroup.add(propsGroup);

  // Bay 1 clothes and pants
  [-0.24, -0.08, 0.08, 0.24].forEach((offset, index) => {
    const bottomGarment = createHangingGarment(materials, index, 0.68, 0.34);
    bottomGarment.position.set(bay1C + offset, leftBottomRodY, interiorZ);
    propsGroup.add(bottomGarment);
    const topGarment = createHangingGarment(materials, index + 2, 0.68, 0.34);
    topGarment.position.set(bay1C + offset, leftTopRodY, interiorZ);
    propsGroup.add(topGarment);
  });
  pantsZOffsets.forEach((zOffset, index) => {
    const pants = createPantsLayer(largeW - 0.08, 3, index + 1, false);
    pants.position.set(bay1C, pantsRodY, interiorZ + zOffset);
    propsGroup.add(pants);
  });

  // Bay 2 top row + long clothes
  [-0.18, 0.18].forEach((offset, index) => {
    const stack = createFoldedStack(0.28, 0.28, 5, index);
    stack.position.set(bay2C + offset, H - t - topRowH + 0.005, interiorZ);
    propsGroup.add(stack);
  });
  [-0.24, -0.08, 0.08, 0.24].forEach((offset, index) => {
    const garment = createHangingGarment(materials, index, 1.18, 0.34);
    garment.position.set(bay2C + offset, bay2LongRodY, interiorZ);
    propsGroup.add(garment);
  });

  // Bay 3 top row + long clothes
  [-0.18, 0.18].forEach((offset, index) => {
    const stack = createFoldedStack(0.28, 0.28, 5, index + 2);
    stack.position.set(bay3C + offset, H - t - topRowH + 0.005, interiorZ);
    propsGroup.add(stack);
  });
  [-0.24, -0.08, 0.08, 0.24].forEach((offset, index) => {
    const garment = createHangingGarment(materials, index + 1, 0.98, 0.34);
    garment.position.set(bay3C + offset, bay3LongRodY, interiorZ);
    propsGroup.add(garment);
  });

  // Bay 4 short clothes + folded shelf compartments
  [-0.22, 0, 0.22].forEach((offset, index) => {
    const garment = createHangingGarment(materials, index, 0.7, 0.32);
    garment.position.set(bay4C + offset, bay4ShortRodY, interiorZ);
    propsGroup.add(garment);
  });
  const bay4CellBases = [
    t,
    bay4Shelf1C + t / 2,
    bay4Shelf2C + t / 2,
    bay4Shelf3C + t / 2,
  ];
  bay4CellBases.forEach((bottomY, index) => {
    [-0.18, 0.18].forEach((offset, stackIndex) => {
      const stack = createFoldedStack(0.28, 0.28, 5, index + stackIndex);
      stack.position.set(bay4C + offset, bottomY + 0.005, interiorZ);
      propsGroup.add(stack);
      if (index === 3) movableShelfProps.push(stack);
    });
  });

  // Bay 5 bag + long clothes + basket
  const bag = createBag();
  bag.position.set(bay5C, H - t - topRowH + 0.005, interiorZ);
  propsGroup.add(bag);
  [-0.08, 0.08].forEach((offset, index) => {
    const garment = createHangingGarment(materials, index + 2, 1.3, 0.3);
    garment.position.set(bay5C + offset, bay5LongRodY, interiorZ);
    propsGroup.add(garment);
  });
  const narrowBasket = createBasket(Math.min(0.3, narrowW - 0.08), 0.24, 0.3, materials);
  narrowBasket.position.set(bay5C, t, interiorZ);
  propsGroup.add(narrowBasket);

  dimensionGroup = createDimensions({ width: W, height: H, depth: D }, materials);
  cabinetGroup.add(dimensionGroup);

  applyVisibility();
  updateRoom(room, { width: W, height: H, depth: D });
}

function applyVisibility() {
  if (propsGroup) propsGroup.visible = state.showProps;
  if (dimensionGroup) dimensionGroup.visible = state.showDims;
  movableShelfGroups.forEach((group) => {
    group.visible = !state.shelfRemoved;
  });
  movableShelfProps.forEach((prop) => {
    prop.visible = !state.shelfRemoved;
  });
}

function rebuild() {
  normalizeState();
  const direction = viewer.camera.position.clone().sub(viewer.controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.02, 0.12, 1);
  direction.normalize();

  disposeGroup(cabinetGroup);
  buildCabinet();

  const W = state.W / 1000;
  const H = state.H / 1000;
  const D = state.D / 1000;
  fitCamera(viewer.camera, viewer.controls, { width: W, height: H, depth: D }, {
    direction: firstBuild ? new THREE.Vector3(0.02, 0.12, 1) : direction,
    margin: 1.42,
  });
  firstBuild = false;

  renderUI();
  if (loading) loading.classList.add('is-hidden');
}

function resetView() {
  fitCamera(
    viewer.camera,
    viewer.controls,
    { width: state.W / 1000, height: state.H / 1000, depth: state.D / 1000 },
    { direction: new THREE.Vector3(0.02, 0.12, 1), margin: 1.42 },
  );
}

function setPartTargets(open) {
  interactiveParts.forEach((part) => {
    part.target = open ? 1 : 0;
  });
}

function findPart(intersections) {
  for (const hit of intersections) {
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

document.getElementById('toggle-shelves').addEventListener('click', () => {
  state.shelfRemoved = !state.shelfRemoved;
  renderUI();
  applyVisibility();
});

document.getElementById('open-all').addEventListener('click', () => setPartTargets(true));
document.getElementById('close-all').addEventListener('click', () => setPartTargets(false));
document.getElementById('reset-view').addEventListener('click', resetView);

document.getElementById('show-dims').addEventListener('change', (event) => {
  state.showDims = event.target.checked;
  applyVisibility();
});

document.getElementById('show-props').addEventListener('change', (event) => {
  state.showProps = event.target.checked;
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
      } else {
        part.group.position.z = part.open * part.travel;
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
