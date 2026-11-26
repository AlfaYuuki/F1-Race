import { buildRoadPath, pointAt, lateral } from './road-path.js';
import { createRenderer as create2DRenderer } from './renderer2d.js';

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aColor;
uniform mat4 uViewProjection;
varying vec3 vColor;
varying float vDepth;
void main() {
  vec4 viewPosition = uViewProjection * vec4(aPosition, 1.0);
  gl_Position = viewPosition;
  vColor = aColor;
  vDepth = gl_Position.w;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vColor;
varying float vDepth;
void main() {
  float fog = clamp((vDepth - 170.0) / 520.0, 0.0, 0.72);
  vec3 sky = vec3(0.43, 0.59, 0.68);
  gl_FragColor = vec4(mix(vColor, sky, fog), 1.0);
}`;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function isForwardOpponent(relativeDistance) {
  const distance = Number(relativeDistance);
  return Number.isFinite(distance) && distance >= 0 && distance < 235;
}

export function opponentWorldZ(relativeDistance) {
  return clamp(Number(relativeDistance) * 1.12 + 9, -18, 290);
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function lookAt(eye, center, up) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let length = Math.hypot(zx, zy, zz) || 1;
  zx /= length; zy /= length; zz /= length;
  // Camera looks toward +Z in this world. Build its right axis as
  // cross(view direction, world up); the previous cross order mirrored X,
  // making right steering render on the left side of the screen.
  let xx = zy * up[2] - zz * up[1];
  let xy = zz * up[0] - zx * up[2];
  let xz = zx * up[1] - zy * up[0];
  length = Math.hypot(xx, xy, xz) || 1;
  xx /= length; xy /= length; xz /= length;
  const yx = xy * zz - xz * zy, yy = xz * zx - xx * zz, yz = xx * zy - xy * zx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || 'Unable to compile 3D shader');
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Unable to link 3D renderer');
  }
  return program;
}

function createGeometry() {
  const positions = [], colors = [];
  const color = hex => hex;
  function vertex(x, y, z, tint) {
    positions.push(x, y, z);
    colors.push(tint[0], tint[1], tint[2]);
  }
  function triangle(a, b, c, tint) {
    vertex(...a, tint); vertex(...b, tint); vertex(...c, tint);
  }
  function quad(a, b, c, d, tint) {
    triangle(a, b, c, tint); triangle(a, c, d, tint);
  }
  function box(cx, cy, cz, sx, sy, sz, tint, yaw = 0) {
    const top = [Math.min(1, tint[0] * 1.2), Math.min(1, tint[1] * 1.2), Math.min(1, tint[2] * 1.2)];
    const side = [tint[0] * .68, tint[1] * .68, tint[2] * .68];
    const c = Math.cos(yaw), n = Math.sin(yaw), hx = sx / 2, hz = sz / 2, y0 = cy, y1 = cy + sy;
    // Local (right, forward) offsets are rotated by the heading so the box follows the road.
    const at = (lx, lz, y) => [cx + lx * c + lz * n, y, cz - lx * n + lz * c];
    quad(at(-hx,-hz,y1), at(hx,-hz,y1), at(hx,hz,y1), at(-hx,hz,y1), top);
    quad(at(-hx,hz,y0), at(hx,hz,y0), at(hx,hz,y1), at(-hx,hz,y1), tint);
    quad(at(hx,-hz,y0), at(-hx,-hz,y0), at(-hx,-hz,y1), at(hx,-hz,y1), side);
    quad(at(-hx,-hz,y0), at(-hx,hz,y0), at(-hx,hz,y1), at(-hx,-hz,y1), side);
    quad(at(hx,hz,y0), at(hx,-hz,y0), at(hx,-hz,y1), at(hx,hz,y1), tint);
  }
  function tree(x, z, size, y = 0) {
    box(x, y, z, size * .13, size * .48, size * .13, [.25,.19,.12]);
    triangle([x-size*.42,y+size*.35,z],[x+size*.42,y+size*.35,z],[x,y+size*1.45,z],[.12,.31,.2]);
    triangle([x-size*.32,y+size*.78,z],[x+size*.32,y+size*.78,z],[x,y+size*1.72,z],[.17,.39,.24]);
  }
  function mountain(z, x, width, height) {
    triangle([x-width,z===0?0:0,z],[x+width,0,z],[x,height,z],[.54,.63,.65]);
    triangle([x-width*.17,height*.76,z-.15],[x,height,z],[x+width*.19,height*.72,z-.15],[.9,.94,.91]);
    triangle([x-width*.17,height*.76,z-.15],[x,height,z],[x-width*.42,height*.43,z-.1],[.75,.81,.8]);
  }
  return { positions, colors, vertex, triangle, quad, box, tree, mountain };
}

export function createRenderer(canvas) {
  let gl;
  try {
    gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, depth: true, powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    }) || canvas.getContext('experimental-webgl');
  } catch { gl = null; }
  if (!gl) return create2DRenderer(canvas);

  function fallbackRenderer() {
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.setAttribute('aria-hidden', 'true');
    fallbackCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    canvas.parentNode?.insertBefore(fallbackCanvas, canvas.nextSibling);
    return create2DRenderer(fallbackCanvas);
  }

  let program, positionBuffer, colorBuffer, positionLocation, colorLocation, matrixLocation;
  try {
    program = createProgram(gl);
    positionBuffer = gl.createBuffer();
    colorBuffer = gl.createBuffer();
    positionLocation = gl.getAttribLocation(program, 'aPosition');
    colorLocation = gl.getAttribLocation(program, 'aColor');
    matrixLocation = gl.getUniformLocation(program, 'uViewProjection');
  } catch (error) {
    console.warn('3D renderer unavailable; using 2D fallback.', error);
    return fallbackRenderer();
  }

  let width = 1, height = 1, dpr = 1, lost = false, impactFlash = 0, cameraX = 0, cameraHeight = 5.5;
  // Reuse CPU-side geometry and upload buffers: allocating thousands of arrays and
  // reallocating two GPU buffers on every animation frame caused avoidable GC/GPU stalls.
  const mesh = createGeometry();
  let positionUpload = new Float32Array(0), colorUpload = new Float32Array(0);
  let positionCapacity = 0, colorCapacity = 0;
  function uploadDynamicBuffer(target, source, upload, capacity) {
    if (source.length > capacity) {
      capacity = 2 ** Math.ceil(Math.log2(source.length));
      upload = new Float32Array(capacity);
      gl.bindBuffer(gl.ARRAY_BUFFER, target);
      gl.bufferData(gl.ARRAY_BUFFER, upload.byteLength, gl.DYNAMIC_DRAW);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, target);
    }
    upload.set(source);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, upload.subarray(0, source.length));
    return { upload, capacity };
  }
  const touchQuality = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, touchQuality ? 1.2 : 1.5);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const maxDimension = 1920;
    const pixelBudgetScale = Math.sqrt(1500000 / Math.max(1, width * height));
    const scale = Math.min(dpr, maxDimension / Math.max(width, height), pixelBudgetScale);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // Cars are built in local space and rotated by `yaw` (road heading plus any drift angle).
  function addCar(mesh, x, y, z, scale, tint, yaw = 0) {
    const c = Math.cos(yaw), n = Math.sin(yaw);
    const place = (lx, lz) => [x + lx * c + lz * n, z - lx * n + lz * c];
    const part = (lx, ly, lz, sx, sy, sz, color) => { const [px, pz] = place(lx * scale, lz * scale); mesh.box(px, y + ly * scale, pz, sx * scale, sy * scale, sz * scale, color, yaw); };
    part(0, .12, 0, 1.8, .48, 4.2, tint);
    part(0, .58, .08, 1.02, .42, 1.5, [.08,.12,.16]);
    part(0, .14, 2.12, 2.05, .12, .28, [.88,.88,.82]);
    part(0, .48, -2.08, 2.0, .12, .24, tint);
    for (const side of [-1, 1]) for (const axle of [-1, 1]) part(side * .96, .04, axle * 1.25, .34, .48, .82, [.035,.04,.045]);
  }

  function render({ position = 0, playerX = 0, speed = 0, speedDelta = 0, lateralVelocity = 0, offRoad = false, running = false, opponents = [], pitLane = false, cameraShake = 0, playerColor = '#df3039', driftAngle = 0, dt = 1/60 }) {
    if (lost) return;
    mesh.positions.length = 0;
    mesh.colors.length = 0;
    const roadSegments = touchQuality ? 64 : 118;
    const segmentLength = 4.2;
    const lapDistance = 4563;
    const path = buildRoadPath({ position, lapDistance, segments: roadSegments, segmentLength });
    const roadPoints = path.points;
    const travelledThisLap = path.travelled;
    const half = 5.5;
    const edge = (p, off, dy = 0) => [p.x + p.nx * off, p.y + dy, p.z + p.nz * off];

    mesh.quad([-900,-2.5,-60],[900,-2.5,-60],[900,-2.5,700],[-900,-2.5,700],[.28,.43,.29]);
    for (let i = 0; i < roadSegments; i++) {
      const a = roadPoints[i], b = roadPoints[i+1];
      const worldSegment = Math.floor(travelledThisLap / segmentLength) + i;
      const roadTint = worldSegment % 2 ? [.19,.21,.23] : [.22,.24,.26];
      const kerb = i % 2 ? [.88,.85,.78] : [.78,.18,.2];
      // Grass verge follows the road so hills and bends read clearly against the ground plane.
      const grass = worldSegment % 2 ? [.27,.45,.29] : [.31,.5,.32];
      mesh.quad(edge(a,-half-.42,-.01), edge(a,-half-30,-.02), edge(b,-half-30,-.02), edge(b,-half-.42,-.01), grass);
      mesh.quad(edge(a,half+.42,-.01), edge(b,half+.42,-.01), edge(b,half+30,-.02), edge(a,half+30,-.02), grass);
      mesh.quad(edge(a,-half), edge(a,half), edge(b,half), edge(b,-half), roadTint);
      // Dedicated right-side pit lane, separated from the racing surface by a solid line.
      mesh.quad(edge(a,half+.85),edge(a,half+4.55),edge(b,half+4.55),edge(b,half+.85),[.13,.16,.19]);
      mesh.quad(edge(a,half+.72,.04),edge(a,half+.88,.04),edge(b,half+.88,.04),edge(b,half+.72,.04),[.94,.91,.82]);
      mesh.quad(edge(a,half+4.5,.04),edge(a,half+4.66,.04),edge(b,half+4.66,.04),edge(b,half+4.5,.04),[.94,.91,.82]);
      if(worldSegment%30===0){
        const bay=half+2.7;
        mesh.quad(edge(a,bay-.72,.06),edge(a,bay+.72,.06),edge(b,bay+.72,.06),edge(b,bay-.72,.06),[.82,.84,.84]);
      }
      mesh.quad(edge(a,-half-.42,.025), edge(a,-half,.025), edge(b,-half,.025), edge(b,-half-.42,.025), kerb);
      mesh.quad(edge(a,half,.025), edge(a,half+.42,.025), edge(b,half+.42,.025), edge(b,half,.025), kerb);
      if (worldSegment % 9 === 0) {
        const stripeWidth = .12;
        mesh.quad(edge(a,-stripeWidth,.035), edge(a,stripeWidth,.035), edge(b,stripeWidth,.035), edge(b,-stripeWidth,.035), [.82,.82,.75]);
      }
      if (worldSegment % (touchQuality ? 9 : 7) === 0 && i > 4 && worldSegment % 21 !== 0) {
        const l = edge(a, -9 - (i%3)), r = edge(a, 10 + (i%4));
        mesh.tree(l[0], l[2], 2.8 + (i%4)*.2, l[1]);
        mesh.tree(r[0], r[2], 3.1, r[1]);
      }
      // Grandstands on BOTH sides, rotated to follow the bend.
      if (worldSegment % (touchQuality ? 28 : 21) === 0 && i > 8) {
        for (const side of [-1, 1]) {
          const base = edge(a, side * 10.2);
          const put = (lx, lz) => [base[0] + a.nx * lx + a.dx * lz, base[2] + a.nz * lx + a.dz * lz];
          const stand = (lx, ly, lz, sx, sy, sz, tint) => { const [px, pz] = put(lx, lz); mesh.box(px, base[1] + ly, pz, sx, sy, sz, tint, a.h); };
          stand(0, .05, 0, 5.8, 1.05, 12, [.25,.29,.32]);
          stand(0, 1.12, 0, 6.1, .18, 12.4, [.72,.74,.76]);
          for (let row = 0; row < (touchQuality ? 2 : 3); row++) {
            for (let seat = 0; seat < (touchQuality ? 5 : 9); seat++) {
              const palette = [[.82,.2,.19],[.88,.78,.55],[.16,.3,.48],[.83,.83,.82],[.22,.55,.39]];
              stand((seat - (touchQuality ? 2 : 4)) * .72, 1.35 + row * .34, (row - 1) * 2.2, .28, .3, .28, palette[(seat + row + i) % palette.length]);
            }
          }
          stand(0, 2.55, -4.9, 6.25, .12, .22, [.85,.13,.16]);
        }
      }
      if (worldSegment % (touchQuality ? 35 : 28) === 0 && i > 8) {
        const base = edge(a, 15);
        mesh.box(base[0], base[1] + .05, base[2], 5.8, 2.0, 8.5, [.22,.27,.3], a.h);
        mesh.box(base[0], base[1] + 2.08, base[2], 6.2, .18, 8.8, [.76,.12,.14], a.h);
      }
    }

    // Checkered start/finish stripe, drawn along the road so it bends with the circuit.
    const lineS = travelledThisLap < 28 ? -travelledThisLap : lapDistance - travelledThisLap;
    if (lineS > -22 && lineS < 480) {
      const lp = pointAt(path, lineS);
      const tileWidth = 11 / 12;
      for (let tile = 0; tile < 12; tile++) {
        const o0 = -half + tile * tileWidth, o1 = o0 + tileWidth;
        const tint = tile % 2 ? [.08,.09,.1] : [.96,.96,.91];
        const f = .48;
        const pt = (o, d) => [lp.x + lp.nx * o + lp.dx * d, lp.y + .055, lp.z + lp.nz * o + lp.dz * d];
        mesh.quad(pt(o0,-f), pt(o1,-f), pt(o1,f), pt(o0,f), tint);
      }
    }

    // Distant mountains sit in a fixed backdrop but slide against the road heading,
    // which sells the sensation of the whole circuit turning.
    const farHeading = roadPoints[Math.min(roadSegments, 60)].h;
    mesh.mountain(470, 48 - farHeading * 160, 86, 86);
    mesh.mountain(500, -95 - farHeading * 160, 65, 54);

    for (const driver of opponents) {
      if (!isForwardOpponent(driver.relativeDistance)) continue;
      const z = opponentWorldZ(driver.relativeDistance);
      const road = pointAt(path, z);
      const lane = driver.currentLane ?? driver.lane ?? 0;
      const pos = lateral(road, driver.pitPhase ? 8.2 : lane * 4.0);
      addCar(mesh, pos[0], road.y, pos[1], .78, hexColor(driver.color), road.h);
    }

    const playerRoad = pointAt(path, 9);
    const trackCenterX = playerRoad.x;
    const playerWorldX = trackCenterX + (pitLane ? 8.2 : playerX * 4.2);
    const suspensionBob = running ? Math.sin(position * 4563 * .72) * Math.min(.075, speed / 330 * .075) : 0;
    const carYaw = clamp(driftAngle, -.9, .9);
    addCar(mesh, playerWorldX, playerRoad.y + suspensionBob, 9, 1, offRoad ? [.72,.25,.12] : hexColor(playerColor), carYaw);

    // Rubber trails appear behind the rear tyres when lateral grip is being used.
    if (running && (Math.abs(lateralVelocity) > .48 || Math.abs(driftAngle) > .1)) {
      const markStrength = clamp((Math.abs(lateralVelocity) - .42) * .24 + Math.abs(driftAngle) * .3, .035, .22);
      for (const side of [-1, 1]) {
        const markX = playerWorldX + side * .72;
        mesh.quad([markX-.12,playerRoad.y+.045,4.2],[markX+.12,playerRoad.y+.045,4.2],
          [markX+.12,playerRoad.y+.045,7.2],[markX-.12,playerRoad.y+.045,7.2],
          [.055,.06,.065].map(channel => channel * (1-markStrength)));
      }
    }
    // Tyre smoke while the car is sliding: soft grey puffs trailing the rear wheels.
    if (running && Math.abs(driftAngle) > .12 && speed > 60) {
      const intensity = clamp((Math.abs(driftAngle) - .1) / .4, 0, 1);
      const sc = Math.cos(carYaw), sn = Math.sin(carYaw);
      for (let puff = 0; puff < 9; puff++) {
        const age = (puff + (position * 4563 * .35) % 1) / 9;
        const side = puff % 2 ? 1 : -1;
        const lx = side * .8 + Math.sin(puff * 12.9898 + position * 40) * .35, lz = -2.6 - age * 7;
        const px = playerWorldX + lx * sc + lz * sn, pz = 9 - lx * sn + lz * sc;
        const size = (.22 + age * .85) * (.55 + intensity * .5);
        const shade = .62 - age * .08;
        mesh.box(px, playerRoad.y + .08 + age * .6, pz, size, size * .55, size, [shade, shade + .01, shade + .03], carYaw);
      }
    }

    // Keep the camera aligned with the circuit, not locked to the player's car.
    // It leans into bends, looks ahead along the road and swings with a drift.
    const aspect = canvas.width / canvas.height;
    const baseFov = aspect < .8 ? 1.08 : .96;
    const speedFov = clamp(speed / 330, 0, 1) * .12;
    const projection = perspective(baseFov + speedFov, aspect, .1, 1000);
    const followTargetX = trackCenterX + playerX * 1.35;
    const followTargetY = playerRoad.y + 5.5 + clamp(speed / 330, 0, 1) * .28 - clamp(speedDelta / 180, -1, 1) * .12;
    const followEase = 1 - Math.exp(-Math.max(.001, dt) * 4.2);
    cameraX += (followTargetX - cameraX) * followEase;
    cameraHeight += (followTargetY - cameraHeight) * followEase;
    const lookAhead = pointAt(path, 48);
    const eye = [cameraX + cameraShake * .012, cameraHeight, -8];
    const target = [cameraX + (playerWorldX - cameraX) * .42 + (lookAhead.x - trackCenterX) * .55 + carYaw * 7, playerRoad.y + 1.15 + (lookAhead.y - playerRoad.y) * .35, 33];
    const view = lookAt(eye, target, [0,1,0]);
    const viewProjection = multiply(projection, view);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(.43,.59,.68,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(matrixLocation, false, viewProjection);

    const positionResult = uploadDynamicBuffer(positionBuffer, mesh.positions, positionUpload, positionCapacity);
    positionUpload = positionResult.upload; positionCapacity = positionResult.capacity;
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    const colorResult = uploadDynamicBuffer(colorBuffer, mesh.colors, colorUpload, colorCapacity);
    colorUpload = colorResult.upload; colorCapacity = colorResult.capacity;
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.positions.length / 3);

    if (impactFlash > 0) impactFlash = Math.max(0, impactFlash - .035);
  }

  function hexColor(hex) {
    const value = Number.parseInt(String(hex).replace('#',''), 16);
    return [((value >> 16) & 255)/255, ((value >> 8) & 255)/255, (value & 255)/255];
  }
  function triggerImpact() { impactFlash = 1; }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { window.location.reload(); });
  window.addEventListener('resize', resize, { passive: true });
  resize();
  return { render, resize, triggerImpact, mode: 'webgl-3d' };
}
