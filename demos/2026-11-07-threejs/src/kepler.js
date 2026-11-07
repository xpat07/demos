// Heliocentric coordinates in the orbital plane.
// The Sun is at the origin and perihelion lies on +X.
// Y is up, out of the plane; Z completes a right-handed frame.
// GM = 4π², so the period is T = a^(3/2) and T² / a³ = 1.

export const TAU = Math.PI * 2;
export const GM = TAU * TAU;

export function period(semiMajorAxis) {
  const a = semiMajorAxis;
  return TAU * Math.sqrt((a * a * a) / GM);
}

export function meanMotion(semiMajorAxis) {
  return TAU / period(semiMajorAxis);
}

/** T² / a³. With this choice of GM the value is 1 for every ellipse. */
export function periodRatio(semiMajorAxis) {
  const t = period(semiMajorAxis);
  return (t * t) / (semiMajorAxis ** 3);
}

/**
 * Solve Kepler's equation M = E − e sin E for the eccentric anomaly E.
 * Eccentricity must be in [0, 1). Mean anomaly is radians, any real number.
 */
export function solveKepler(meanAnomaly, eccentricity) {
  let mean = meanAnomaly % TAU;
  if (mean < 0) mean += TAU;
  if (eccentricity <= 1e-10) return mean;

  let eccentric = mean + eccentricity * Math.sin(mean);
  for (let i = 0; i < 20; i++) {
    const sine = Math.sin(eccentric);
    const cosine = Math.cos(eccentric);
    const residual = eccentric - eccentricity * sine - mean;
    const derivative = 1 - eccentricity * cosine;
    const step = residual / derivative;
    eccentric -= step;
    if (Math.abs(step) < 1e-13) return eccentric;
  }

  // Newton did not settle. The function is monotone, so bisection finishes it.
  let lo = 0;
  let hi = TAU;
  let eccentricBisect = mean;
  for (let i = 0; i < 60; i++) {
    eccentricBisect = 0.5 * (lo + hi);
    const residual = eccentricBisect - eccentricity * Math.sin(eccentricBisect) - mean;
    if (Math.abs(residual) < 1e-13) break;
    if (residual > 0) hi = eccentricBisect;
    else lo = eccentricBisect;
  }
  return eccentricBisect;
}

export function stateAt(semiMajorAxis, eccentricity, meanAnomaly) {
  const eccentric = solveKepler(meanAnomaly, eccentricity);
  const semiMinor = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
  const cosE = Math.cos(eccentric);
  const sinE = Math.sin(eccentric);
  const x = semiMajorAxis * (cosE - eccentricity);
  const z = semiMinor * sinE;
  const dEdt = meanMotion(semiMajorAxis) / (1 - eccentricity * cosE);
  const vx = -semiMajorAxis * sinE * dEdt;
  const vz = semiMinor * cosE * dEdt;
  const r = Math.hypot(x, z);
  return {
    eccentric,
    x,
    z,
    vx,
    vz,
    r,
    speed: Math.hypot(vx, vz),
  };
}

export function emptyFocusX(semiMajorAxis, eccentricity) {
  return -2 * semiMajorAxis * eccentricity;
}

export function visViva(semiMajorAxis, radius) {
  return Math.sqrt(GM * (2 / radius - 1 / semiMajorAxis));
}

/** Area swept at the Sun by a mean-anomaly interval. It does not depend on where the interval sits. */
export function analyticSectorArea(semiMajorAxis, eccentricity, deltaMeanAnomaly) {
  const semiMinor = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
  return 0.5 * semiMajorAxis * semiMinor * deltaMeanAnomaly;
}

export function arcPoints(semiMajorAxis, eccentricity, meanStart, meanEnd, segments) {
  const points = new Array(segments + 1);
  for (let i = 0; i <= segments; i++) {
    const mean = meanStart + ((meanEnd - meanStart) * i) / segments;
    const state = stateAt(semiMajorAxis, eccentricity, mean);
    points[i] = { x: state.x, z: state.z };
  }
  return points;
}

/** Area of the fan from the Sun (the origin) along an arc. */
export function sectorArea(points) {
  let sum = 0;
  let previousX = 0;
  let previousZ = 0;
  for (let i = 0; i < points.length; i++) {
    const { x, z } = points[i];
    sum += previousX * z - x * previousZ;
    previousX = x;
    previousZ = z;
  }
  return Math.abs(sum) * 0.5;
}

/** Polyline of the ellipse itself, sampled evenly in eccentric anomaly. Closed by repeating the first point. */
export function orbitPolyline(semiMajorAxis, eccentricity, segments, y = 0) {
  const positions = new Array((segments + 1) * 3);
  const semiMinor = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
  for (let i = 0; i <= segments; i++) {
    const eccentric = (TAU * i) / segments;
    const o = i * 3;
    positions[o] = semiMajorAxis * (Math.cos(eccentric) - eccentricity);
    positions[o + 1] = y;
    positions[o + 2] = semiMinor * Math.sin(eccentric);
  }
  return positions;
}
