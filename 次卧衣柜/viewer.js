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
  createHangingGarment,
  createDimensions,
  disposeGroup,
  fitCamera,
  damp,
} from '../assets/js/viewer-core.js';

const DEFAULTS = {
  W: 2200,
  H: 2400,
  D: 600,
  topH: 450,
  bottomH: 450,
  leftW: 400,
  centerW: 950,
  t: 18,
  rod2H: 1200,
  rod2On: true,
};

const state = {
  ...DEFAULTS,
  showDims: true,
  showProps: true,
  rightW: 0,
  mainH: 0,
  longClear: 0,
  rod2Min: 0,
  rod2Max: 0,
  shortHandleY: 1000,
  centerDrawerH: 0,
  rightBottomShelfY: 0,
  shortDoorBottom: 0,
};

const SCENE = {
  doorT: 0.018,
  doorZ: 0.291,
  frontZ: 0.3,
  depth: 0.6,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const DOOR_HANDLE_Y = 1.0;
const TRAPEZOID_HANDLE_INSET = 0.2;
const round10 = (value) => Math.round(value / 10) * 10;
const format = (value, digits = 0) => Number(value).toFixed(digits);

const stage = document.getElementById('canvas-container');
const loading = document.getElementById('loading');
const tooltip = document.getElementById('tooltip');

const viewer = createViewer(stage);
const materials = createMaterials();
createLights(viewer.scene);
const room = createRoom(viewer.scene, materials);

const cabinetGroup = new THREE.Group();
cabinetGroup.name = 'wardrobe';
viewer.scene.add(cabinetGroup);

let interactiveParts = [];
let propsGroup = null;
let dimensionGroup = null;
let firstBuild = true;

function normalizeState() {
  state.W = clamp(round10(state.W), 1800, 3200);
  state.H = clamp(round10(state.H), 2000, 2800);
  state.D = clamp(round10(state.D), 500, 700);
  state.topH = clamp(round10(state.topH), 300, 650);
  state.bottomH = clamp(round10(state.bottomH), 300, 650);
  state.leftW = clamp(round10(state.leftW), 250, 650);
  state.centerW = clamp(round10(state.centerW), 500, 1400);
  state.t = clamp(Math.round(state.t), 16, 25);

  const minRight = 550;
  const maxLeftCenter = state.W - 4 * state.t - minRight;
  if (state.leftW + state.centerW > maxLeftCenter) {
    let excess = state.leftW + state.centerW - maxLeftCenter;
    const fromCenter = Math.min(excess, state.centerW - 500);
    state.centerW -= fromCenter;
    excess -= fromCenter;
    if (excess > 0) state.leftW = Math.max(250, state.leftW - excess);
  }

  const maxTopBottom = state.H - 1000;
  if (state.topH + state.bottomH > maxTopBottom) {
    let excess = state.topH + state.bottomH - maxTopBottom;
    const fromBottom = Math.min(excess, state.bottomH - 300);
    state.bottomH -= fromBottom;
    excess -= fromBottom;
    if (excess > 0) state.topH = Math.max(300, state.topH - excess);
  }

  state.rightW = state.W - 4 * state.t - state.leftW - state.centerW;
  state.mainH = state.H - state.topH - state.bottomH;
  state.longClear = state.mainH - 80;

  state.rod2Min = state.bottomH + 500;
  state.rod2Max = state.H - state.topH - 300;
  const rodLo = Math.min(state.rod2Min, state.rod2Max);
  const rodHi = Math.max(state.rod2Min, state.rod2Max);
  state.rod2H = clamp(Number(state.rod2H), rodLo, rodHi);
  state.rod2H = rodLo + Math.round((state.rod2H - rodLo) / 50) * 50;
  state.rod2H = clamp(state.rod2H, rodLo, rodHi);

  // The right bottom drawer takes the same height as one centre drawer.
  // Its top and the lower treehouse shelf move down together, so the trapezoid
  // doors can run lower and the handles can sit at a normal height.
  state.centerDrawerH = (state.bottomH - 2 * state.t - 3 * 3) / 2;
  state.rightBottomShelfY = 2 * state.t + 2 * 3 + state.centerDrawerH;

  const nicheH = Math.min(600, state.mainH * 0.42);
  const nicheTop = state.rightBottomShelfY + nicheH;
  const roofRise = Math.min(200, nicheH * 0.34);
  state.shortDoorBottom = nicheTop - roofRise;
  const halfDoorW = state.rightW / 2;
  const lowerAtHandle = nicheTop - (TRAPEZOID_HANDLE_INSET * 1000 / halfDoorW) * roofRise;
  state.shortHandleY = Math.min(
    state.H - state.topH - 50,
    Math.max(1000, Math.round(lowerAtHandle + 40)),
  );
}

function setInputMin(key, value) {
  document.querySelectorAll(`[data-range="${key}"], [data-number="${key}"]`).forEach((input) => {
    input.min = value;
  });
}

function setInputMax(key, value) {
  document.querySelectorAll(`[data-range="${key}"], [data-number="${key}"]`).forEach((input) => {
    input.max = value;
  });
}

function syncInputs() {
  document.querySelectorAll('[data-range], [data-number]').forEach((input) => {
    const key = input.dataset.range || input.dataset.number;
    input.value = state[key];
  });

  const leftMax = Math.max(250, Math.min(650, state.W - 4 * state.t - state.centerW - 550));
  const centerMax = Math.max(500, Math.min(1400, state.W - 4 * state.t - state.leftW - 550));
  const topMax = Math.max(300, Math.min(650, state.H - state.bottomH - 1000));
  const bottomMax = Math.max(300, Math.min(650, state.H - state.topH - 1000));
  setInputMax('leftW', leftMax);
  setInputMax('centerW', centerMax);
  setInputMax('topH', topMax);
  setInputMax('bottomH', bottomMax);
  setInputMin('rod2H', Math.min(state.rod2Min, state.rod2Max));
  setInputMax('rod2H', Math.max(state.rod2Min, state.rod2Max));
}

function updateReadouts() {
  document.getElementById('size-readout').textContent = `${state.W} × ${state.H} × ${state.D} mm`;
  document.getElementById('right-width').textContent = `${state.rightW} mm`;
  document.getElementById('long-clear').textContent = `${state.longClear} mm`;
  document.getElementById('rod2-height').textContent = `${state.rod2H} mm`;
  document.getElementById('handle-height').textContent = `1000 / ${state.shortHandleY} mm`;
  document.getElementById('short-drawer-height').textContent = `${format(state.centerDrawerH, 1)} mm`;
  document.getElementById('short-door-info').textContent = `${format(state.shortDoorBottom, 0)} / ${state.shortHandleY} mm`;
  document.getElementById('partition-info').textContent =
    `左 ${state.leftW} / 中 ${state.centerW} / 右 ${state.rightW} mm`;

  const warning = document.getElementById('height-warning');
  warning.hidden = state.longClear >= 1400;
  warning.textContent =
    `长衣净高 ${state.longClear} mm，小于 1400 mm；长衣可能拖到底抽，建议调高总高或减小顶柜/底抽。`;
}

function renderUI() {
  syncInputs();
  updateReadouts();
  const rod2Button = document.getElementById('toggle-rod2');
  if (rod2Button) rod2Button.textContent = state.rod2On ? '改为收纳盒' : '改为活动挂衣架';
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

function addDoor({ xLeft, xRight, yBottom, yTop, hinge, label, trapezoid = null, knobY, knobInset = 0.06 }) {
  const doorW = xRight - xLeft;
  const doorH = yTop - yBottom;
  const group = new THREE.Group();
  const hingeX = hinge === 'left' ? xLeft : xRight;
  group.position.set(hingeX, 0, SCENE.doorZ);

  const panelCenterX = hinge === 'left' ? doorW / 2 : -doorW / 2;
  const panelCenterY = (yBottom + yTop) / 2;
  let panel;

  if (trapezoid) {
    const shape = createTrapezoidDoorShape(doorW, doorH, trapezoid.rise, trapezoid.side);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: SCENE.doorT,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -SCENE.doorT / 2);
    panel = new THREE.Mesh(geometry, materials.whiteDoor);
    panel.position.set(panelCenterX, panelCenterY, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
  } else {
    panel = box(doorW, doorH, SCENE.doorT, materials.whiteDoor, {
      x: panelCenterX,
      y: panelCenterY,
      z: 0,
    });
  }
  group.add(panel);

  const knob = createKnob();
  const knobX = hinge === 'left' ? doorW - knobInset : -(doorW - knobInset);
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

function createTrapezoidDoorShape(width, height, rise, side) {
  // Local x runs from the hinge-side outer edge to the center seam; the lower
  // edge slopes up to the treehouse peak on the center seam.
  const shape = new THREE.Shape();
  const x0 = -width / 2;
  const x1 = width / 2;
  const y0 = -height / 2;
  const y1 = height / 2;

  if (side === 'left') {
    // Outer edge is x0, center seam is x1.
    shape.moveTo(x0, y0);
    shape.lineTo(x0, y1);
    shape.lineTo(x1, y1);
    shape.lineTo(x1, y0 + rise);
    shape.closePath();
  } else {
    // Outer edge is x1, center seam is x0.
    shape.moveTo(x0, y0 + rise);
    shape.lineTo(x0, y1);
    shape.lineTo(x1, y1);
    shape.lineTo(x1, y0);
    shape.closePath();
  }
  return shape;
}

function addDrawer({ xCenter, width, yBottom, yTop, label }) {
  const height = yTop - yBottom;
  const centerY = (yBottom + yTop) / 2;
  const group = new THREE.Group();
  group.position.set(xCenter, 0, 0);

  const front = box(width, height, SCENE.doorT, materials.whiteDoor, {
    y: centerY,
    z: SCENE.frontZ,
  });
  group.add(front);

  const knob = createKnob();
  knob.position.set(0, centerY, SCENE.frontZ + SCENE.doorT / 2);
  group.add(knob);

  const boxW = width - 0.03;
  const boxH = height - 0.02;
  const boxD = Math.min(SCENE.depth - SCENE.doorT - 0.06, 0.5);
  const boxFrontZ = SCENE.frontZ - SCENE.doorT / 2;
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
    travel: Math.min(0.42, boxD * 0.85),
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

function createStorageBox(width, height, depth) {
  const group = new THREE.Group();
  const body = box(width, height, depth, materials.woodLight, { y: height / 2 });
  const lid = box(width + 0.024, 0.028, depth + 0.024, materials.whiteEdge, {
    y: height + 0.014,
  });
  const handle = box(0.12, 0.02, 0.03, materials.woodDark, {
    y: height + 0.038,
    z: depth * 0.18,
  });
  group.add(body, lid, handle);
  return group;
}

function createLegoRow() {
  const group = new THREE.Group();
  const colors = [materials.bookColors[0], materials.bookColors[2], materials.bookColors[3]];
  const blocks = [
    { x: -0.075, y: 0.022, z: 0, w: 0.06, h: 0.044, d: 0.06 },
    { x: 0, y: 0.03, z: 0.02, w: 0.07, h: 0.06, d: 0.07 },
    { x: 0.075, y: 0.018, z: -0.015, w: 0.055, h: 0.036, d: 0.055 },
  ];
  blocks.forEach((block, index) => {
    const mesh = box(block.w, block.h, block.d, colors[index], {
      x: block.x,
      y: block.y,
      z: block.z,
    });
    group.add(mesh);
    for (let i = 0; i < 2; i += 1) {
      const stud = cylinder(0.008, 0.008, materials.knob, {
        x: block.x + (i === 0 ? -0.016 : 0.016),
        y: block.y + block.h / 2 + 0.004,
        z: block.z,
      });
      group.add(stud);
    }
  });
  return group;
}

function createModelFigure() {
  const group = new THREE.Group();
  const base = cylinder(0.065, 0.02, materials.woodDark, { y: 0.01 });
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 18, 14),
    materials.bookColors[0],
  );
  body.position.y = 0.085;
  body.scale.y = 1.18;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(base, body);
  return group;
}

function buildCabinet() {
  interactiveParts = [];

  const W = state.W / 1000;
  const H = state.H / 1000;
  const D = state.D / 1000;
  const t = state.t / 1000;
  const backT = 0.009;
  const doorT = t;
  const gap = 0.003;
  const carcassD = D - doorT;
  const interiorD = D - doorT - backT;
  const carcassZ = -doorT / 2;
  const interiorZ = (backT - doorT) / 2;
  const frontZ = D / 2;
  const doorZ = D / 2 - doorT / 2;
  const halfW = W / 2;

  SCENE.doorT = doorT;
  SCENE.doorZ = doorZ;
  SCENE.frontZ = frontZ;
  SCENE.depth = D;

  const topShelfY = H - state.topH / 1000;
  const bottomShelfY = state.bottomH / 1000;
  const rightBottomShelfY = state.rightBottomShelfY / 1000;
  const centerDrawerH = state.centerDrawerH / 1000;
  const mainH = topShelfY - bottomShelfY;
  const leftInnerX = -halfW + t;
  const leftColumnCenterX = leftInnerX + state.leftW / 1000 / 2;
  const partition1X = leftInnerX + state.leftW / 1000 + t / 2;
  const centerStartX = leftInnerX + state.leftW / 1000 + t;
  const centerEndX = centerStartX + state.centerW / 1000;
  const centerCenterX = (centerStartX + centerEndX) / 2;
  const partition2X = centerEndX + t / 2;
  const rightStartX = centerEndX + t;
  const rightEndX = halfW - t;
  const rightCenterX = (rightStartX + rightEndX) / 2;
  const rightW = rightEndX - rightStartX;
  const displayTopY = topShelfY - Math.min(0.45, mainH * 0.42);
  const openTopY = displayTopY - t;
  const openH = Math.max(0.2, openTopY - bottomShelfY);
  const shelf1Y = bottomShelfY + openH / 3;
  const shelf2Y = bottomShelfY + (openH * 2) / 3;

  const nicheH = Math.min(0.6, mainH * 0.42);
  const nicheTopY = rightBottomShelfY + nicheH;
  const roofRise = Math.min(0.2, nicheH * 0.34);
  const rightEaveY = nicheTopY - roofRise;

  const longRodY = topShelfY - 0.08;
  const shortRodY = topShelfY - 0.08;

  // Carcass
  cabinetGroup.add(
    box(t, H, carcassD, materials.whiteCarcass, { x: -halfW + t / 2, y: H / 2, z: carcassZ }),
    box(t, H, carcassD, materials.whiteCarcass, { x: halfW - t / 2, y: H / 2, z: carcassZ }),
    box(W, t, carcassD, materials.whiteCarcass, { y: H - t / 2, z: carcassZ }),
    box(W, t, carcassD, materials.whiteCarcass, { y: t / 2, z: carcassZ }),
    box(W - 2 * t, H - 2 * t, backT, materials.wood, {
      y: H / 2,
      z: -D / 2 + backT / 2,
      cast: false,
    }),
  );

  cabinetGroup.add(
    box(W - 2 * t, t, interiorD, materials.wood, { y: topShelfY - t / 2, z: interiorZ }),
    box(rightStartX - (-halfW + t), t, interiorD, materials.wood, {
      x: (-halfW + t + rightStartX) / 2,
      y: bottomShelfY - t / 2,
      z: interiorZ,
    }),
    box(rightW, t, interiorD, materials.wood, {
      x: rightCenterX,
      y: rightBottomShelfY - t / 2,
      z: interiorZ,
    }),
  );

  // Lower vertical partitions
  cabinetGroup.add(
    box(t, topShelfY - t, interiorD, materials.wood, {
      x: partition1X,
      y: (topShelfY + t) / 2,
      z: interiorZ,
    }),
    box(t, topShelfY - t, interiorD, materials.wood, {
      x: partition2X,
      y: (topShelfY + t) / 2,
      z: interiorZ,
    }),
  );

  // Top-row partitions align with the lower bay partitions
  [partition1X, partition2X].forEach((x) => {
    cabinetGroup.add(
      box(t, state.topH / 1000 - t, interiorD, materials.wood, {
        x,
        y: topShelfY + (state.topH / 1000 - t) / 2,
        z: interiorZ,
      }),
    );
  });

  // Left open shelves
  const leftShelfWidth = state.leftW / 1000;
  [shelf1Y, shelf2Y].forEach((y) => {
    cabinetGroup.add(
      box(leftShelfWidth, t, interiorD, materials.wood, {
        x: leftColumnCenterX,
        y,
        z: interiorZ,
      }),
    );
  });
  cabinetGroup.add(
    box(leftShelfWidth, t, interiorD, materials.wood, {
      x: leftColumnCenterX,
      y: displayTopY - t / 2,
      z: interiorZ,
    }),
  );

  // Left display bay: one full-height flat door covers the three display cells
  // and the former arched opening area.
  addDoor({
    xLeft: leftInnerX + gap,
    xRight: leftInnerX + leftShelfWidth - gap,
    yBottom: bottomShelfY + gap,
    yTop: topShelfY - gap,
    hinge: 'left',
    label: '左侧展示格柜门',
    knobY: DOOR_HANDLE_Y,
  });

  // Top doors: five doors aligned with the lower zones.
  // 1: display bay; 2/3: long hanging bay, opening from the middle;
  // 4/5: short hanging + treehouse bay, split at the treehouse peak.
  const topLeft = -halfW + t;
  const topRight = halfW - t;
  const topGroup1W = leftShelfWidth + t / 2;
  const topGroup2W = state.centerW / 1000 + t;
  const topGroup1End = topLeft + topGroup1W;
  const topGroup2End = topGroup1End + topGroup2W;
  const topDoorYBottom = topShelfY + gap;
  const topDoorYTop = H - gap;
  const topKnobY = topShelfY + 0.1;

  addDoor({
    xLeft: topLeft + gap,
    xRight: topGroup1End - gap / 2,
    yBottom: topDoorYBottom,
    yTop: topDoorYTop,
    hinge: 'left',
    label: '顶柜门 1（展示格）',
    knobY: topKnobY,
  });
  addDoor({
    xLeft: topGroup1End + gap / 2,
    xRight: centerCenterX - gap / 2,
    yBottom: topDoorYBottom,
    yTop: topDoorYTop,
    hinge: 'left',
    label: '顶柜门 2（长衣区左）',
    knobY: topKnobY,
  });
  addDoor({
    xLeft: centerCenterX + gap / 2,
    xRight: topGroup2End - gap / 2,
    yBottom: topDoorYBottom,
    yTop: topDoorYTop,
    hinge: 'right',
    label: '顶柜门 3（长衣区右）',
    knobY: topKnobY,
  });
  addDoor({
    xLeft: topGroup2End + gap / 2,
    xRight: rightCenterX - gap / 2,
    yBottom: topDoorYBottom,
    yTop: topDoorYTop,
    hinge: 'left',
    label: '顶柜门 4（短衣区左）',
    knobY: topKnobY,
  });
  addDoor({
    xLeft: rightCenterX + gap / 2,
    xRight: topRight - gap,
    yBottom: topDoorYBottom,
    yTop: topDoorYTop,
    hinge: 'right',
    label: '顶柜门 5（短衣区右）',
    knobY: topKnobY,
  });

  // Lower center: two leaves split at the center, opening to both sides.
  addDoor({
    xLeft: centerStartX + gap,
    xRight: centerCenterX - gap / 2,
    yBottom: bottomShelfY + gap,
    yTop: topShelfY - gap,
    hinge: 'left',
    label: '长衣区左门',
    knobY: DOOR_HANDLE_Y,
  });
  addDoor({
    xLeft: centerCenterX + gap / 2,
    xRight: centerEndX - gap,
    yBottom: bottomShelfY + gap,
    yTop: topShelfY - gap,
    hinge: 'right',
    label: '长衣区右门',
    knobY: DOOR_HANDLE_Y,
  });

  // Right bay: two trapezoid doors. Their sloped lower edges form the
  // full-width treehouse opening below; the doors stop at the outer eaves.
  const rightDoorSplitX = rightCenterX;
  addDoor({
    xLeft: rightStartX + gap,
    xRight: rightDoorSplitX - gap / 2,
    yBottom: rightEaveY + gap,
    yTop: topShelfY - gap,
    hinge: 'left',
    label: '短衣区柜门（左）',
    trapezoid: {
      rise: roofRise,
      side: 'left',
    },
    knobY: state.shortHandleY / 1000,
    knobInset: TRAPEZOID_HANDLE_INSET,
  });
  addDoor({
    xLeft: rightDoorSplitX + gap / 2,
    xRight: rightEndX - gap,
    yBottom: rightEaveY + gap,
    yTop: topShelfY - gap,
    hinge: 'right',
    label: '短衣区柜门（右）',
    trapezoid: {
      rise: roofRise,
      side: 'right',
    },
    knobY: state.shortHandleY / 1000,
    knobInset: TRAPEZOID_HANDLE_INSET,
  });

  // Left bottom drawer
  addDrawer({
    xCenter: leftColumnCenterX,
    width: leftShelfWidth - 2 * gap,
    yBottom: t + gap,
    yTop: bottomShelfY - t - gap,
    label: '左侧底抽',
  });

  // Center two drawers
  const centerBottom1 = t + gap;
  const centerBottom2 = centerBottom1 + centerDrawerH + gap;
  addDrawer({
    xCenter: centerCenterX,
    width: state.centerW / 1000 - 2 * gap,
    yBottom: centerBottom1,
    yTop: centerBottom1 + centerDrawerH,
    label: '中区下抽屉',
  });
  addDrawer({
    xCenter: centerCenterX,
    width: state.centerW / 1000 - 2 * gap,
    yBottom: centerBottom2,
    yTop: centerBottom2 + centerDrawerH,
    label: '中区上抽屉',
  });

  // Right bottom drawer
  addDrawer({
    xCenter: rightCenterX,
    width: rightW - 2 * gap,
    yBottom: t + gap,
    yTop: rightBottomShelfY - t - gap,
    label: '孩子物品抽屉',
  });

  // Center hanging rod
  cabinetGroup.add(
    cylinder(0.0125, state.centerW / 1000 - 0.06, materials.metal, {
      x: centerCenterX,
      y: longRodY,
      z: interiorZ,
    }),
  );
  const centerRod = cabinetGroup.children[cabinetGroup.children.length - 1];
  centerRod.rotation.z = Math.PI / 2;

  // Right hanging rod
  cabinetGroup.add(
    cylinder(0.0125, rightW - 0.06, materials.metal, {
      x: rightCenterX,
      y: shortRodY,
      z: interiorZ,
    }),
  );
  const rightRod = cabinetGroup.children[cabinetGroup.children.length - 1];
  rightRod.rotation.z = Math.PI / 2;

  // Right bay: one horizontal shelf separates the short-hanging zone
  // from the lower transition-clothes zone. The trapezoid doors form the opening.
  cabinetGroup.add(
    box(rightW, t, interiorD, materials.wood, {
      x: rightCenterX,
      y: nicheTopY - t / 2,
      z: interiorZ,
    }),
  );

  // Center bay: fixed top rod remains; add the height-adjustable lower rail.
  // Slotted vertical tracks on both side panels follow the reference photos.
  const rod2Y = state.rod2H / 1000;
  const rod2Z = interiorZ + 0.06;
  const rod2MinY = Math.min(state.rod2Min, state.rod2Max) / 1000;
  const rod2MaxY = Math.max(state.rod2Min, state.rod2Max) / 1000;
  const trackBottom = Math.max(bottomShelfY + 0.18, rod2MinY - 0.05);
  const trackTop = Math.min(topShelfY - 0.2, rod2MaxY + 0.05);
  const trackH = Math.max(0.1, trackTop - trackBottom);
  const trackY = (trackBottom + trackTop) / 2;
  [centerStartX + 0.015, centerEndX - 0.015].forEach((x) => {
    cabinetGroup.add(
      box(0.03, trackH, 0.03, materials.woodLight, { x, y: trackY, z: rod2Z }),
    );
    const holeStart = Math.max(rod2MinY, trackBottom + 0.02);
    const holeEnd = Math.min(rod2MaxY, trackTop - 0.02);
    for (let holeY = holeStart; holeY <= holeEnd + 0.001; holeY += 0.05) {
      cabinetGroup.add(
        box(0.018, 0.012, 0.006, materials.woodDark, {
          x,
          y: holeY,
          z: rod2Z + 0.016,
        }),
      );
    }
  });

  if (state.rod2On) {
    const lowerRod = cylinder(0.0125, state.centerW / 1000 - 0.1, materials.metal, {
      x: centerCenterX,
      y: rod2Y,
      z: rod2Z,
    });
    lowerRod.rotation.z = Math.PI / 2;
    cabinetGroup.add(lowerRod);
    [centerStartX + 0.03, centerEndX - 0.03].forEach((x) => {
      cabinetGroup.add(
        box(0.04, 0.06, 0.04, materials.metal, { x, y: rod2Y, z: rod2Z }),
      );
    });
  }

  // Example props
  propsGroup = new THREE.Group();
  propsGroup.name = 'props';
  cabinetGroup.add(propsGroup);

  const booksWrapper = new THREE.Group();
  booksWrapper.position.set(leftColumnCenterX, bottomShelfY + 0.006, interiorZ);
  booksWrapper.add(createBookRow(materials, 6, 0.27));
  propsGroup.add(booksWrapper);

  const lego = createLegoRow();
  lego.position.set(leftColumnCenterX, shelf1Y + t / 2, interiorZ);
  propsGroup.add(lego);

  const model = createModelFigure();
  model.position.set(leftColumnCenterX, shelf2Y + t / 2, interiorZ);
  propsGroup.add(model);

  // Center bay: either the adjustable rail (default) or a storage box below it.
  if (state.rod2On) {
    [-0.18, 0.18].forEach((offset, index) => {
      const garment = createHangingGarment(materials, index + 3, 0.5, 0.3);
      garment.position.set(centerCenterX + offset, rod2Y, rod2Z);
      propsGroup.add(garment);
    });
  } else {
    const storageBox = createStorageBox(0.62, 0.3, 0.4);
    storageBox.position.set(centerCenterX, bottomShelfY + 0.005, interiorZ);
    propsGroup.add(storageBox);
  }

  const nicheBasketW = Math.min(0.58, Math.max(0.3, rightW - 0.18));
  const nicheBasketH = Math.min(0.3, Math.max(0.18, nicheH * 0.55));
  const nicheBasketD = Math.min(0.36, Math.max(0.22, interiorD - 0.1));
  const nicheBasket = createBasket(nicheBasketW, nicheBasketH, nicheBasketD, materials);
  nicheBasket.position.set(rightCenterX, rightBottomShelfY + 0.005, interiorZ);
  propsGroup.add(nicheBasket);

  const longGarments = [-0.26, 0, 0.26];
  longGarments.forEach((offset, index) => {
    const garment = createHangingGarment(materials, index, 1.02, 0.38);
    garment.position.set(centerCenterX + offset, longRodY, interiorZ);
    propsGroup.add(garment);
  });
  const shortGarments = [-0.25, 0, 0.25];
  shortGarments.forEach((offset, index) => {
    const garment = createHangingGarment(materials, index + 2, 0.72, 0.34);
    garment.position.set(rightCenterX + offset, shortRodY, interiorZ);
    propsGroup.add(garment);
  });

  propsGroup.visible = state.showProps;

  // Dimension overlay
  dimensionGroup = createDimensions({ width: W, height: H, depth: D }, materials);
  dimensionGroup.visible = state.showDims;
  cabinetGroup.add(dimensionGroup);

  updateRoom(room, { width: W, height: H, depth: D });
}

function applyPartTransform(part) {
  if (part.type === 'door') {
    part.group.rotation.y = part.hingeSign * part.open * part.angle;
  } else {
    part.group.position.z = part.open * part.travel;
  }
}

function rebuild() {
  normalizeState();
  const direction = viewer.camera.position.clone().sub(viewer.controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.34, 0.18, 1);
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

document.getElementById('toggle-rod2').addEventListener('click', () => {
  state.rod2On = !state.rod2On;
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
  if (propsGroup) propsGroup.visible = state.showProps;
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
