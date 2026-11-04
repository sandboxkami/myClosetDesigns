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
  createDimensionLabel,
  createDimensionAnnotation,
  createLeaderAnnotation,
  disposeGroup,
  fitCamera,
  damp,
} from '../assets/js/viewer-core.js';

const FIXED = Object.freeze({ W: 3700, H: 2400, D: 600 });

const DEFAULTS = {
  W: FIXED.W,
  H: FIXED.H,
  D: FIXED.D,
  topRowH: 400,
  drawerH: 200,
  leftTopH: 796,
  leftPantsH: 700,
  leftBottomH: 832,
  shortH: 1000,
  narrowW: 399.2,
  t: 18,
  shelfRemoved: false,
  drawerDividersOn: true,
};

const state = {
  ...DEFAULTS,
  showDims: true,
  showProps: true,
  largeW: 0,
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
const ROD_R = 0.0125;
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
let drawerDividerGroups = [];
let drawerPropGroups = [];
let propsGroup = null;
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
  // Overall size is fixed; only the internal layout stays adjustable.
  state.W = FIXED.W;
  state.H = FIXED.H;
  state.D = FIXED.D;
  state.topRowH = clamp(state.topRowH, 300, 500);
  state.drawerH = clamp(state.drawerH, 180, 250);
  state.shortH = clamp(state.shortH, 800, 1200);
  state.narrowW = clamp(state.narrowW, 300, 500);
  state.t = clamp(Math.round(state.t), 16, 25);

  // Bay 1 is dimension-driven: lower hanging clear height is fixed at 832;
  // the double pants rods sit 650 above the lower shelf, and the movable shelf
  // sits 50 above the rod top, leaving a 700 pants compartment. The upper
  // hanging clear height is whatever remains after board thickness.
  state.leftBottomH = 832;
  state.leftPantsH = 700;
  state.leftTopH = state.H - state.leftBottomH - state.leftPantsH - 4 * state.t;

  state.largeW = (state.W - 6 * state.t - state.narrowW) / 4;
  state.longH2 = state.H - state.topRowH - 2 * state.drawerH - 5 * state.t;
  state.longH3 = state.H - state.topRowH - 3 * state.drawerH - 6 * state.t;
  state.shelfH4 = (state.H - state.shortH - 5 * state.t) / 3;
  state.shelfH4Upper = (state.H - state.shortH - 6 * state.t - state.shelfH4) / 3;
  state.narrowHangH = state.H - state.topRowH - 3 * state.t;
  state.doorW = state.largeW / 2 - 1.5 * 3;
}

function syncInputs() {
  document.querySelectorAll('[data-range], [data-number]').forEach((input) => {
    const key = input.dataset.range || input.dataset.number;
    if (key in state) input.value = state[key];
  });
}

function updateReadouts() {
  document.getElementById('size-readout').textContent = `${Math.round(state.W)} × ${Math.round(state.H)} × ${Math.round(state.D)} mm`;

  // Decision board, block 2: unfixed key dimensions.
  document.getElementById('decision-topRowH').textContent = `${format(state.topRowH, 0)} mm`;
  document.getElementById('decision-shortH').textContent = `${format(state.shortH, 0)} mm`;
  document.getElementById('decision-drawerH').textContent = `${format(state.drawerH, 0)} mm`;
  document.getElementById('decision-narrowW').textContent = `${format(state.narrowW, 1)} mm`;
  document.getElementById('decision-t').textContent = `${format(state.t, 0)} mm`;
  document.getElementById('decision-largeW').textContent = `${format(state.largeW, 1)} mm`;
  document.getElementById('decision-longH2').textContent = `${format(state.longH2, 0)} mm`;
  document.getElementById('decision-longH3').textContent = `${format(state.longH3, 0)} mm`;
  document.getElementById('decision-shelfH4').textContent = `${format(state.shelfH4, 1)} / ${format(state.shelfH4Upper, 1)} mm`;
  document.getElementById('decision-doorW').textContent = `${format(state.doorW, 1)} mm`;

  const bay1SplitY = state.t + state.leftBottomH + state.t + state.leftPantsH + state.t / 2;
  const bay23SplitY = state.H - state.t - state.topRowH - state.t / 2;
  const bay4SplitY = state.H - state.t - state.shortH - state.t / 2;

  document.getElementById('door-width').textContent = `${format(state.doorW, 1)} mm`;
  document.getElementById('left-bottom').textContent = `${format(state.leftBottomH, 0)} mm`;
  document.getElementById('left-pants').textContent = `${format(state.leftPantsH, 0)} mm`;
  document.getElementById('left-upper').textContent = `${format(state.leftTopH, 0)} mm`;
  document.getElementById('long-2').textContent = `${format(state.longH2, 0)} mm`;
  document.getElementById('long-3').textContent = `${format(state.longH3, 0)} mm`;
  document.getElementById('shelf-4').textContent = `${format(state.shelfH4, 1)} / ${format(state.shelfH4Upper, 1)} mm`;
  document.getElementById('narrow-hang').textContent = `${format(state.narrowHangH, 0)} mm`;
  document.getElementById('door-splits').textContent =
    `第 1 格 ${format(bay1SplitY, 0)} / 第 2·3 格 ${format(bay23SplitY, 0)} / 第 4 格 ${format(bay4SplitY, 0)} mm`;

  const warnings = [];
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
  const dividerButton = document.getElementById('toggle-drawer-dividers');
  if (dividerButton) {
    dividerButton.textContent = state.drawerDividersOn ? '隐藏抽屉隔板' : '显示抽屉隔板';
  }
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

function addDrawer({ xCenter, width, yBottom, yTop, label, dividers = 0 }) {
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

  // Loose vertical dividers: stood on edge inside the drawer, running front-to-
  // back and held in place by the folded clothes. They travel with the drawer.
  if (dividers > 0) {
    const innerW = boxW - 0.024;
    const dividerT = 0.012;
    const dividerH = boxH - 0.022;
    const dividerD = boxD - 0.05;
    const dividerY = boxCenterY + 0.001;
    const dividerZ = boxCenterZ + 0.006;
    const floorY = boxCenterY - boxH / 2 + 0.012;

    for (let i = 0; i < dividers; i += 1) {
      const x = -innerW / 2 + ((i + 1) * innerW) / (dividers + 1);
      const divider = box(dividerT, dividerH, dividerD, materials.woodLight, {
        x,
        y: dividerY,
        z: dividerZ,
      });
      group.add(divider);
      drawerDividerGroups.push(divider);
    }

    for (let i = 0; i < dividers + 1; i += 1) {
      const compartmentX = -innerW / 2 + ((i + 0.5) * innerW) / (dividers + 1);
      const stack = createFoldedStack(0.16, 0.34, 4, i * 2);
      stack.position.set(compartmentX, floorY, dividerZ);
      group.add(stack);
      drawerPropGroups.push(stack);
    }
  }

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
  drawerDividerGroups = [];
  drawerPropGroups = [];

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
  const drawerBodyD = Math.min(D - doorT - 0.06, 0.5);
  const drawerTravel = Math.min(0.4, drawerBodyD * 0.8);
  const doorPanels = [];
  const bay2Drawers = [];
  const bay3Drawers = [];

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

  // Bay 1: long hanging / double pants rack / long hanging.
  // Fixed chain: lower shelf clear 832, pants rods 650 above the lower shelf,
  // movable shelf 50 above the rod top. Rods are 25mm diameter.
  const leftShelf1C = t + leftBottomH + t / 2;
  const leftShelf2C = leftShelf1C + t + leftPantsH;
  const leftMiddleBottom = leftShelf1C + t / 2;
  const leftMiddleTop = leftShelf2C - t / 2;
  const pantsRodTop = leftMiddleBottom + 0.650;
  const pantsRodY = pantsRodTop - ROD_R;
  const leftBottomRodY = (leftShelf1C - t / 2) - 0.050 - ROD_R;
  const leftTopRodY = (H - t) - 0.050 - ROD_R;
  const pantsRodZBack = -D / 2 + backT + 0.130;
  const pantsRodZFront = D / 2 - doorT - 0.160;

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
  addRod(bay1C, pantsRodY, pantsRodZBack, largeW - 0.06);
  addRod(bay1C, pantsRodY, pantsRodZFront, largeW - 0.06);

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
      dividers: 1,
    });
    bay2Drawers.push({
      index: i,
      xCenter: bay2C,
      width: largeW - 2 * GAP,
      yBottom,
      yTop: yBottom + drawerH,
      label: `第 2 格抽屉 ${i + 1}`,
      dividers: 1,
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
      dividers: 1,
    });
    bay3Drawers.push({
      index: i,
      xCenter: bay3C,
      width: largeW - 2 * GAP,
      yBottom,
      yTop: yBottom + drawerH,
      label: `第 3 格抽屉 ${i + 1}`,
      dividers: 1,
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
  // Each left/right door is split at the first shelf below the top of its bay
  // to keep panel heights down. Bays 2/3 stop above the drawer bank so the
  // drawer fronts stay exposed and flush.
  const bays = [
    { left: bay1L, right: bay1R, name: '第 1 格', yBottom: GAP, splitY: leftShelf2C },
    { left: bay2L, right: bay2R, name: '第 2 格', yBottom: bay2DrawerZoneTop + GAP, splitY: bay2TopShelfC },
    { left: bay3L, right: bay3R, name: '第 3 格', yBottom: bay3DrawerZoneTop + GAP, splitY: bay3TopShelfC },
    { left: bay4L, right: bay4R, name: '第 4 格', yBottom: GAP, splitY: bay4ShortShelfC },
  ];
  bays.forEach((bay) => {
    const center = (bay.left + bay.right) / 2;
    const lowerTop = bay.splitY - GAP / 2;
    const upperBottom = bay.splitY + GAP / 2;
    const lowerKnobY = Math.min(1.15, lowerTop - 0.08);
    const upperKnobY = upperBottom + 0.12;
    const panels = [
      {
        name: '左下', xLeft: bay.left + GAP, xRight: center - GAP / 2,
        yBottom: bay.yBottom, yTop: lowerTop, hinge: 'left', knobY: lowerKnobY,
      },
      {
        name: '左上', xLeft: bay.left + GAP, xRight: center - GAP / 2,
        yBottom: upperBottom, yTop: H - GAP, hinge: 'left', knobY: upperKnobY,
      },
      {
        name: '右下', xLeft: center + GAP / 2, xRight: bay.right - GAP,
        yBottom: bay.yBottom, yTop: lowerTop, hinge: 'right', knobY: lowerKnobY,
      },
      {
        name: '右上', xLeft: center + GAP / 2, xRight: bay.right - GAP,
        yBottom: upperBottom, yTop: H - GAP, hinge: 'right', knobY: upperKnobY,
      },
    ];
    panels.forEach((panel) => {
      const label = `${bay.name}${panel.name}门`;
      addDoor({
        xLeft: panel.xLeft,
        xRight: panel.xRight,
        yBottom: panel.yBottom,
        yTop: panel.yTop,
        hinge: panel.hinge,
        label,
        knobY: panel.knobY,
      });
      doorPanels.push({
        label,
        x1: panel.xLeft,
        x2: panel.xRight,
        y1: panel.yBottom,
        y2: panel.yTop,
      });
    });
  });

  // Bay 5 top compartment: single door, hinged on the outer (right) side.
  addDoor({
    xLeft: bay5L + GAP,
    xRight: bay5R - GAP,
    yBottom: H - t - topRowH + GAP,
    yTop: H - GAP,
    hinge: 'right',
    label: '最右顶格门',
    knobY: H - t - topRowH + 0.12,
  });
  doorPanels.push({
    label: '最右顶格门',
    x1: bay5L + GAP,
    x2: bay5R - GAP,
    y1: H - t - topRowH + GAP,
    y2: H - GAP,
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
  [pantsRodZBack, pantsRodZFront].forEach((z, index) => {
    const pants = createPantsLayer(largeW - 0.08, 3, index + 1, false);
    pants.position.set(bay1C, pantsRodY, z);
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

  layout = {
    W,
    H,
    D,
    t,
    backT,
    doorT,
    carcassD,
    interiorD,
    carcassZ,
    interiorZ,
    frontZ,
    doorZ,
    drawerFrontZ,
    largeW,
    narrowW,
    topRowH,
    drawerH,
    leftTopH,
    leftPantsH,
    leftBottomH,
    longH2,
    longH3,
    shortH,
    shelfH4,
    shelfH4Upper,
    narrowHangH,
    doorW: state.doorW / 1000,
    bay1L,
    bay1R,
    bay2L,
    bay2R,
    bay3L,
    bay3R,
    bay4L,
    bay4R,
    bay5L,
    bay5R,
    bay1C,
    bay2C,
    bay3C,
    bay4C,
    bay5C,
    p1,
    p2,
    p3,
    p4,
    leftShelf1C,
    leftShelf2C,
    leftMiddleBottom,
    leftMiddleTop,
    pantsRodTop,
    pantsRodY,
    pantsRodZBack,
    pantsRodZFront,
    rodR: ROD_R,
    leftBottomRodY,
    leftTopRodY,
    bay2TopShelfC,
    bay2DrawerZoneTop,
    bay2DrawerShelfC,
    bay2LongRodY,
    bay3TopShelfC,
    bay3DrawerZoneTop,
    bay3DrawerShelfC,
    bay3LongRodY,
    bay4ShortShelfC,
    bay4Shelf1C,
    bay4Shelf2C,
    bay4Shelf3C,
    bay4ShortRodY,
    bay5TopShelfC,
    bay5LongRodY,
    bay5ShelfC,
    doorPanels,
    bay2Drawers,
    bay3Drawers,
    drawerBodyD,
    drawerTravel,
    drawerInnerW: largeW - 2 * GAP - 0.054,
    dividerT: 0.012,
    dividerH: drawerH - 0.042,
    dividerD: drawerBodyD - 0.05,
  };

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
  drawerDividerGroups.forEach((group) => {
    group.visible = state.drawerDividersOn;
  });
  drawerPropGroups.forEach((group) => {
    group.visible = state.showProps;
  });
}

function focusNum(value) {
  return Math.round(value * 1000);
}

function focusNum1(value) {
  return (Math.round(value * 10000) / 10).toFixed(1);
}

function focusMm(value) {
  return `${focusNum(value)} mm`;
}

function focusBox(x1, x2, y1, y2, z1, z2, fill = true) {
  return { x1, x2, y1, y2, z1, z2, fill };
}

function focusLabel(text, x, y, z, type = 'dim') {
  return { text, x, y, z, type };
}

function buildFocusStops() {
  if (!layout) return [];
  const L = layout;
  const front = L.frontZ;
  const door = L.doorZ;
  const drawerFront = L.drawerFrontZ + L.drawerTravel;
  const drawerBack = drawerFront - L.drawerBodyD;
  const drawerMid = (L.bay2L + L.bay3R) / 2;
  const bayList = [
    { x1: L.bay1L, x2: L.bay1R, label: focusNum1(L.largeW) },
    { x1: L.bay2L, x2: L.bay2R, label: focusNum1(L.largeW) },
    { x1: L.bay3L, x2: L.bay3R, label: focusNum1(L.largeW) },
    { x1: L.bay4L, x2: L.bay4R, label: focusNum1(L.largeW) },
    { x1: L.bay5L, x2: L.bay5R, label: focusNum1(L.narrowW) },
  ];
  const allDrawers = [...L.bay2Drawers, ...L.bay3Drawers];
  const dividerBoxes = allDrawers.map((drawer) => {
    const centerY = (drawer.yBottom + drawer.yTop) / 2;
    const zCenter = L.drawerTravel + (L.drawerFrontZ - L.doorT / 2 - L.drawerBodyD / 2) + 0.006;
    const z1 = zCenter - L.dividerD / 2;
    const z2 = zCenter + L.dividerD / 2;
    const x = drawer.xCenter;
    return focusBox(
      x - L.dividerT / 2, x + L.dividerT / 2,
      centerY - L.dividerH / 2, centerY + L.dividerH / 2,
      z1, z2,
    );
  });
  const bay2DoorBottom = L.bay2DrawerZoneTop + GAP;
  const bay3DoorBottom = L.bay3DrawerZoneTop + GAP;
  const topDoorBottom = L.H - L.t - L.topRowH + GAP;

  return [
    {
      id: 'overall',
      part: '整体外形',
      title: '整体外形',
      value: `${focusMm(L.W)} × ${focusMm(L.H)} × ${focusMm(L.D)}`,
      desc: `外形固定 ${focusNum(L.W)}×${focusNum(L.H)}×${focusNum(L.D)}；5 个分区、17 扇门，内部尺寸可调。`,
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
          tick: 0.04,
        },
      ],
      labels: [
        focusLabel('整体外形', 0, L.H * 0.56, front + 0.04, 'part'),
      ],
      dir: [0.02, 0.12, 1],
      margin: 1.35,
    },
    {
      id: 'five-bays',
      part: '5 分区 / 竖板',
      title: '5 分区：4 大格 + 最右窄格',
      value: `4 × ${focusNum1(L.largeW)} + ${focusNum1(L.narrowW)}`,
      desc: `总宽 ${focusNum(L.W)}，4 个大格各约 ${focusNum1(L.largeW)}，最右窄格 ${focusNum1(L.narrowW)}；6 块 ${focusNum(L.t)}mm 竖板。`,
      boxes: [focusBox(-L.W / 2, L.W / 2, 0, L.H, front - 0.01, front + 0.01, false)],
      dims: bayList.map((bay) => ({
        start: [bay.x1, L.H, front],
        end: [bay.x2, L.H, front],
        offset: [0, 0.14, 0],
        label: bay.label,
        tick: 0.03,
      })),
      labels: [
        focusLabel(`6 块 ${focusNum(L.t)}mm 竖板`, 0, L.H * 0.62, front + 0.05, 'part'),
      ],
      dir: [0.02, 0.12, 1],
      margin: 1.3,
    },
    {
      id: 'bay1-overview',
      part: '第 1 格 / 三区',
      title: `第 1 格：下挂 ${focusNum(L.leftBottomH)} / 裤架 ${focusNum(L.leftPantsH)} / 上挂 ${focusNum(L.leftTopH)}`,
      value: `${focusNum(L.leftBottomH)} / ${focusNum(L.leftPantsH)} / ${focusNum(L.leftTopH)}`,
      desc: `第 1 格分三区；下挂区 ${focusNum(L.leftBottomH)} 固定，双层裤架净高 ${focusNum(L.leftPantsH)}，上挂区 ${focusNum(L.leftTopH)}。中段内外两根裤杆同高；上层靠顶为活动层板，两侧有支撑钉；门板在活动层板处分上下。`,
      boxes: [
        focusBox(L.bay1L, L.bay1R, 0, L.H, -L.D / 2, L.D / 2, false),
        focusBox(L.bay1L, L.bay1R, L.leftMiddleBottom, L.leftMiddleTop,
          L.interiorZ - L.interiorD / 2, L.interiorZ + L.interiorD / 2, false),
      ],
      dims: [
        {
          start: [L.bay1L, L.t, door],
          end: [L.bay1L, L.t + L.leftBottomH, door],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.leftBottomH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay1L, L.leftMiddleBottom, door],
          end: [L.bay1L, L.leftMiddleTop, door],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.leftPantsH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay1L, L.leftShelf2C + L.t / 2, door],
          end: [L.bay1L, L.H - L.t, door],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.leftTopH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
      ],
      leaders: [
        {
          point: [L.bay1C, L.leftShelf2C, L.interiorZ + L.interiorD / 2],
          labelPoint: [L.bay1C + 0.35, L.leftShelf2C + 0.2, door + 0.08],
          label: '上层活动层板',
        },
      ],
      labels: [],
      openParts: ['第 1 格左上门', '第 1 格左下门', '第 1 格右上门', '第 1 格右下门'],
      dir: [-0.4, 0.12, 1],
      margin: 1.5,
      minDistance: 1.2,
      targetY: 1.05,
    },
    {
      id: 'bay1-top-rod',
      part: '第 1 格最上挂杆',
      title: '最上挂杆：上沿距顶板下沿 50',
      value: '50 / 杆径 25',
      desc: `最上挂杆上边沿距顶板下边沿严格 50；杆径 25，杆轴心距顶板下沿 ${focusNum1(0.050 + L.rodR)}。`,
      boxes: [
        focusBox(L.bay1L, L.bay1R, L.H - L.t, L.H,
          L.interiorZ - L.interiorD / 2, L.interiorZ + L.interiorD / 2, false),
        focusBox(L.bay1L, L.bay1R, L.leftTopRodY - L.rodR, L.leftTopRodY + L.rodR,
          L.interiorZ - 0.03, L.interiorZ + 0.03),
      ],
      dims: [
        {
          start: [L.bay1L, L.H - L.t, door],
          end: [L.bay1L, L.leftTopRodY + L.rodR, door],
          offset: [-0.14, 0, 0.02],
          label: '50',
          tick: 0.02,
        },
      ],
      leaders: [
        {
          point: [L.bay1C, L.leftTopRodY, L.interiorZ + 0.03],
          labelPoint: [L.bay1C + 0.3, L.leftTopRodY - 0.1, door + 0.08],
          label: '最上挂杆',
        },
      ],
      labels: [],
      openParts: ['第 1 格左上门', '第 1 格左下门', '第 1 格右上门', '第 1 格右下门'],
      dir: [-0.3, 0.12, 1],
      margin: 1.75,
      minDistance: 1.1,
    },
    {
      id: 'bay1-pants-rods',
      part: '第 1 格双层裤架 / 活动层板',
      title: '双层裤架：同高 / 杆上沿距下层板 650 / 前 130·160',
      value: '650 / 130 / 160',
      desc: `两根裤杆同高，杆上边沿距下方层板 650；内侧杆轴心距背板 130，外侧杆轴心距柜门 160；活动层板下沿在杆上沿上方 50。`,
      boxes: [
        focusBox(L.bay1L, L.bay1R, L.leftMiddleBottom, L.leftMiddleTop,
          L.interiorZ - L.interiorD / 2, L.interiorZ + L.interiorD / 2, false),
        focusBox(L.bay1L, L.bay1R, L.leftShelf2C - L.t / 2, L.leftShelf2C + L.t / 2,
          L.interiorZ - L.interiorD / 2, L.interiorZ + L.interiorD / 2),
        focusBox(L.bay1L, L.bay1R, L.pantsRodY - L.rodR, L.pantsRodY + L.rodR,
          L.pantsRodZBack - 0.02, L.pantsRodZBack + 0.02),
        focusBox(L.bay1L, L.bay1R, L.pantsRodY - L.rodR, L.pantsRodY + L.rodR,
          L.pantsRodZFront - 0.02, L.pantsRodZFront + 0.02),
      ],
      dims: [
        {
          start: [L.bay1R, L.leftMiddleBottom, door],
          end: [L.bay1R, L.pantsRodY + L.rodR, door],
          offset: [0.14, 0, 0.02],
          label: '650',
          tick: 0.02,
        },
        {
          start: [L.bay1C, L.pantsRodY + 0.06, -L.D / 2 + L.backT],
          end: [L.bay1C, L.pantsRodY + 0.06, L.pantsRodZBack],
          offset: [-0.5, 0, 0],
          label: '130',
          tick: 0.015,
        },
        {
          start: [L.bay1C, L.pantsRodY - 0.06, L.pantsRodZFront],
          end: [L.bay1C, L.pantsRodY - 0.06, L.D / 2 - L.doorT],
          offset: [-0.5, 0, 0],
          label: '160',
          tick: 0.015,
        },
      ],
      leaders: [
        {
          point: [L.bay1C, L.pantsRodY + L.rodR + 0.025, L.interiorZ + L.interiorD / 2 - 0.06],
          labelPoint: [L.bay1C + 0.3, L.leftShelf2C + 0.14, door + 0.08],
          label: '活动层板下沿 +50',
        },
        {
          point: [L.bay1C, L.pantsRodY, L.pantsRodZFront],
          labelPoint: [L.bay1C - 0.28, L.pantsRodY - 0.16, door + 0.08],
          label: '内外双杆同高',
        },
      ],
      labels: [],
      openParts: ['第 1 格左上门', '第 1 格左下门', '第 1 格右上门', '第 1 格右下门'],
      dir: [-0.4, 0.18, 1],
      margin: 1.55,
      minDistance: 1.15,
      targetY: 1.18,
    },
    {
      id: 'bay1-bottom-rod',
      part: '第 1 格最下挂杆',
      title: '最下挂杆：上沿距上方层板 50',
      value: '50 / 杆径 25',
      desc: `最下挂杆上边沿距其上方层板下边沿严格 50；杆径 25，杆轴心距层板下沿 ${focusNum1(0.050 + L.rodR)}。`,
      boxes: [
        focusBox(L.bay1L, L.bay1R, L.leftShelf1C - L.t / 2, L.leftShelf1C + L.t / 2,
          L.interiorZ - L.interiorD / 2, L.interiorZ + L.interiorD / 2, false),
        focusBox(L.bay1L, L.bay1R, L.leftBottomRodY - L.rodR, L.leftBottomRodY + L.rodR,
          L.interiorZ - 0.03, L.interiorZ + 0.03),
      ],
      dims: [
        {
          start: [L.bay1L, L.leftShelf1C - L.t / 2, door],
          end: [L.bay1L, L.leftBottomRodY + L.rodR, door],
          offset: [-0.14, 0, 0.02],
          label: '50',
          tick: 0.02,
        },
      ],
      leaders: [
        {
          point: [L.bay1C, L.leftBottomRodY, L.interiorZ + 0.03],
          labelPoint: [L.bay1C + 0.3, L.leftBottomRodY - 0.1, door + 0.08],
          label: '最下挂杆',
        },
      ],
      labels: [],
      openParts: ['第 1 格左上门', '第 1 格左下门', '第 1 格右上门', '第 1 格右下门'],
      dir: [-0.3, 0.12, 1],
      margin: 1.75,
      minDistance: 1.1,
      targetY: 0.72,
    },
    {
      id: 'bay2',
      part: '第 2 格 / 长衣 + 2 抽屉',
      title: '第 2 格：顶排 400 / 长衣 / 2 抽屉',
      value: `400 / ${focusNum(L.longH2)} / 2×200`,
      desc: `顶排 ${focusNum(L.topRowH)}，长衣区约 ${focusNum(L.longH2)}，底部 2 个 ${focusNum(L.drawerH)} 抽屉；门底停在抽屉上方（约 ${focusNum(bay2DoorBottom)}），抽屉外露；左右门在顶排层板处分上下。`,
      boxes: [
        focusBox(L.bay2L, L.bay2R, 0, L.H, -L.D / 2, L.D / 2, false),
        focusBox(L.bay2L, L.bay2R, L.t, L.t + 2 * L.drawerH + L.t,
          L.drawerFrontZ - 0.01, L.drawerFrontZ + 0.01),
      ],
      dims: [
        {
          start: [L.bay2L, L.H - L.t - L.topRowH, door],
          end: [L.bay2L, L.H - L.t, door],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.topRowH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay2L, L.bay2DrawerShelfC + L.t / 2, door],
          end: [L.bay2L, L.bay2TopShelfC - L.t / 2, door],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.longH2)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay2L, L.t, L.drawerFrontZ],
          end: [L.bay2L, L.t + L.drawerH, L.drawerFrontZ],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.drawerH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay2L, L.t + L.drawerH + L.t, L.drawerFrontZ],
          end: [L.bay2L, L.t + 2 * L.drawerH + L.t, L.drawerFrontZ],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.drawerH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
      ],
      leaders: [
        {
          point: [L.bay2R - 0.03, bay2DoorBottom, door],
          labelPoint: [L.bay2R + 0.2, bay2DoorBottom + 0.12, door + 0.08],
          label: `门底 ${focusNum(bay2DoorBottom)}`,
        },
      ],
      labels: [
        focusLabel('抽屉外露 / 与门板齐平', L.bay2C, 0.56, front + 0.05, 'part'),
      ],
      openParts: ['第 2 格左上门', '第 2 格左下门', '第 2 格右上门', '第 2 格右下门'],
      dir: [0.05, 0.12, 1],
      margin: 1.5,
      targetY: 0.8,
    },
    {
      id: 'bay3',
      part: '第 3 格 / 长衣 + 3 抽屉',
      title: '第 3 格：顶排 400 / 长衣 / 3 抽屉',
      value: `400 / ${focusNum(L.longH3)} / 3×200`,
      desc: `顶排 ${focusNum(L.topRowH)}，长衣区约 ${focusNum(L.longH3)}，底部 3 个 ${focusNum(L.drawerH)} 抽屉；门底停在抽屉上方（约 ${focusNum(bay3DoorBottom)}），抽屉外露；左右门在顶排层板处分上下。`,
      boxes: [
        focusBox(L.bay3L, L.bay3R, 0, L.H, -L.D / 2, L.D / 2, false),
        focusBox(L.bay3L, L.bay3R, L.t, L.t + 3 * L.drawerH + 2 * L.t,
          L.drawerFrontZ - 0.01, L.drawerFrontZ + 0.01),
      ],
      dims: [
        {
          start: [L.bay3L, L.H - L.t - L.topRowH, door],
          end: [L.bay3L, L.H - L.t, door],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.topRowH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay3L, L.bay3DrawerShelfC + L.t / 2, door],
          end: [L.bay3L, L.bay3TopShelfC - L.t / 2, door],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.longH3)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        ...[0, 1, 2].map((index) => ({
          start: [L.bay3L, L.t + index * (L.drawerH + L.t), L.drawerFrontZ],
          end: [L.bay3L, L.t + index * (L.drawerH + L.t) + L.drawerH, L.drawerFrontZ],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.drawerH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        })),
      ],
      leaders: [
        {
          point: [L.bay3R - 0.03, bay3DoorBottom, door],
          labelPoint: [L.bay3R + 0.2, bay3DoorBottom + 0.12, door + 0.08],
          label: `门底 ${focusNum(bay3DoorBottom)}`,
        },
      ],
      labels: [
        focusLabel('3 个抽屉 / 门底 657', L.bay3C, 0.75, front + 0.05, 'part'),
      ],
      openParts: ['第 3 格左上门', '第 3 格左下门', '第 3 格右上门', '第 3 格右下门'],
      dir: [0.05, 0.12, 1],
      margin: 1.5,
      targetY: 0.8,
    },
    {
      id: 'bay4',
      part: '第 4 格 / 短衣 + 4 格',
      title: '第 4 格：短衣 1000 + 4 个层板格',
      value: `1000 / ${focusNum1(L.shelfH4)} + 3×${focusNum1(L.shelfH4Upper)}`,
      desc: `短衣区 ${focusNum(L.shortH)}；下方 1 格约 ${focusNum1(L.shelfH4)}，上方 3 格各约 ${focusNum1(L.shelfH4Upper)}；最上方靠顶层板为活动层板；左右门在短衣层板处分上下。`,
      boxes: [focusBox(L.bay4L, L.bay4R, 0, L.H, -L.D / 2, L.D / 2, false)],
      dims: [
        {
          start: [L.bay4L, L.bay4ShortShelfC + L.t / 2, door],
          end: [L.bay4L, L.H - L.t, door],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.shortH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay4L, L.t, door],
          end: [L.bay4L, L.bay4Shelf1C - L.t / 2, door],
          offset: [-0.14, 0, 0.02],
          label: focusNum1(L.shelfH4),
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        ...[
          [L.bay4Shelf1C + L.t / 2, L.bay4Shelf2C - L.t / 2],
          [L.bay4Shelf2C + L.t / 2, L.bay4Shelf3C - L.t / 2],
          [L.bay4Shelf3C + L.t / 2, L.bay4ShortShelfC - L.t / 2],
        ].map(([bottom, top]) => ({
          start: [L.bay4L, bottom, door],
          end: [L.bay4L, top, door],
          offset: [-0.14, 0, 0.02],
          label: focusNum1(L.shelfH4Upper),
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        })),
      ],
      leaders: [
        {
          point: [L.bay4C, L.bay4Shelf3C, L.interiorZ + L.interiorD / 2],
          labelPoint: [L.bay4C + 0.32, L.bay4Shelf3C + 0.2, door + 0.08],
          label: '活动层板 / 支撑钉',
        },
      ],
      labels: [
        focusLabel('4 格：下 1 + 上 3', L.bay4C, L.H * 0.45, front + 0.05, 'part'),
      ],
      openParts: ['第 4 格左上门', '第 4 格左下门', '第 4 格右上门', '第 4 格右下门'],
      dir: [0.05, 0.12, 1],
      margin: 1.5,
      targetY: 0.85,
    },
    {
      id: 'bay5',
      part: '最右窄格 / 顶格门',
      title: '最右窄格 399.2 + 顶格门',
      value: `399.2 / 400 / 1946`,
      desc: `最右窄格宽 ${focusNum1(L.narrowW)}；顶部 400 格加 1 扇单门（右铰、拉手在左）；与第 4 格最下层板同高的层板前缩 150；下部通高挂衣约 ${focusNum(L.narrowHangH)}。`,
      boxes: [
        focusBox(L.bay5L, L.bay5R, 0, L.H, -L.D / 2, L.D / 2, false),
        focusBox(L.bay5L, L.bay5R, L.H - L.t - L.topRowH, L.H - L.t,
          -L.D / 2, L.D / 2, false),
      ],
      dims: [
        {
          start: [L.bay5L, L.H, front],
          end: [L.bay5R, L.H, front],
          offset: [0, 0.14, 0],
          label: focusNum1(L.narrowW),
          tick: 0.025,
        },
        {
          start: [L.bay5R, L.H - L.t - L.topRowH, door],
          end: [L.bay5R, L.H - L.t, door],
          offset: [0.14, 0, 0],
          label: `${focusNum(L.topRowH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay5R, L.t, door],
          end: [L.bay5R, L.H - L.topRowH - 2 * L.t, door],
          offset: [0.14, 0, 0],
          label: `${focusNum(L.narrowHangH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay5C, L.bay5ShelfC, L.interiorZ + L.interiorD / 2 - 0.15],
          end: [L.bay5C, L.bay5ShelfC, L.interiorZ + L.interiorD / 2],
          offset: [0, 0.1, 0],
          label: '前缩 150',
          tick: 0.02,
        },
      ],
      labels: [
        focusLabel('顶格门 1 扇 / 右铰', L.bay5C, L.H - L.t - L.topRowH + 0.15, front + 0.05, 'part'),
      ],
      openParts: ['最右顶格门'],
      dir: [0.35, 0.15, 1],
      margin: 1.5,
      targetY: 0.95,
    },
    {
      id: 'drawer-dividers',
      part: '抽屉隔板',
      title: '5 个抽屉：每抽 1 块抽屉隔板',
      value: '5 块 / 厚 12 / 深 450',
      desc: '第 2 格 2 个、第 3 格 3 个抽屉各放 1 块纵向抽屉隔板；隔板垂直立放、平行于抽拉方向，随抽屉一起拉出；无固定件，靠衣物夹紧。',
      boxes: [
        ...allDrawers.flatMap((drawer) => [
          focusBox(
            drawer.xCenter - drawer.width / 2, drawer.xCenter + drawer.width / 2,
            drawer.yBottom, drawer.yTop, drawerBack, drawerFront, false,
          ),
          focusBox(
            drawer.xCenter - drawer.width / 2, drawer.xCenter + drawer.width / 2,
            drawer.yBottom, drawer.yTop, drawerFront - 0.01, drawerFront + 0.01,
          ),
        ]),
        ...dividerBoxes,
      ],
      dims: [
        {
          start: [L.bay3L, allDrawers[4].yBottom, drawerFront],
          end: [L.bay3L, allDrawers[4].yTop, drawerFront],
          offset: [-0.14, 0, 0.02],
          label: `${focusNum(L.drawerH)}`,
          labelClass: 'focus-ratio-label',
          tick: 0.02,
        },
        {
          start: [L.bay3L, allDrawers[4].yTop, drawerFront],
          end: [L.bay3R, allDrawers[4].yTop, drawerFront],
          offset: [0, 0.1, 0],
          label: focusNum1(L.largeW),
          tick: 0.02,
        },
      ],
      leaders: [
        {
          point: [allDrawers[4].xCenter, allDrawers[4].yTop - 0.02, drawerFront - 0.1],
          labelPoint: [L.bay3C + 0.42, allDrawers[4].yTop + 0.18, drawerFront + 0.08],
          label: '每抽 1 块 / 厚 12 / 深 450',
        },
      ],
      labels: [
        focusLabel('第 2 格 2 抽 / 第 3 格 3 抽：各 1 块', drawerMid, allDrawers[4].yTop + 0.28, drawerFront + 0.06, 'part'),
      ],
      openParts: allDrawers.map((drawer) => drawer.label),
      dir: [0.15, 0.08, 1],
      margin: 1.4,
      targetY: 0.55,
    },
    {
      id: 'split-doors',
      part: '17 扇门',
      title: '17 扇门：4 组上下分 + 右上顶格单门',
      value: `17 扇 / 单扇 ${focusNum1(L.doorW)}`,
      desc: `4 个大格各 2 扇，左右门均在第一块层板（自上而下）处分上下：第 1 格 ${focusNum(L.leftShelf2C)}、第 2·3 格 ${focusNum(L.bay2TopShelfC)}、第 4 格 ${focusNum(L.bay4ShortShelfC)}，共 16 扇；最右窄格顶部 1 扇单门。第 2/3 格门底分别停在 ${focusNum(bay2DoorBottom)} / ${focusNum(bay3DoorBottom)}，抽屉外露。`,
      boxes: L.doorPanels.map((panel) => focusBox(
        panel.x1, panel.x2, panel.y1, panel.y2, L.doorZ - 0.008, L.doorZ + 0.008, false,
      )),
      dims: [
        {
          start: [L.bay1L + GAP, L.H * 0.55, door],
          end: [L.bay1L + GAP + L.doorW, L.H * 0.55, door],
          offset: [0, 0.12, 0],
          label: focusNum1(L.doorW),
          tick: 0.025,
        },
        {
          start: [L.bay2L, 0, door],
          end: [L.bay2L, bay2DoorBottom, door],
          offset: [-0.14, 0, 0.02],
          label: `门底 ${focusNum(bay2DoorBottom)}`,
          tick: 0.02,
        },
        {
          start: [L.bay3L, 0, door],
          end: [L.bay3L, bay3DoorBottom, door],
          offset: [-0.14, 0, 0.02],
          label: `门底 ${focusNum(bay3DoorBottom)}`,
          tick: 0.02,
        },
      ],
      labels: [
        focusLabel('4 组上下分 + 右上顶格单门', 0, L.H * 0.78, front + 0.05, 'part'),
      ],
      dir: [0.02, 0.12, 1],
      margin: 1.35,
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
    direction: new THREE.Vector3(0.02, 0.12, 1),
    margin: 1.42,
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
  } else {
    part.group.position.z = part.open * part.travel;
  }
}

function rebuild() {
  if (tour.active) abortTourForRebuild();
  normalizeState();
  const direction = viewer.camera.position.clone().sub(viewer.controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.02, 0.12, 1);
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
  if (tour.active) {
    showFocusStop(tour.index);
    return;
  }
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

document.getElementById('toggle-shelves').addEventListener('click', () => {
  state.shelfRemoved = !state.shelfRemoved;
  renderUI();
  applyVisibility();
});

document.getElementById('toggle-drawer-dividers').addEventListener('click', () => {
  state.drawerDividersOn = !state.drawerDividersOn;
  renderUI();
  applyVisibility();
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
