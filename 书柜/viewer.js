import {
  THREE,
  createViewer,
  createLights,
  createMaterials,
  createRoom,
  updateRoom,
  box,
  cylinder,
  createBookRow,
  createDimensions,
  disposeGroup,
  fitCamera,
  damp,
} from '../assets/js/viewer-core.js';

const DEFAULTS = {
  W: 2403,
  H: 2120,
  D: 300,
  catExt: 200,
  t: 18,
};

const ROW_RATIOS = [220, 300, 300, 300, 300, 400, 400];
const RATIO_SUM = 2220;
const GAP = 0.003;

const state = {
  ...DEFAULTS,
  showDims: true,
  showProps: true,
  showCat: true,
  colW: 0,
  rowTop: 0,
  rowStd: 0,
  rowLarge: 0,
  doorW: 0,
  catDepth: 0,
};

const SCENE = {
  doorT: 0.018,
  doorZ: 0.141,
  depth: 0.3,
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
cabinetGroup.name = 'bookcase';
viewer.scene.add(cabinetGroup);

let interactiveParts = [];
let propsGroup = null;
let dimensionGroup = null;
let catStepsGroup = null;
let firstBuild = true;

function normalizeState() {
  state.W = clamp(state.W, 2000, 3000);
  state.H = clamp(state.H, 1900, 2400);
  state.D = clamp(state.D, 250, 400);
  state.catExt = clamp(state.catExt, 100, 300);
  state.t = clamp(Math.round(state.t), 16, 25);

  state.colW = (state.W - 6 * state.t) / 5;
  const clearH = state.H - 8 * state.t;
  const scale = clearH / RATIO_SUM;
  state.rowTop = ROW_RATIOS[0] * scale;
  state.rowStd = ROW_RATIOS[1] * scale;
  state.rowLarge = ROW_RATIOS[5] * scale;
  state.catDepth = state.D + state.catExt;
  state.doorW = (2 * state.colW + state.t) / 2 - 1.5 * 3;
}

function syncInputs() {
  document.querySelectorAll('[data-range], [data-number]').forEach((input) => {
    const key = input.dataset.range || input.dataset.number;
    if (key in state) input.value = state[key];
  });
}

function updateReadouts() {
  document.getElementById('size-readout').textContent = `${Math.round(state.W)} × ${Math.round(state.H)} × ${Math.round(state.D)} mm`;
  document.getElementById('col-width').textContent = `${format(state.colW, 1)} mm`;
  document.getElementById('row-top').textContent = `${format(state.rowTop, 0)} mm`;
  document.getElementById('row-std').textContent = `${format(state.rowStd, 0)} mm`;
  document.getElementById('row-large').textContent = `${format(state.rowLarge, 0)} mm`;
  document.getElementById('door-width').textContent = `${format(state.doorW, 1)} mm`;
  document.getElementById('cat-depth').textContent = `${format(state.catDepth, 0)} mm`;

  const warnings = [];
  if (state.rowStd < 220) warnings.push(`标准层高 ${format(state.rowStd, 0)} mm < 220`);
  if (state.rowTop < 150) warnings.push(`顶层层高 ${format(state.rowTop, 0)} mm < 150`);
  if (state.colW < 300) warnings.push(`单列宽 ${format(state.colW, 0)} mm < 300`);
  if (state.catExt > 250) warnings.push(`猫梯伸出 ${format(state.catExt, 0)} mm，注意重心`);

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

function createCatStep({ width, height, depth, baseH, verticalW, side, material }) {
  const shape = new THREE.Shape();
  if (side === 'right') {
    shape.moveTo(0, 0);
    shape.lineTo(width, 0);
    shape.lineTo(width, height);
    shape.lineTo(width - verticalW, height);
    shape.lineTo(width - verticalW, baseH);
    shape.lineTo(0, baseH);
    shape.closePath();
  } else {
    shape.moveTo(0, 0);
    shape.lineTo(width, 0);
    shape.lineTo(width, baseH);
    shape.lineTo(verticalW, baseH);
    shape.lineTo(verticalW, height);
    shape.lineTo(0, height);
    shape.closePath();
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createPlant() {
  const group = new THREE.Group();
  const pot = cylinder(0.065, 0.09, materials.woodDark, { y: 0.045 });
  const stem = cylinder(0.012, 0.12, materials.bookColors[1], { y: 0.13 });
  const leafMaterial = materials.bookColors[1];
  const leafGeometry = new THREE.SphereGeometry(0.05, 8, 6);
  const leaves = [
    { x: -0.04, y: 0.2, z: 0.02, rz: 0.5 },
    { x: 0.04, y: 0.22, z: -0.02, rz: -0.5 },
    { x: 0, y: 0.25, z: 0.03, rz: 0.1 },
  ];
  leaves.forEach(({ x, y, z, rz }) => {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.position.set(x, y, z);
    leaf.scale.set(1.4, 0.35, 0.7);
    leaf.rotation.z = rz;
    leaf.castShadow = true;
    group.add(leaf);
  });
  group.add(pot, stem);
  return group;
}

function buildCabinet() {
  interactiveParts = [];

  const W = state.W / 1000;
  const H = state.H / 1000;
  const D = state.D / 1000;
  const catExt = state.catExt / 1000;
  const catDepth = state.catDepth / 1000;
  const t = state.t / 1000;
  const backT = 0.009;
  const doorT = t;
  const carcassD = D - doorT;
  const interiorD = D - doorT - backT;
  const carcassZ = -doorT / 2;
  const interiorZ = (backT - doorT) / 2;
  const frontZ = D / 2;
  const doorZ = D / 2 - doorT / 2;
  const colW = state.colW / 1000;
  const rowTop = state.rowTop / 1000;
  const rowStd = state.rowStd / 1000;
  const rowLarge = state.rowLarge / 1000;

  SCENE.doorT = doorT;
  SCENE.doorZ = doorZ;
  SCENE.depth = D;

  // Rows from bottom to top.
  const rowHeightsBottom = [rowLarge, rowLarge, rowStd, rowStd, rowStd, rowStd, rowTop];
  const rows = [];
  let cursorY = t;
  const shelfCenters = [];
  for (let i = 0; i < 7; i += 1) {
    rows.push({ bottom: cursorY, top: cursorY + rowHeightsBottom[i], height: rowHeightsBottom[i] });
    cursorY = rows[i].top;
    if (i < 6) {
      shelfCenters.push(cursorY + t / 2);
      cursorY += t;
    }
  }

  // Column positions.
  const colLefts = [];
  const colRights = [];
  const colCenters = [];
  let xCursor = -W / 2 + t;
  for (let i = 0; i < 5; i += 1) {
    colLefts.push(xCursor);
    colRights.push(xCursor + colW);
    colCenters.push(xCursor + colW / 2);
    xCursor = colRights[i] + t;
  }
  const p1 = colRights[0] + t / 2;
  const p2 = colRights[1] + t / 2;
  const p3 = colRights[2] + t / 2;
  const p4 = colRights[3] + t / 2;
  const rightStart = colRights[2] + t;
  const rightEnd = W / 2 - t;
  const rightCenter = (rightStart + rightEnd) / 2;

  // Carcass.
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

  // Horizontal shelves.
  shelfCenters.forEach((y) => {
    cabinetGroup.add(
      box(W - 2 * t, t, interiorD, materials.wood, {
        y,
        z: interiorZ,
      }),
    );
  });

  // Cat stairs: 500-deep movable boards inserted into selected cells.
  catStepsGroup = new THREE.Group();
  catStepsGroup.name = 'cat-steps';
  cabinetGroup.add(catStepsGroup);

  const catPositions = [
    { col: 0, row: 1, side: 'left' },
    { col: 1, row: 2, side: 'right' },
    { col: 2, row: 3, side: 'right' },
    // Top two steps mirrored left-right (side panel moved to the left).
    { col: 1, row: 4, side: 'left' },
    { col: 0, row: 5, side: 'left' },
  ];
  catPositions.forEach(({ col, row, side }) => {
    const cell = rows[row];
    const width = colW - 0.001;
    const height = cell.height - 0.001;
    const baseH = Math.min(0.14, Math.max(0.07, cell.height * 0.32));
    const verticalW = Math.min(0.14, width * 0.28);
    const step = createCatStep({
      width,
      height,
      depth: catDepth,
      baseH,
      verticalW,
      side,
      material: materials.wood,
    });
    step.position.set(colLefts[col] + 0.0005, cell.bottom + 0.0005, -D / 2);
    catStepsGroup.add(step);
  });

  // Right closed section doors.
  addDoor({
    xLeft: rightStart + GAP,
    xRight: rightCenter - GAP / 2,
    yBottom: GAP,
    yTop: H - GAP,
    hinge: 'left',
    label: '右侧柜门（左）',
    knobY: 1.0,
  });
  addDoor({
    xLeft: rightCenter + GAP / 2,
    xRight: rightEnd - GAP,
    yBottom: GAP,
    yTop: H - GAP,
    hinge: 'right',
    label: '右侧柜门（右）',
    knobY: 1.0,
  });

  // Example props: books, a plant, and a cat on the stair.
  propsGroup = new THREE.Group();
  propsGroup.name = 'props';
  cabinetGroup.add(propsGroup);

  const bookCells = [
    [0, 0], [0, 3], [0, 6],
    [1, 0], [1, 1], [1, 5],
    [2, 0], [2, 1], [2, 4], [2, 6],
    [3, 1], [3, 4], [4, 1], [4, 4],
  ];
  bookCells.forEach(([col, row]) => {
    const cell = rows[row];
    const books = createBookRow(materials, 5 + ((col + row) % 3), Math.min(0.24, cell.height * 0.65));
    const wrapper = new THREE.Group();
    wrapper.add(books);
    wrapper.position.set(colCenters[col], cell.bottom + 0.003, interiorZ);
    propsGroup.add(wrapper);
  });

  const plant = createPlant();
  plant.position.set(colCenters[2], rows[2].bottom + 0.003, interiorZ);
  propsGroup.add(plant);

  dimensionGroup = createDimensions({ width: W, height: H, depth: D }, materials);
  cabinetGroup.add(dimensionGroup);

  updateRoom(room, { width: W, height: H, depth: D });
  applyVisibility();
}

function applyVisibility() {
  if (propsGroup) propsGroup.visible = state.showProps;
  if (dimensionGroup) dimensionGroup.visible = state.showDims;
  if (catStepsGroup) catStepsGroup.visible = state.showCat;
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
  fitCamera(viewer.camera, viewer.controls, { width: W, height: H, depth: D + state.catExt / 1000 }, {
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
    { width: state.W / 1000, height: state.H / 1000, depth: state.D / 1000 + state.catExt / 1000 },
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

document.getElementById('show-cat').addEventListener('change', (event) => {
  state.showCat = event.target.checked;
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
