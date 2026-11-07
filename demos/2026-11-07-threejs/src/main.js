import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  TAU,
  analyticSectorArea,
  arcPoints,
  emptyFocusX,
  orbitPolyline,
  period,
  periodRatio,
  stateAt,
  visViva,
} from './kepler.js';

const PLANET1 = {
  name: 'Planet 1',
  a: 5,
  e: 0.22,
  color: 0x6eb0d4,
  radius: 0.26,
  phase: 1.15,
};

const PLANET2_DEFAULT = {
  name: 'Planet 2',
  a: 9.5,
  e: 0.6,
  color: 0xf08a5d,
  radius: 0.32,
  // Just before perihelion, so the speed-up is visible soon after load.
  phase: TAU - 0.55,
};

const ORBIT_SEGMENTS = 320;
const WEDGE_SEGMENTS = 48;
const WEDGE_MEAN = TAU / 10;
const TRAIL_MAX = 140;
const TRAIL_DT = 0.035;
const SUN_RADIUS = 0.46;
const SWEEP_FILL = 2.8;
const SWEEP_HOLD = 1.6;

const viewport = document.getElementById('viewport');
const fociToggle = document.getElementById('toggle-foci');
const areasToggle = document.getElementById('toggle-areas');
const focusReadout = document.getElementById('focus-readout');
const areaReadout = document.getElementById('area-readout');
const speedNow = document.getElementById('speed-now');
const eccInput = document.getElementById('ecc');
const axisInput = document.getElementById('axis');
const speedInput = document.getElementById('speed');
const eOut = document.getElementById('eOut');
const aOut = document.getElementById('aOut');
const speedOut = document.getElementById('speedOut');
const pauseBtn = document.getElementById('pause');
const a1Cell = document.getElementById('a1');
const a2Cell = document.getElementById('a2');
const t1Cell = document.getElementById('t1');
const t2Cell = document.getElementById('t2');
const ratio1Cell = document.getElementById('ratio1');
const ratio2Cell = document.getElementById('ratio2');
const yearCompare = document.getElementById('year-compare');

const planet2 = { ...PLANET2_DEFAULT };
let timeScale = Number(speedInput.value);
let paused = false;
let simTime = 0;
let sweepTime = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b10);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
camera.position.set(11, 14, 18);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (error) {
  showFallback();
  throw error;
}
if (!renderer.getContext()) {
  showFallback();
} else {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  viewport.appendChild(renderer.domElement);
}

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
viewport.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 70;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.85;
controls.target.set(-1.5, 0, 0);
controls.update();

scene.add(new THREE.AmbientLight(0xc5d0e0, 0.7));
scene.add(new THREE.HemisphereLight(0xfff2d8, 0x1c2636, 0.55));
const sunLight = new THREE.PointLight(0xfff6e4, 90, 0, 2);
scene.add(sunLight);

addStars(scene);
const sun = addSun(scene);
const body1 = addPlanet(scene, PLANET1);
const body2 = addPlanet(scene, planet2);

const focusHelpers = {
  one: addFocusHelpers(scene, PLANET1.color, 'Planet 1'),
  two: addFocusHelpers(scene, planet2.color, 'Planet 2'),
};
const wedges = {
  peri: addWedge(scene, 0xf08a5d),
  ap: addWedge(scene, 0xf0c39a),
};
const wedgeLabels = {
  peri: addLabel('perihelion', wedges.peri.anchor),
  ap: addLabel('aphelion', wedges.ap.anchor),
};

a1Cell.textContent = PLANET1.a.toFixed(2);
updateLaw3();
setOrbit(body1.orbit, PLANET1.a, PLANET1.e);
applyPlanet2Shape();
resize();

eccInput.addEventListener('input', () => {
  planet2.e = Number(eccInput.value);
  eOut.textContent = planet2.e.toFixed(2);
  applyPlanet2Shape();
});

axisInput.addEventListener('input', () => {
  planet2.a = Number(axisInput.value);
  aOut.textContent = planet2.a.toFixed(1);
  applyPlanet2Shape();
  updateLaw3();
});

speedInput.addEventListener('input', () => {
  timeScale = Number(speedInput.value);
  speedOut.textContent = `${timeScale.toFixed(1)}×`;
});

fociToggle.addEventListener('change', () => {
  const show = fociToggle.checked;
  focusHelpers.one.group.visible = show;
  focusHelpers.two.group.visible = show;
  focusReadout.hidden = !show;
});

areasToggle.addEventListener('change', () => {
  const show = areasToggle.checked;
  wedges.peri.mesh.visible = show;
  wedges.ap.mesh.visible = show;
  wedges.peri.outline.visible = show;
  wedges.ap.outline.visible = show;
  wedges.peri.anchor.visible = show;
  wedges.ap.anchor.visible = show;
  areaReadout.hidden = !show;
  if (show) sweepTime = 0;
});

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  pauseBtn.setAttribute('aria-pressed', String(paused));
});

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
  event.preventDefault();
  pauseBtn.click();
});

const resizeObserver = new ResizeObserver(() => resize());
resizeObserver.observe(viewport);

const timer = new THREE.Timer();
timer.connect(document);

function frame(timestamp) {
  requestAnimationFrame(frame);
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  if (!paused) {
    simTime += dt * timeScale;
    sweepTime += dt;
  }

  const state1 = placeBody(body1, PLANET1, simTime);
  const state2 = placeBody(body2, planet2, simTime);

  updateFocusHelpers(focusHelpers.one, PLANET1, state1);
  updateFocusHelpers(focusHelpers.two, planet2, state2);
  if (fociToggle.checked) updateFocusReadout(state1, state2);
  if (areasToggle.checked) updateWedges();
  updateSpeedReadout(state2);

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function showFallback() {
  viewport.innerHTML = '<p class="fallback">This demo needs WebGL to draw the orbits.</p>';
}

function resize() {
  const width = viewport.clientWidth || 1;
  const height = viewport.clientHeight || 1;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  labelRenderer.setSize(width, height);
  body1.orbit.material.resolution.set(width, height);
  body2.orbit.material.resolution.set(width, height);
}

function addStars(target) {
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 90 + Math.random() * 140;
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xd5deee,
    size: 1.7,
    sizeAttenuation: false,
  });
  target.add(new THREE.Points(geometry, material));
}

function addSun(target) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_RADIUS, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff4d2 }),
  );
  target.add(mesh);

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sprite.scale.set(5.2, 5.2, 1);
  mesh.add(sprite);
  const label = addLabel('Sun · focus', mesh);
  label.position.y = SUN_RADIUS + 0.85;
  return mesh;
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 246, 220, 0.95)');
  gradient.addColorStop(0.18, 'rgba(255, 196, 90, 0.55)');
  gradient.addColorStop(0.45, 'rgba(255, 140, 40, 0.16)');
  gradient.addColorStop(1, 'rgba(255, 120, 30, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function addPlanet(target, spec) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 36, 28),
    new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: 0.58,
      metalness: 0.04,
      emissive: spec.color,
      emissiveIntensity: 0.22,
    }),
  );
  target.add(mesh);

  const orbit = makeOrbitLine(spec.color);
  target.add(orbit);

  const radiusLine = makeDynamicLine(spec.color, 2);
  target.add(radiusLine);

  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(),
    1,
    spec.color,
    0.32,
    0.18,
  );
  target.add(arrow);

  const trail = makeTrail(spec.color);
  target.add(trail.line);

  const label = addLabel(spec.name, mesh);
  label.position.y = spec.radius + 0.45;

  return { mesh, orbit, radiusLine, arrow, trail, label, spec };
}

function makeOrbitLine(color) {
  const geometry = new LineGeometry();
  geometry.setPositions(new Array((ORBIT_SEGMENTS + 1) * 3).fill(0));
  const material = new LineMaterial({
    color,
    linewidth: 2,
    transparent: true,
    opacity: 0.9,
    worldUnits: false,
  });
  material.resolution.set(1, 1);
  const line = new Line2(geometry, material);
  line.frustumCulled = false;
  line.computeLineDistances();
  return line;
}

function makeDynamicLine(color, pointCount) {
  const positions = new Float32Array(pointCount * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.75,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  return line;
}

function makeTrail(color) {
  const positions = new Float32Array(TRAIL_MAX * 3);
  const colors = new Float32Array(TRAIL_MAX * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  return {
    line,
    positions,
    colors,
    color: new THREE.Color(color),
    count: 0,
    lastTime: -Infinity,
  };
}

function clearTrail(trail) {
  trail.count = 0;
  trail.lastTime = -Infinity;
  trail.line.geometry.setDrawRange(0, 0);
}

function pushTrail(trail, x, z, time) {
  if (time - trail.lastTime < TRAIL_DT) return;
  trail.lastTime = time;
  if (trail.count < TRAIL_MAX) {
    trail.count += 1;
  } else {
    trail.positions.copyWithin(0, 3);
    trail.colors.copyWithin(0, 3);
  }
  const index = (trail.count - 1) * 3;
  trail.positions[index] = x;
  trail.positions[index + 1] = 0.04;
  trail.positions[index + 2] = z;
  for (let i = 0; i < trail.count; i++) {
    const fade = ((i + 1) / trail.count) ** 1.4;
    trail.colors[i * 3] = trail.color.r * fade;
    trail.colors[i * 3 + 1] = trail.color.g * fade;
    trail.colors[i * 3 + 2] = trail.color.b * fade;
  }
  trail.line.geometry.attributes.position.needsUpdate = true;
  trail.line.geometry.attributes.color.needsUpdate = true;
  trail.line.geometry.setDrawRange(0, trail.count);
}

function addFocusHelpers(target, color, name) {
  const group = new THREE.Group();
  group.visible = false;

  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.03, 10, 28),
    new THREE.MeshBasicMaterial({ color }),
  );
  marker.rotation.x = Math.PI / 2;
  group.add(marker);
  const label = addLabel(`${name} focus`, marker);
  label.position.y = 0.55;

  const axisPositions = new Float32Array(6);
  const axisGeometry = new THREE.BufferGeometry();
  axisGeometry.setAttribute('position', new THREE.BufferAttribute(axisPositions, 3));
  const axis = new THREE.Line(
    axisGeometry,
    new THREE.LineDashedMaterial({
      color: 0xe7dcc4,
      dashSize: 0.28,
      gapSize: 0.16,
      transparent: true,
      opacity: 0.7,
    }),
  );
  axis.frustumCulled = false;
  group.add(axis);

  const stringPositions = new Float32Array(9);
  const stringGeometry = new THREE.BufferGeometry();
  stringGeometry.setAttribute('position', new THREE.BufferAttribute(stringPositions, 3));
  const strings = new THREE.Line(
    stringGeometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
  );
  strings.frustumCulled = false;
  group.add(strings);

  target.add(group);
  return { group, marker, label, axis, strings };
}

function addWedge(target, color) {
  const positions = new Float32Array(WEDGE_SEGMENTS * 9);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 1;
  target.add(mesh);

  const outlinePositions = new Float32Array((WEDGE_SEGMENTS + 3) * 3);
  const outlineGeometry = new THREE.BufferGeometry();
  outlineGeometry.setAttribute('position', new THREE.BufferAttribute(outlinePositions, 3));
  outlineGeometry.setDrawRange(0, 0);
  const outline = new THREE.Line(
    outlineGeometry,
    new THREE.LineBasicMaterial({ color: 0xfff6ea, transparent: true, opacity: 0.9 }),
  );
  outline.frustumCulled = false;
  outline.visible = false;
  target.add(outline);

  const anchor = new THREE.Group();
  anchor.visible = false;
  target.add(anchor);
  return { mesh, outline, anchor, positions, outlinePositions };
}

function addLabel(text, parent) {
  const element = document.createElement('div');
  element.className = 'label';
  element.textContent = text;
  const object = new CSS2DObject(element);
  parent.add(object);
  return object;
}

function applyPlanet2Shape() {
  setOrbit(body2.orbit, planet2.a, planet2.e);
  clearTrail(body2.trail);
}

function setOrbit(line, semiMajorAxis, eccentricity) {
  const positions = orbitPolyline(semiMajorAxis, eccentricity, ORBIT_SEGMENTS, 0.02);
  line.geometry.setPositions(positions);
  line.computeLineDistances();
}

function placeBody(body, spec, time) {
  const mean = spec.phase + meanAnomalyAdvance(spec.a, time);
  const state = stateAt(spec.a, spec.e, mean);
  body.mesh.position.set(state.x, 0, state.z);

  const radiusPositions = body.radiusLine.geometry.attributes.position;
  radiusPositions.setXYZ(0, 0, 0.05, 0);
  radiusPositions.setXYZ(1, state.x, 0.05, state.z);
  radiusPositions.needsUpdate = true;

  const length = Math.min(Math.max(state.speed * 0.48, 0.15), 4.2);
  aimArrow(body, state, length);
  pushTrail(body.trail, state.x, state.z, time);
  return state;
}

const arrowDirection = new THREE.Vector3();

function aimArrow(body, state, length) {
  arrowDirection.set(state.vx, 0, state.vz);
  if (arrowDirection.lengthSq() < 1e-8) return;
  arrowDirection.normalize();
  body.arrow.position.set(state.x, 0.06, state.z);
  body.arrow.setDirection(arrowDirection);
  const head = Math.min(0.38, length * 0.28);
  body.arrow.setLength(length, head, head * 0.55);
}

function meanAnomalyAdvance(semiMajorAxis, time) {
  return (TAU * time) / period(semiMajorAxis);
}

function updateFocusHelpers(helpers, spec, state) {
  const focus = emptyFocusX(spec.a, spec.e);
  const separated = Math.abs(focus) > 0.4;
  helpers.marker.visible = separated;
  helpers.label.element.style.visibility = separated ? 'visible' : 'hidden';
  helpers.marker.position.set(focus, 0, 0);

  const peri = spec.a * (1 - spec.e);
  const ap = -spec.a * (1 + spec.e);
  const axis = helpers.axis.geometry.attributes.position;
  axis.setXYZ(0, peri, 0.03, 0);
  axis.setXYZ(1, ap, 0.03, 0);
  axis.needsUpdate = true;
  helpers.axis.computeLineDistances();

  const strings = helpers.strings.geometry.attributes.position;
  strings.setXYZ(0, 0, 0.06, 0);
  strings.setXYZ(1, state.x, 0.06, state.z);
  strings.setXYZ(2, focus, 0.06, 0);
  strings.needsUpdate = true;
}

function updateFocusReadout(state1, state2) {
  focusReadout.textContent = [
    focusSentence('Planet 1', PLANET1, state1),
    focusSentence('Planet 2', planet2, state2),
  ].join('\n');
}

function focusSentence(name, spec, state) {
  const focus = emptyFocusX(spec.a, spec.e);
  const toSun = state.r;
  const toEmpty = Math.hypot(state.x - focus, state.z);
  const sum = toSun + toEmpty;
  const twoA = 2 * spec.a;
  if (Math.abs(focus) <= 0.4) {
    return `${name} is nearly a circle, so both foci sit on the Sun and 2a = ${twoA.toFixed(2)}.`;
  }
  return `${name}: distance to the Sun + distance to the empty focus = ${sum.toFixed(2)}, and 2a = ${twoA.toFixed(2)}.`;
}

function updateWedges() {
  const fraction = sweepFraction(sweepTime);
  const span = WEDGE_MEAN * fraction;
  const periStart = -WEDGE_MEAN / 2;
  const apStart = Math.PI - WEDGE_MEAN / 2;
  fillWedge(wedges.peri, planet2, periStart, periStart + span);
  fillWedge(wedges.ap, planet2, apStart, apStart + span);
  placeWedgeLabel(wedgeLabels.peri, planet2, 0, 1);
  placeWedgeLabel(wedgeLabels.ap, planet2, Math.PI, -1);

  const expected = analyticSectorArea(planet2.a, planet2.e, span);
  if (fraction < 0.02) {
    setText(areaReadout, 'The wedges are about to sweep the same tenth of planet 2’s year.');
  } else if (fraction < 0.999) {
    setText(
      areaReadout,
      `Swept so far in each wedge: ${expected.toFixed(2)}. Same time, so the areas stay equal.`,
    );
  } else {
    setText(
      areaReadout,
      `Area of each wedge: ${expected.toFixed(2)}. Same tenth of a year, same area.`,
    );
  }
}

function sweepFraction(time) {
  const cycle = SWEEP_FILL + SWEEP_HOLD;
  const u = time % cycle;
  if (u < SWEEP_FILL) return u / SWEEP_FILL;
  return 1;
}

function fillWedge(wedge, spec, meanStart, meanEnd) {
  const segments = Math.max(2, Math.round(WEDGE_SEGMENTS * Math.max((meanEnd - meanStart) / WEDGE_MEAN, 0.04)));
  const points = arcPoints(spec.a, spec.e, meanStart, meanEnd, segments);
  const attribute = wedge.mesh.geometry.attributes.position;
  let vertex = 0;
  for (let i = 0; i < points.length - 1 && vertex / 3 < WEDGE_SEGMENTS * 3; i++) {
    attribute.setXYZ(vertex, 0, 0.015, 0);
    attribute.setXYZ(vertex + 1, points[i].x, 0.015, points[i].z);
    attribute.setXYZ(vertex + 2, points[i + 1].x, 0.015, points[i + 1].z);
    vertex += 3;
  }
  attribute.needsUpdate = true;
  wedge.mesh.geometry.setDrawRange(0, vertex);

  const outline = wedge.outline.geometry.attributes.position;
  outline.setXYZ(0, 0, 0.03, 0);
  for (let i = 0; i < points.length; i++) {
    outline.setXYZ(i + 1, points[i].x, 0.03, points[i].z);
  }
  outline.setXYZ(points.length + 1, 0, 0.03, 0);
  outline.needsUpdate = true;
  wedge.outline.geometry.setDrawRange(0, points.length + 2);
  return points;
}

function placeWedgeLabel(label, spec, meanAnomaly, outward) {
  const state = stateAt(spec.a, spec.e, meanAnomaly);
  const radial = Math.hypot(state.x, state.z) || 1;
  const lift = 0.55 * outward;
  label.position.set(state.x + (state.x / radial) * lift, 0.2, state.z + (state.z / radial) * 0.15);
}

function updateSpeedReadout(state) {
  const slowest = visViva(planet2.a, planet2.a * (1 + planet2.e));
  const times = state.speed / slowest;
  setText(speedNow, `${times.toFixed(1)}×`);
}

function updateLaw3() {
  const t1 = period(PLANET1.a);
  const t2 = period(planet2.a);
  const ratio1 = periodRatio(PLANET1.a);
  const ratio2 = periodRatio(planet2.a);
  setText(t1Cell, t1.toFixed(2));
  setText(t2Cell, t2.toFixed(2));
  setText(a2Cell, planet2.a.toFixed(2));
  setText(ratio1Cell, ratio1.toFixed(4));
  setText(ratio2Cell, ratio2.toFixed(4));
  const longer = t2 / t1;
  setText(
    yearCompare,
    `Both ratios match. Planet 2’s year is ${longer.toFixed(2)}× planet 1’s year.`,
  );
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

if (renderer.getContext()) requestAnimationFrame(frame);
