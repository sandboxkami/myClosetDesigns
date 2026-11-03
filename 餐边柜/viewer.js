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
  createDimensions,
  disposeGroup,
  fitCamera,
  damp,
} from '../assets/js/viewer-core.js';

const FIXED = Object.freeze({ lowerD: 400, lowerH: 1000 });

const DEFAULTS = {
  W: 2752,
  H: 2400,
  lowerD: FIXED.lowerD,
  upperD: 350,
  upperH: 750,
  narrowW: 352,
  petH: 400,
  t: 18,
  backT: 7,
  counterT: 20,
  endRadius: 50,
  shelfRemoved: false,
};

const GAP = 0.003;
const TOP_GAP = 0.03;
const LEFT_DRAWER_RATIO = [2, 3, 4];
const DRAWER_CABINET_RATIO = [2, 7];
// Right lower movable shelf: its top surface is fixed at 400 above the floor,
// just above the pet niche and below the utility box (bottom 400).
const RIGHT_SHELF_TOP = 400;

// Weak-current box on the wall behind the right lower cabinet.
// Dimensions are fixed by the site: 400 wide x 300 high x 100 deep,
// bottom 400 above floor, right edge 250 from the right wall corner.
const UTILITY = { w: 400, h: 300, d: 100, bottom: 400, rightOffset: 250, reveal: 5 };

const state = {
  ...DEFAULTS,
  showDims: true,
  showProps: true,
  showUtility: true,
  moduleW: 0,
  lowerH: 0,
  gapH: 0,
  drawerH: 0,
  leftDrawerHeights: [],
  upperDoorW: 0,
  pairDoorW: 0,
  lowerDoorH: 0,
  petDoorH: 0,
};

const SCENE = {
  doorT: 0.018,
  lowerDoorZ: 0.191,
  upperDoorZ: 0.141,
  lowerFront: 0.2,
  upperFront: 0.15,
  lowerD: 0.4,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const format = (value, digits = 0) => Number(value).toFixed(digits);

const stage = document.getElementById('canvas-container');
const loading = document.getElementById('loading');
const tooltip = document.getElementById('tooltip');

const viewer = createViewer(stage);
const materials = createMaterials();
createLights(viewer.scene);
const room = createRoom(viewer.scene, materials);

const cabinetGroup = new THREE.Group();
cabinetGroup.name = 'sideboard';
viewer.scene.add(cabinetGroup);

let interactiveParts = [];
let propsGroup = null;
let dimensionGroup = null;
let utilityGroup = null;
let utilityConflictGroup = null;
let movableShelfGroups = [];
let movableShelfProps = [];
let firstBuild = true;

const UTILITY_MAT = {
  body: new THREE.MeshStandardMaterial({
    color: 0xb8c2c6,
    roughness: 0.55,
    metalness: 0.18,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  face: new THREE.MeshStandardMaterial({
    color: 0xdfe3e5,
    roughness: 0.52,
    metalness: 0.08,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  handle: new THREE.MeshStandardMaterial({ color: 0x768186, roughness: 0.4, metalness: 0.5 }),
  edge: new THREE.LineBasicMaterial({ color: 0x4f5a5f }),
  conflict: new THREE.MeshStandardMaterial({
    color: 0xd94a3d,
    roughness: 0.6,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
};

function normalizeState() {
  state.W = clamp(state.W, 2300, 3200);
  state.H = clamp(state.H, 2200, 2600);
  state.lowerD = FIXED.lowerD;
  state.t = clamp(Math.round(state.t), 16, 25);
  state.backT = clamp(Math.round(state.backT), 5, 12);
  state.counterT = clamp(Math.round(state.counterT), 15, 30);
  state.endRadius = clamp(Math.round(state.endRadius / 5) * 5, 20, 80);
  state.upperD = clamp(state.upperD, 300, 400);
  state.upperD = Math.min(state.upperD, state.lowerD - state.t);
  state.upperH = clamp(state.upperH, 600, 900);
  state.narrowW = clamp(state.narrowW, 250, 450);
  state.petH = clamp(state.petH, 300, RIGHT_SHELF_TOP);

  // Counter top is fixed at 1000 above the floor; the open gap absorbs the
  // remaining height after the fixed lower cabinet and the adjustable upper.
  state.lowerH = FIXED.lowerH;
  state.gapH = state.H - TOP_GAP * 1000 - state.lowerH - state.upperH;
  if (state.gapH < 400) {
    state.upperH = Math.max(600, state.H - TOP_GAP * 1000 - state.lowerH - 400);
    state.gapH = state.H - TOP_GAP * 1000 - state.lowerH - state.upperH;
  }

  state.moduleW = (state.W - state.narrowW) / 3;

  // Lower body: 9 equal parts. Left = 2:3:4; middle/right = top drawer 2,
  // cabinet 7, so the top drawer bottom aligns across all three modules.
  const lowerBodyH = state.lowerH - state.counterT;
  const part = lowerBodyH / 9;
  state.drawerH = DRAWER_CABINET_RATIO[0] * part;
  state.lowerDoorH = DRAWER_CABINET_RATIO[1] * part;
  state.leftDrawerHeights = LEFT_DRAWER_RATIO.map((ratio) => ratio * part);
  state.petH = Math.min(state.petH, Math.max(300, Math.floor((state.lowerDoorH - 300) / 10) * 10), RIGHT_SHELF_TOP);
  state.upperDoorW = state.moduleW - 6;
  state.pairDoorW = state.moduleW / 2 - 6;
  state.petDoorH = state.lowerDoorH - state.petH;
}

function getUtilityInfo() {
  const W = state.W / 1000;
  const lowerD = state.lowerD / 1000;
  const t = state.t / 1000;
  const backT = state.backT / 1000;
  const endRadius = state.endRadius / 1000;
  const moduleW = state.moduleW / 1000;
  const right = W / 2;
  const boxRight = right - UTILITY.rightOffset / 1000;
  const boxLeft = boxRight - UTILITY.w / 1000;
  const boxBottom = UTILITY.bottom / 1000;
  const boxTop = boxBottom + UTILITY.h / 1000;
  const wallZ = -lowerD / 2 - 0.02;
  const frontZ = wallZ + UTILITY.d / 1000;

  // The only right-module shelf in the box's height range.
  const shelfTop = RIGHT_SHELF_TOP / 1000;
  const shelfY = shelfTop - t / 2;
  const shelfBack = -lowerD / 2 + backT;
  const shelfFront = lowerD / 2 - t;
  const rightModuleLeft = right - moduleW;
  const rightInnerX = right - endRadius;

  const overlapX = Math.min(boxRight, rightInnerX) - Math.max(boxLeft, rightModuleLeft);
  const overlapY = Math.min(boxTop, shelfY + t / 2) - Math.max(boxBottom, shelfY - t / 2);
  const overlapZ = Math.min(frontZ, shelfFront) - Math.max(wallZ, shelfBack);

  return {
    xCenter: (boxLeft + boxRight) / 2,
    xLeft: boxLeft,
    xRight: boxRight,
    yCenter: (boxBottom + boxTop) / 2,
    yBottom: boxBottom,
    yTop: boxTop,
    wallZ,
    frontZ,
    shelfY,
    shelfTop,
    overlapX: Math.max(0, overlapX),
    overlapY: Math.max(0, overlapY),
    overlapZ: Math.max(0, overlapZ),
    interference: overlapX > 0.001 && overlapY > 0.001 && overlapZ > 0.001,
    fitsModule: boxLeft - UTILITY.reveal / 1000 >= rightModuleLeft + t / 2 && boxRight <= rightInnerX,
  };
}

function syncInputs() {
  document.querySelectorAll('[data-range], [data-number]').forEach((input) => {
    const key = input.dataset.range || input.dataset.number;
    if (key in state) input.value = state[key];
  });
}

function updateReadouts() {
  document.getElementById('size-readout').textContent = `${Math.round(state.W)} × ${Math.round(state.H)} × ${Math.round(state.lowerD)} mm`;
  document.getElementById('module-width').textContent = `${format(state.moduleW, 1)} mm`;
  document.getElementById('lower-height').textContent = `${format(state.lowerH, 0)} mm`;
  document.getElementById('gap-height').textContent = `${format(state.gapH, 0)} mm`;
  document.getElementById('cabinet-depths').textContent = `${format(state.lowerD, 0)} / ${format(state.upperD, 0)} mm`;
  document.getElementById('upper-door-width').textContent = `${format(state.upperDoorW, 1)} / ${format(state.pairDoorW, 1)} mm`;
  document.getElementById('lower-door-height').textContent = `${format(state.lowerDoorH, 0)} / ${format(state.petDoorH, 0)} mm`;
  document.getElementById('pet-height').textContent = `${format(state.petH, 0)} mm`;
  document.getElementById('narrow-width').textContent = `${format(state.narrowW, 0)} mm`;
  document.getElementById('utility-box').textContent = '400 × 300 × 100 mm';
  document.getElementById('utility-pos').textContent = '底 400 / 右距角 250';
  document.getElementById('movable-shelf').textContent = state.shelfRemoved
    ? '已取下（支撑钉可见）'
    : `已装（板面 y≈${format(RIGHT_SHELF_TOP, 0)}）`;

  const utility = getUtilityInfo();
  const utilityWarning = document.getElementById('utility-warning');
  const utilityMessages = [];
  if (!state.shelfRemoved && utility.interference) {
    utilityMessages.push(
      `弱电箱与右地柜层板（y≈${format(utility.shelfY * 1000, 0)}）重叠 ${format(utility.overlapY * 1000, 0)} mm；需下移/取消层板，或改箱位`,
    );
  }
  if (!utility.fitsModule) {
    utilityMessages.push('弱电箱超出右主格范围，需调整柜宽或箱位');
  }
  utilityWarning.hidden = utilityMessages.length === 0;
  utilityWarning.textContent = utilityMessages.length ? `${utilityMessages.join('；')}。` : '';

  document.getElementById('left-drawer-heights').textContent =
    `${state.leftDrawerHeights.map((value) => format(value, 1)).join(' / ')} mm`;
  document.getElementById('mid-drawer-cabinet').textContent =
    `${format(state.drawerH, 1)} / ${format(state.lowerDoorH, 1)} mm`;
  document.getElementById('narrow-layer-heights').textContent =
    `${format(state.upperH / 2, 0)} / ${format(state.upperH / 2, 0)} / ${format(state.gapH, 0)} / ${format(state.lowerH / 2, 0)} / ${format(state.lowerH / 2, 0)} mm`;

  // Decision-board values (block 2: unfixed key dimensions)
  document.getElementById('decision-W').textContent = `${format(state.W, 0)} mm`;
  document.getElementById('decision-H').textContent = `${format(state.H, 0)} mm`;
  document.getElementById('decision-upperH').textContent = `${format(state.upperH, 0)} mm`;
  document.getElementById('decision-gapH').textContent = `${format(state.gapH, 0)} mm`;
  document.getElementById('decision-upperD').textContent = `${format(state.upperD, 0)} mm`;
  document.getElementById('decision-narrowW').textContent = `${format(state.narrowW, 1)} mm`;
  document.getElementById('decision-moduleW').textContent = `${format(state.moduleW, 1)} mm`;
  document.getElementById('decision-petH').textContent = `${format(state.petH, 0)} mm`;
  document.getElementById('decision-t').textContent = `${format(state.t, 0)} mm`;
  document.getElementById('decision-backT').textContent = `${format(state.backT, 0)} mm`;
  document.getElementById('decision-counterT').textContent = `${format(state.counterT, 0)} mm`;
  document.getElementById('decision-endRadius').textContent = `R${format(state.endRadius, 0)}`;
  document.getElementById('end-radius').textContent =
    `R${format(state.endRadius, 0)}（最右门 / 抽屉 / 上翻门内缩 ${format(state.endRadius, 0)}）`;

  const warnings = [];
  if (state.moduleW < 650) warnings.push(`主格宽 ${format(state.moduleW, 0)} mm < 650`);
  if (state.petDoorH < 300) warnings.push(`右侧猫用品格上门高 ${format(state.petDoorH, 0)} mm < 300`);
  if (state.upperH < 600) warnings.push(`上柜高 ${format(state.upperH, 0)} mm < 600`);
  if (state.gapH < 400) warnings.push(`开放高 ${format(state.gapH, 0)} mm < 400`);
  if (state.leftDrawerHeights[2] < 150) warnings.push(`左地柜最下抽屉高 ${format(state.leftDrawerHeights[2], 0)} mm < 150`);

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

function addDoor({ xLeft, xRight, yBottom, yTop, hinge, label, knobY, z = SCENE.lowerDoorZ }) {
  const doorW = xRight - xLeft;
  const doorH = yTop - yBottom;
  const group = new THREE.Group();
  const hingeX = hinge === 'left' ? xLeft : xRight;
  group.position.set(hingeX, 0, z);

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

function addLiftDoor({ xCenter, width, height, top, label }) {
  const group = new THREE.Group();
  group.position.set(xCenter, top, SCENE.upperDoorZ);

  const panel = new THREE.Group();
  const frame = 0.04;
  const doorBottom = -height;
  const doorTop = 0;
  panel.add(
    box(width, frame, SCENE.doorT, materials.whiteDoor, { y: doorTop - frame / 2, z: 0 }),
    box(width, frame, SCENE.doorT, materials.whiteDoor, { y: doorBottom + frame / 2, z: 0 }),
    box(frame, height - 2 * frame, SCENE.doorT, materials.whiteDoor, { x: -width / 2 + frame / 2, y: -height / 2, z: 0 }),
    box(frame, height - 2 * frame, SCENE.doorT, materials.whiteDoor, { x: width / 2 - frame / 2, y: -height / 2, z: 0 }),
    box(width - 2 * frame, height - 2 * frame, 0.006, materials.glass, { y: -height / 2, z: 0 }),
  );
  const knob = createKnob();
  knob.position.set(0, doorBottom + 0.06, SCENE.doorT / 2);
  panel.add(knob);
  group.add(panel);

  const part = {
    type: 'liftDoor',
    group,
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
    z: SCENE.lowerDoorZ,
  });
  group.add(front);

  const knob = createKnob();
  knob.position.set(0, centerY, SCENE.lowerDoorZ + SCENE.doorT / 2);
  group.add(knob);

  const boxW = width - 0.03;
  const boxH = height - 0.02;
  const boxD = Math.min(SCENE.lowerD - SCENE.doorT - 0.06, 0.42);
  const boxFrontZ = SCENE.lowerDoorZ - SCENE.doorT / 2;
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
    travel: Math.min(0.34, boxD * 0.8),
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

function createBottle(height = 0.24, colorIndex = 0) {
  const group = new THREE.Group();
  const color = materials.clothesColors[colorIndex % materials.clothesColors.length];
  const body = cylinder(0.032, height, color, { y: height / 2 });
  const neck = cylinder(0.013, 0.05, color, { y: height + 0.025 });
  const cap = cylinder(0.015, 0.015, materials.woodDark, { y: height + 0.057 });
  group.add(body, neck, cap);
  return group;
}

function createCup(height = 0.08) {
  const group = new THREE.Group();
  const cup = cylinder(0.035, height, materials.whiteEdge, { y: height / 2 });
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI),
    materials.whiteEdge,
  );
  handle.position.set(0.04, height / 2, 0);
  handle.rotation.z = -Math.PI / 2;
  group.add(cup, handle);
  return group;
}

function createPlateStack(count = 4) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const plate = cylinder(0.085 - i * 0.003, 0.012, materials.whiteEdge, {
      y: i * 0.014 + 0.006,
    });
    group.add(plate);
  }
  return group;
}

function createTissueBox() {
  const group = new THREE.Group();
  const body = box(0.22, 0.09, 0.12, materials.whiteEdge, { y: 0.045 });
  const slot = box(0.12, 0.006, 0.02, materials.woodDark, { y: 0.091, z: 0 });
  group.add(body, slot);
  return group;
}

function createJar(height = 0.13) {
  const group = new THREE.Group();
  const body = cylinder(0.045, height, materials.glass, { y: height / 2 });
  const lid = cylinder(0.05, 0.02, materials.woodDark, { y: height + 0.01 });
  group.add(body, lid);
  return group;
}

function createPetBowl() {
  const group = new THREE.Group();
  const bowlA = cylinder(0.065, 0.04, materials.metal, { x: -0.08, y: 0.02 });
  const bowlB = cylinder(0.065, 0.04, materials.metal, { x: 0.08, y: 0.02 });
  const mat = box(0.28, 0.012, 0.18, materials.woodDark, { y: 0.006 });
  group.add(mat, bowlA, bowlB);
  return group;
}

function createKettle() {
  const group = new THREE.Group();
  const body = cylinder(0.075, 0.13, materials.whiteEdge, { y: 0.065 });
  const lid = cylinder(0.045, 0.025, materials.woodDark, { y: 0.142 });
  const spout = cylinder(0.015, 0.11, materials.metal, { y: 0.1 });
  spout.rotation.z = -0.7;
  spout.position.set(0.1, 0.09, 0);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.009, 6, 14, Math.PI),
    materials.woodDark,
  );
  handle.position.set(-0.08, 0.12, 0);
  handle.rotation.z = Math.PI / 2;
  group.add(body, lid, spout, handle);
  return group;
}

function createRoundedPanel({ xLeft, xRight, zBack, zFront, yBottom, yTop, radius, material }) {
  // Plan-view shape in (x, z); extrude vertically, then rotate so local z becomes world y.
  const shape = new THREE.Shape();
  shape.moveTo(xLeft, zBack);
  shape.lineTo(xRight, zBack);
  shape.lineTo(xRight, zFront - radius);
  shape.absarc(xRight - radius, zFront - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(xLeft, zFront);
  shape.lineTo(xLeft, zBack);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: yTop - yBottom,
    bevelEnabled: false,
    curveSegments: 32,
  });
  geometry.rotateX(Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = yTop;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Back panel with a rectangular opening for the wall-mounted utility box.
// The shape is built in XY and extruded through the 7 mm back panel.
function backPanelWithRectHole(width, height, thickness, holeX, holeY, holeW, holeH, material, z, x = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(holeX - holeW / 2, holeY - holeH / 2);
  hole.lineTo(holeX - holeW / 2, holeY + holeH / 2);
  hole.lineTo(holeX + holeW / 2, holeY + holeH / 2);
  hole.lineTo(holeX + holeW / 2, holeY - holeH / 2);
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, 0, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function buildCabinet() {
  interactiveParts = [];
  movableShelfGroups = [];
  movableShelfProps = [];
  utilityConflictGroup = null;

  const W = state.W / 1000;
  const H = state.H / 1000;
  const lowerD = state.lowerD / 1000;
  const upperD = state.upperD / 1000;
  const upperH = state.upperH / 1000;
  const gapH = state.gapH / 1000;
  const narrowW = state.narrowW / 1000;
  const drawerH = state.drawerH / 1000;
  const petH = state.petH / 1000;
  const t = state.t / 1000;
  const backT = state.backT / 1000;
  const counterT = state.counterT / 1000;
  const endRadius = state.endRadius / 1000;
  const moduleW = state.moduleW / 1000;
  const lowerH = state.lowerH / 1000;
  const lowerDoorH = state.lowerDoorH / 1000;

  const doorT = t;
  const lowerFront = lowerD / 2;
  const lowerBodyFront = lowerFront - doorT;
  const lowerBodyDepth = lowerD - doorT;
  const lowerBodyCenterZ = -doorT / 2;
  const lowerInteriorD = lowerD - doorT - backT;
  const lowerInteriorZ = (-lowerD / 2 + backT + lowerBodyFront) / 2;

  const upperFront = -lowerD / 2 + upperD;
  const upperBodyFront = upperFront - doorT;
  const upperBodyDepth = upperD - doorT;
  const upperBodyCenterZ = (-lowerD / 2 + upperBodyFront) / 2;
  const upperInteriorD = upperD - doorT - backT;
  const upperInteriorZ = (-lowerD / 2 + backT + upperBodyFront) / 2;
  const upperDoorZ = upperFront - doorT / 2;
  const lowerDoorZ = lowerFront - doorT / 2;

  const lowerBodyTop = lowerH - counterT;
  const upperBottom = lowerH + gapH;
  const upperTop = H - TOP_GAP;
  const drawerTop = lowerBodyTop;
  const drawerBottom = drawerTop - drawerH;

  const x0 = -W / 2;
  const x1 = x0 + narrowW;
  const x2 = x1 + moduleW;
  const x3 = x2 + moduleW;
  const x4 = W / 2;
  const cN = (x0 + x1) / 2;
  const c1 = (x1 + x2) / 2;
  const c2 = (x2 + x3) / 2;
  const c3 = (x3 + x4) / 2;
  const rightInnerX = x4 - endRadius;
  const utility = getUtilityInfo();

  SCENE.doorT = doorT;
  SCENE.lowerDoorZ = lowerDoorZ;
  SCENE.upperDoorZ = upperDoorZ;
  SCENE.lowerFront = lowerFront;
  SCENE.upperFront = upperFront;
  SCENE.lowerD = lowerD;

  // Main lower carcass (x1..x4); narrow tall column on the left (x0..x1).
  // The right end is handled by the rounded end panel above; the middle open bay has no right side.
  cabinetGroup.add(
    box(t, upperTop, lowerBodyDepth, materials.whiteCarcass, { x: x1 + t / 2, y: upperTop / 2, z: lowerBodyCenterZ }),
    backPanelWithRectHole(
      rightInnerX - x1,
      lowerBodyTop,
      backT,
      utility.xCenter - (x1 + rightInnerX) / 2,
      utility.yCenter,
      UTILITY.w / 1000 + (UTILITY.reveal * 2) / 1000,
      UTILITY.h / 1000 + (UTILITY.reveal * 2) / 1000,
      materials.wood,
      -lowerD / 2,
      (x1 + rightInnerX) / 2,
    ),
    box(rightInnerX - x1, t, lowerBodyDepth, materials.whiteCarcass, { x: (x1 + rightInnerX) / 2, y: lowerBodyTop - t / 2, z: lowerBodyCenterZ }),
  );

  // Wall-mounted weak-current box, shown as a translucent inspection volume so
  // the shelf that passes through it remains visible.  A red volume marks the
  // exact overlap with the right lower shelf.
  utilityGroup = new THREE.Group();
  utilityGroup.name = 'utility-box';
  cabinetGroup.add(utilityGroup);

  const utilityCenterZ = (utility.wallZ + utility.frontZ) / 2;
  utilityGroup.add(
    box(UTILITY.w / 1000, UTILITY.h / 1000, UTILITY.d / 1000, UTILITY_MAT.body, {
      x: utility.xCenter,
      y: utility.yCenter,
      z: utilityCenterZ,
      cast: false,
      receive: false,
    }),
  );
  const utilityEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(UTILITY.w / 1000, UTILITY.h / 1000, UTILITY.d / 1000)),
    UTILITY_MAT.edge,
  );
  utilityEdges.position.set(utility.xCenter, utility.yCenter, utilityCenterZ);
  utilityGroup.add(utilityEdges);

  utilityGroup.add(
    box(UTILITY.w / 1000, UTILITY.h / 1000, 0.012, UTILITY_MAT.face, {
      x: utility.xCenter,
      y: utility.yCenter,
      z: utility.frontZ + 0.006,
      cast: false,
      receive: false,
    }),
    box(0.06, 0.012, 0.008, UTILITY_MAT.handle, {
      x: utility.xRight - 0.05,
      y: utility.yCenter,
      z: utility.frontZ + 0.016,
      cast: false,
      receive: false,
    }),
  );

  if (utility.interference) {
    utilityConflictGroup = new THREE.Group();
    utilityConflictGroup.name = 'utility-conflict';
    utilityGroup.add(utilityConflictGroup);
    utilityConflictGroup.add(
      box(utility.overlapX, utility.overlapY, utility.overlapZ, UTILITY_MAT.conflict, {
        x: utility.xCenter,
        y: utility.shelfY,
        z: (Math.max(utility.wallZ, -lowerD / 2 + backT) + Math.min(utility.frontZ, lowerD / 2 - t)) / 2,
        cast: false,
        receive: false,
      }),
    );

    // A thin red band on the shelf front edge.  The closed right lower door
    // hides it; opening the door reveals the exact 400 mm overlap.
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(utility.overlapX, utility.overlapY + 0.012),
      new THREE.MeshBasicMaterial({
        color: 0xd94a3d,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    marker.position.set(utility.xCenter, utility.shelfY, lowerD / 2 - t + 0.001);
    utilityConflictGroup.add(marker);
  }

  [x2, x3].forEach((x) => {
    cabinetGroup.add(
      box(t, lowerBodyTop, lowerBodyDepth, materials.wood, { x, y: lowerBodyTop / 2, z: lowerBodyCenterZ }),
    );
  });

  // Bottom panels for all three lower bays. The right bay keeps its pet niche
  // doors/opening unchanged, but the bowls now sit on a raised bottom panel.
  cabinetGroup.add(
    box(x2 - x1, t, lowerBodyDepth, materials.whiteCarcass, { x: (x1 + x2) / 2, y: t / 2, z: lowerBodyCenterZ }),
    box(x3 - x2, t, lowerBodyDepth, materials.whiteCarcass, { x: (x2 + x3) / 2, y: t / 2, z: lowerBodyCenterZ }),
    box(rightInnerX - x3, t, lowerBodyDepth, materials.whiteCarcass, { x: (x3 + rightInnerX) / 2, y: t / 2, z: lowerBodyCenterZ }),
  );

  // Upper main carcass (x1..x4); left side is the continuous side panel, right side is the rounded end.
  cabinetGroup.add(
    box(rightInnerX - x1, t, upperBodyDepth, materials.whiteCarcass, { x: (x1 + rightInnerX) / 2, y: upperTop - t / 2, z: upperBodyCenterZ }),
    box(rightInnerX - x1, t, upperBodyDepth, materials.whiteCarcass, { x: (x1 + rightInnerX) / 2, y: upperBottom + t / 2, z: upperBodyCenterZ }),
    box(rightInnerX - x1, upperH, backT, materials.wood, {
      x: (x1 + rightInnerX) / 2,
      y: (upperBottom + upperTop) / 2,
      z: -lowerD / 2 + backT / 2,
      cast: false,
    }),
  );

  [x2, x3].forEach((x) => {
    cabinetGroup.add(
      box(t, upperH, upperBodyDepth, materials.wood, { x, y: (upperBottom + upperTop) / 2, z: upperBodyCenterZ }),
    );
  });

  // Rounded right end: 50 mm solid end panels above and below the open niche.
  // The door/drawer fronts stop 50 mm short; the outer envelope stays unchanged.
  cabinetGroup.add(
    createRoundedPanel({
      xLeft: rightInnerX,
      xRight: x4,
      zBack: -lowerD / 2,
      zFront: lowerFront,
      yBottom: 0,
      yTop: lowerBodyTop,
      radius: endRadius,
      material: materials.whiteCarcass,
    }),
    createRoundedPanel({
      xLeft: rightInnerX,
      xRight: x4,
      zBack: -lowerD / 2,
      zFront: upperFront,
      yBottom: upperBottom,
      yTop: upperTop,
      radius: endRadius,
      material: materials.whiteCarcass,
    }),
  );

  // Upper shelf at 1/3 (bottom glass layer top); the pair-door area gets one shelf per module.
  cabinetGroup.add(
    box(rightInnerX - x1, t, upperInteriorD, materials.wood, {
      x: (x1 + rightInnerX) / 2,
      y: upperBottom + upperH / 3,
      z: upperInteriorZ,
    }),
  );
  const upperMiddleShelfY = upperBottom + (upperH * 5) / 9;
  const upperPairShelfY = upperBottom + (upperH * 2) / 3;
  [
    { center: c1, left: x1, right: x2, y: upperPairShelfY },
    { center: c2, left: x2, right: x3, y: upperMiddleShelfY },
    { center: c3, left: x3, right: rightInnerX, y: upperPairShelfY },
  ].forEach(({ left, right, y }) => {
    cabinetGroup.add(
      box(right - left, t, upperInteriorD, materials.wood, {
        x: (left + right) / 2,
        y,
        z: upperInteriorZ,
      }),
    );
  });

  // Left tall closed column (x0..x1): 5 layers, 3 doors.
  // The top line matches the main upper cabinet; the 30 mm gap is above the whole cabinet.
  cabinetGroup.add(
    box(t, upperTop, lowerBodyDepth, materials.whiteCarcass, { x: x0 + t / 2, y: upperTop / 2, z: lowerBodyCenterZ }),
    box(t, upperTop, lowerBodyDepth, materials.whiteCarcass, { x: x1 - t / 2, y: upperTop / 2, z: lowerBodyCenterZ }),
    box(narrowW, t, lowerBodyDepth, materials.whiteCarcass, { x: cN, y: upperTop - t / 2, z: lowerBodyCenterZ }),
    box(narrowW, t, lowerBodyDepth, materials.whiteCarcass, { x: cN, y: t / 2, z: lowerBodyCenterZ }),
    box(narrowW, upperTop, backT, materials.wood, {
      x: cN,
      y: upperTop / 2,
      z: -lowerD / 2 + backT / 2,
      cast: false,
    }),
  );
  // Shelves align with the main cabinet zones: lower split, counter, upper bottom, upper split.
  const narrowShelfY = [lowerH / 2, lowerH, upperBottom, (upperBottom + upperTop) / 2];
  narrowShelfY.forEach((y) => {
    cabinetGroup.add(
      box(narrowW, t, lowerInteriorD, materials.wood, { x: cN, y, z: lowerInteriorZ }),
    );
  });
  // 2 doors: the middle layer and the upper two layers share one tall door;
  // the lower two layers keep the bottom door. Both hinge left, handles right.
  addDoor({
    xLeft: x0 + GAP,
    xRight: x1 - GAP,
    yBottom: lowerH + GAP,
    yTop: upperTop - GAP,
    hinge: 'left',
    label: '窄柜门 1（中间层 + 上两层）',
    knobY: lowerH + 0.12,
  });
  addDoor({
    xLeft: x0 + GAP,
    xRight: x1 - GAP,
    yBottom: GAP,
    yTop: lowerH - GAP,
    hinge: 'left',
    label: '窄柜门 2（下两层）',
    knobY: lowerH / 2,
  });

  // Counter over the 3 main modules (x1..x4); its right front corner follows the end radius.
  cabinetGroup.add(
    createRoundedPanel({
      xLeft: x1,
      xRight: x4,
      zBack: -lowerD / 2,
      zFront: lowerFront,
      yBottom: lowerH - counterT,
      yTop: lowerH,
      radius: endRadius,
      material: materials.whiteEdge,
    }),
  );

  // Lower interior shelves: middle gets one at half of its 7-part cavity;
  // the right shelf sits above the pet niche.
  const middleShelfY = lowerDoorH / 2;
  const rightLowerShelfTop = RIGHT_SHELF_TOP / 1000;
  const rightLowerShelfY = rightLowerShelfTop - t / 2;

  cabinetGroup.add(
    box(x3 - x2, t, lowerInteriorD, materials.wood, { x: c2, y: middleShelfY, z: lowerInteriorZ }),
  );

  // The right lower shelf is movable: it is the shelf that conflicts with the
  // utility box.  Support pins stay visible when the shelf is taken out.
  const rightLowerShelf = new THREE.Group();
  rightLowerShelf.name = 'right-lower-removable-shelf';
  rightLowerShelf.add(
    box(rightInnerX - x3, t, lowerInteriorD, materials.wood, {
      x: (x3 + rightInnerX) / 2,
      y: rightLowerShelfY,
      z: lowerInteriorZ,
    }),
  );
  movableShelfGroups.push(rightLowerShelf);
  cabinetGroup.add(rightLowerShelf);
  addShelfPins({
    leftX: x3,
    rightX: rightInnerX,
    shelfCenterY: rightLowerShelfY,
    zCenter: lowerInteriorZ,
    zSpan: lowerInteriorD - 0.14,
    t,
  });

  // Upper doors: bottom layer = 3 glass lift-up doors; top two layers = 3 pairs of side-opening white doors.
  const upperLayerH = upperH / 3;
  [c1, c2, c3].forEach((center, index) => {
    const moduleLeft = x1 + index * moduleW;
    const isRightEnd = index === 2;
    const moduleRight = isRightEnd ? rightInnerX : moduleLeft + moduleW;
    const pairCenter = isRightEnd ? (moduleLeft + moduleRight) / 2 : center;

    addLiftDoor({
      xCenter: isRightEnd ? pairCenter : center,
      width: (isRightEnd ? rightInnerX - moduleLeft : moduleW) - 6 * 0.001,
      height: upperLayerH - 6 * 0.001,
      top: upperBottom + upperLayerH - 3 * 0.001,
      label: `上柜下层玻璃上翻门 ${index + 1}`,
    });

    const pairBottom = upperBottom + upperLayerH + GAP;
    const pairTop = upperTop - GAP;
    addDoor({
      xLeft: moduleLeft + GAP,
      xRight: pairCenter - GAP / 2,
      yBottom: pairBottom,
      yTop: pairTop,
      hinge: 'left',
      label: `上柜对开门 ${index + 1} 左`,
      knobY: (pairBottom + pairTop) / 2,
      z: SCENE.upperDoorZ,
    });
    addDoor({
      xLeft: pairCenter + GAP / 2,
      xRight: moduleRight - GAP,
      yBottom: pairBottom,
      yTop: pairTop,
      hinge: 'right',
      label: `上柜对开门 ${index + 1} 右`,
      knobY: (pairBottom + pairTop) / 2,
      z: SCENE.upperDoorZ,
    });
  });

  // Lower doors: middle/right modules are left-right pairs; left module is 4 drawers.
  [
    { left: x2, right: x3, name: '中', yBottom: GAP },
    { left: x3, right: rightInnerX, name: '右', yBottom: petH + GAP },
  ].forEach(({ left, right, name, yBottom }) => {
    const center = (left + right) / 2;
    const yTop = drawerBottom - GAP;
    const knobY = (yBottom + yTop) / 2;
    addDoor({
      xLeft: left + GAP,
      xRight: center - GAP / 2,
      yBottom,
      yTop,
      hinge: 'left',
      label: `${name}地柜门 左`,
      knobY,
    });
    addDoor({
      xLeft: center + GAP / 2,
      xRight: right - GAP,
      yBottom,
      yTop,
      hinge: 'right',
      label: `${name}地柜门 右`,
      knobY,
    });
  });

  // Drawers: middle/right have the 160 top drawer; left base is four stacked drawers.
  [c2, c3].forEach((center, index) => {
    const isRightEnd = index === 1;
    addDrawer({
      xCenter: isRightEnd ? (x3 + rightInnerX) / 2 : center,
      width: (isRightEnd ? rightInnerX - x3 : moduleW) - 6 * 0.001,
      yBottom: drawerBottom + GAP,
      yTop: drawerTop - GAP,
      label: `${isRightEnd ? '右' : '中'}地柜抽屉`,
    });
  });

  let leftCursor = drawerTop;
  const leftDrawerSpecs = state.leftDrawerHeights.map((heightMm, index) => {
    const height = heightMm / 1000;
    const spec = {
      yTop: leftCursor,
      yBottom: leftCursor - height,
      label: `左地柜抽屉 ${index + 1}（${LEFT_DRAWER_RATIO[index]} 份）`,
    };
    leftCursor -= height;
    return spec;
  });
  leftDrawerSpecs.forEach(({ yTop, yBottom, label }) => {
    addDrawer({
      xCenter: c1,
      width: moduleW - 6 * 0.001,
      yBottom: yBottom + GAP,
      yTop: yTop - GAP,
      label,
    });
  });

  // Pet niche right bottom: no bottom panel, bowl on the floor.
  // Props
  propsGroup = new THREE.Group();
  propsGroup.name = 'props';
  cabinetGroup.add(propsGroup);

  const upperShelf1 = upperBottom + upperH / 3;
  const upperShelf2 = upperBottom + (upperH * 2) / 3;
  const upperMiddleShelf = upperBottom + (upperH * 5) / 9;

  // Upper left: tea / wine / cups
  [-0.22, -0.05, 0.12].forEach((offset, index) => {
    const bottle = createBottle(0.2 + index * 0.02, index + 1);
    bottle.position.set(c1 + offset, upperBottom + 0.004, upperInteriorZ - 0.02);
    propsGroup.add(bottle);
  });
  const cupsLeft = createCup();
  cupsLeft.position.set(c1 + 0.24, upperBottom + 0.004, upperInteriorZ);
  propsGroup.add(cupsLeft);
  const cupsLeft2 = createCup(0.07);
  cupsLeft2.position.set(c1 + 0.12, upperShelf1 + 0.004, upperInteriorZ);
  propsGroup.add(cupsLeft2);
  const bottleLeft2 = createBottle(0.18, 3);
  bottleLeft2.position.set(c1 - 0.18, upperShelf1 + 0.004, upperInteriorZ);
  propsGroup.add(bottleLeft2);

  // Upper middle: plates and bowls
  const plates1 = createPlateStack(5);
  plates1.position.set(c2 - 0.15, upperBottom + 0.004, upperInteriorZ);
  const plates2 = createPlateStack(4);
  plates2.position.set(c2 + 0.18, upperBottom + 0.004, upperInteriorZ);
  const plates3 = createPlateStack(3);
  plates3.position.set(c2 - 0.05, upperShelf1 + 0.004, upperInteriorZ);
  propsGroup.add(plates1, plates2, plates3);
  const cupsMid = createCup();
  cupsMid.position.set(c2 + 0.25, upperMiddleShelf + 0.004, upperInteriorZ);
  propsGroup.add(cupsMid);

  // Upper right: tissue / cleaning
  const tissue1 = createTissueBox();
  tissue1.position.set(c3 - 0.18, upperBottom + 0.004, upperInteriorZ);
  const tissue2 = createTissueBox();
  tissue2.position.set(c3 + 0.18, upperShelf1 + 0.004, upperInteriorZ);
  const cleaner1 = createBottle(0.22, 1);
  cleaner1.position.set(c3 + 0.12, upperBottom + 0.004, upperInteriorZ);
  const cleaner2 = createBottle(0.17, 2);
  cleaner2.position.set(c3 - 0.02, upperShelf2 + 0.004, upperInteriorZ);
  propsGroup.add(tissue1, tissue2, cleaner1, cleaner2);

  // Left tall closed column: one set of props per layer, sitting on the shelf tops.
  const tallShelfBases = [
    t + 0.004,
    lowerH / 2 + t / 2 + 0.004,
    lowerH + t / 2 + 0.004,
    upperBottom + t / 2 + 0.004,
    (upperBottom + upperTop) / 2 + t / 2 + 0.004,
  ];
  tallShelfBases.forEach((base, index) => {
    if (index % 2 === 0) {
      const jar = createJar(0.12 + (index % 3) * 0.02);
      jar.position.set(cN - 0.06, base, lowerInteriorZ);
      propsGroup.add(jar);
      const cup = createCup(0.07);
      cup.position.set(cN + 0.08, base, lowerInteriorZ);
      propsGroup.add(cup);
    } else {
      const tissue = createTissueBox();
      tissue.position.set(cN, base, lowerInteriorZ);
      propsGroup.add(tissue);
      const basket = createBasket(Math.min(0.24, narrowW - 0.08), 0.18, 0.26, materials);
      basket.position.set(cN, base, lowerInteriorZ);
      propsGroup.add(basket);
    }
  });

  // Pet bowls in the open right niche, standing on the restored bottom panel.
  const petBowl = createPetBowl();
  petBowl.position.set(c3, t + 0.004, lowerInteriorZ + 0.05);
  propsGroup.add(petBowl);

  // Counter props: kettle and cups
  const kettle = createKettle();
  kettle.position.set(c1 + 0.1, lowerH + 0.004, 0.02);
  propsGroup.add(kettle);
  [-0.28, -0.16].forEach((offset, index) => {
    const cup = createCup();
    cup.position.set(c1 + offset, lowerH + 0.004, 0.04);
    propsGroup.add(cup);
  });

  // Lower interior props (visible when doors open)
  const lowerPlates = createPlateStack(4);
  lowerPlates.position.set(c2 - 0.15, middleShelfY + t / 2 + 0.004, lowerInteriorZ);
  const lowerPot = createBasket(0.24, 0.16, 0.28, materials);
  lowerPot.position.set(c3 + 0.12, rightLowerShelfTop + 0.004, lowerInteriorZ);
  propsGroup.add(lowerPlates, lowerPot);
  movableShelfProps.push(lowerPot);

  propsGroup.visible = state.showProps;

  dimensionGroup = createDimensions({ width: W, height: H, depth: lowerD }, materials);
  cabinetGroup.add(dimensionGroup);

  updateRoom(room, { width: W, height: H, depth: lowerD });
  applyVisibility();
}

function applyVisibility() {
  if (propsGroup) propsGroup.visible = state.showProps;
  if (dimensionGroup) dimensionGroup.visible = state.showDims;
  if (utilityGroup) utilityGroup.visible = state.showUtility;
  movableShelfGroups.forEach((group) => {
    group.visible = !state.shelfRemoved;
  });
  movableShelfProps.forEach((prop) => {
    prop.visible = !state.shelfRemoved;
  });
  if (utilityConflictGroup) utilityConflictGroup.visible = !state.shelfRemoved;
}

function applyPartTransform(part) {
  if (part.type === 'door') {
    part.group.rotation.y = part.hingeSign * part.open * part.angle;
  } else if (part.type === 'liftDoor') {
    part.group.rotation.x = -part.open * part.angle;
  } else if (part.type === 'drawer') {
    part.group.position.z = part.open * part.travel;
  }
}

function rebuild() {
  normalizeState();
  const direction = viewer.camera.position.clone().sub(viewer.controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.02, 0.12, 1);
  direction.normalize();

  const openStates = new Map(
    interactiveParts.map((part) => [part.label, { open: part.open, target: part.target }]),
  );

  disposeGroup(cabinetGroup);
  utilityGroup = null;
  utilityConflictGroup = null;
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
  const D = state.lowerD / 1000;
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
    { width: state.W / 1000, height: state.H / 1000, depth: state.lowerD / 1000 },
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
  if (part) {
    part.target = part.target > 0.5 ? 0 : 1;
  }
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
  if (dimensionGroup) dimensionGroup.visible = state.showDims;
});

document.getElementById('show-props').addEventListener('change', (event) => {
  state.showProps = event.target.checked;
  applyVisibility();
});

document.getElementById('show-utility').addEventListener('change', (event) => {
  state.showUtility = event.target.checked;
  applyVisibility();
});

document.getElementById('check-utility').addEventListener('click', () => {
  state.showUtility = true;
  const toggle = document.getElementById('show-utility');
  if (toggle) toggle.checked = true;
  interactiveParts.forEach((part) => {
    if (part.label && part.label.includes('右地柜门')) part.target = 1;
  });
  applyVisibility();
  const utility = getUtilityInfo();
  viewer.controls.target.set(utility.xCenter, utility.yCenter, 0);
  viewer.camera.position.set(utility.xCenter + 0.75, utility.yCenter + 0.35, 1.8);
  viewer.controls.update();
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
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
