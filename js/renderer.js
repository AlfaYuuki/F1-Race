import { curveAt, elevationAt } from './track.js';
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
  function box(cx, cy, cz, sx, sy, sz, tint) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy, y1 = cy + sy, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const top = [Math.min(1, tint[0] * 1.2), Math.min(1, tint[1] * 1.2), Math.min(1, tint[2] * 1.2)];
    const side = [tint[0] * .68, tint[1] * .68, tint[2] * .68];
    quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],top);
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],tint);
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],side);
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],side);
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],tint);
  }
  function tree(x, z, size) {
    box(x, 0, z, size * .13, size * .48, size * .13, [.25,.19,.12]);
    triangle([x-size*.42,size*.35,z],[x+size*.42,size*.35,z],[x,size*1.45,z],[.12,.31,.2]);
    triangle([x-size*.32,size*.78,z],[x+size*.32,size*.78,z],[x,size*1.72,z],[.17,.39,.24]);
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
      alpha: false, antialias: false, depth: true, powerPreference: 'low-power',
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

  function addCar(mesh, x, y, z, scale, tint) {
    mesh.box(x, y + .12 * scale, z, 1.8 * scale, .48 * scale, 4.2 * scale, tint);
    mesh.box(x, y + .58 * scale, z + .08 * scale, 1.02 * scale, .42 * scale, 1.5 * scale, [.08,.12,.16]);
    mesh.box(x, y + .14 * scale, z + 2.12 * scale, 2.05 * scale, .12 * scale, .28 * scale, [.88,.88,.82]);
    mesh.box(x, y + .48 * scale, z - 2.08 * scale, 2.0 * scale, .12 * scale, .24 * scale, tint);
    for (const side of [-1, 1]) for (const axle of [-1, 1]) {
      mesh.box(x + side * .96 * scale, y + .04 * scale, z + axle * 1.25 * scale, .34 * scale, .48 * scale, .82 * scale, [.035,.04,.045]);
    }
  }

  function render({ position = 0, playerX = 0, speed = 0, speedDelta = 0, lateralVelocity = 0, offRoad = false, running = false, opponents = [], cameraShake = 0, playerColor = '#df3039', dt = 1/60 }) {
    if (lost) return;
    const mesh = createGeometry();
    const roadSegments = touchQuality ? 84 : 118;
    const segmentLength = 4.2;
    const lapDistance = 4563;
    const travelledThisLap = ((position * lapDistance) % lapDistance + lapDistance) % lapDistance;
    // Shift every world segment towards the camera as distance increases. Without
    // this offset the car moves in the physics model but the road appears frozen.
    const scrollOffset = travelledThisLap % segmentLength;
    let centerX = 0;
    const roadPoints = [];

    for (let i = 0; i <= roadSegments; i++) {
      const z = i * segmentLength - scrollOffset;
      const progress = position + z / lapDistance;
      const curve = curveAt(progress);
      centerX += curve * .018;
      const elevation = elevationAt(progress) * 1.5;
      roadPoints.push({ z, x: centerX, y: elevation });
    }

    mesh.quad([-700,-2,-30],[700,-2,-30],[700,-2,520],[-700,-2,520],[.28,.43,.29]);
    for (let i = 0; i < roadSegments; i++) {
      const a = roadPoints[i], b = roadPoints[i+1];
      const leftA = a.x - 5.5, rightA = a.x + 5.5;
      const leftB = b.x - 5.5, rightB = b.x + 5.5;
      const worldSegment = Math.floor(travelledThisLap / segmentLength) + i;
      const roadTint = worldSegment % 2 ? [.19,.21,.23] : [.22,.24,.26];
      mesh.quad([leftA,a.y,a.z],[rightA,a.y,a.z],[rightB,b.y,b.z],[leftB,b.y,b.z],roadTint);
      mesh.quad([leftA-.42,a.y+.025,a.z],[leftA,a.y+.025,a.z],[leftB,b.y+.025,b.z],[leftB-.42,b.y+.025,b.z],i%2?[.88,.85,.78]:[.78,.18,.2]);
      mesh.quad([rightA,a.y+.025,a.z],[rightA+.42,a.y+.025,a.z],[rightB+.42,b.y+.025,b.z],[rightB,b.y+.025,b.z],i%2?[.88,.85,.78]:[.78,.18,.2]);
      if (worldSegment % 9 === 0) {
        const stripeWidth = .12;
        mesh.quad([a.x-stripeWidth,a.y+.035,a.z],[a.x+stripeWidth,a.y+.035,a.z],[b.x+stripeWidth,b.y+.035,b.z],[b.x-stripeWidth,b.y+.035,b.z],[.82,.82,.75]);
      }
      if (worldSegment % 7 === 0 && i > 4 && worldSegment % 21 !== 0) {
        mesh.tree(a.x - 9 - (i%3), a.z, 2.8 + (i%4)*.2);
        mesh.tree(a.x + 10 + (i%4), a.z, 3.1);
      }
      // Grandstands on BOTH sides, with visible coloured spectator rows.
      if (worldSegment % 21 === 0 && i > 8) {
        for (const side of [-1, 1]) {
          const sx = a.x + side * 10.2;
          mesh.box(sx, .05, a.z, 5.8, 1.05, 12, [.25,.29,.32]);
          mesh.box(sx, 1.12, a.z, 6.1, .18, 12.4, [.72,.74,.76]);
          for (let row = 0; row < 3; row++) {
            for (let seat = 0; seat < 9; seat++) {
              const crowdX = sx + (seat - (touchQuality ? 2.5 : 4)) * .57;
              const crowdY = 1.35 + row * .34;
              const crowdZ = a.z + (row - 1) * 2.2;
              const palette = [[.82,.2,.19],[.88,.78,.55],[.16,.3,.48],[.83,.83,.82],[.22,.55,.39]];
              mesh.box(crowdX, crowdY, crowdZ, .28, .3, .28, palette[(seat + row + i) % palette.length]);
            }
          }
          mesh.box(sx, 2.55, a.z - 4.9, 6.25, .12, .22, [.85,.13,.16]);
        }
      }
      if (worldSegment % 28 === 0 && i > 8) {
        mesh.box(a.x + 15, .05, a.z, 5.8, 2.0, 8.5, [.22,.27,.3]);
        mesh.box(a.x + 15, 2.08, a.z, 6.2, .18, 8.8, [.76,.12,.14]);
      }
    }

    // Checkered start/finish stripe: visible at the start, then again as the
    // player approaches the lap line. It is the same physical line each lap.
    let lineZ = travelledThisLap < 28
      ? -travelledThisLap - scrollOffset
      : lapDistance - travelledThisLap - scrollOffset;
    if (lineZ > -22 && lineZ < 500) {
      const nearest = clamp(Math.round((lineZ + scrollOffset) / segmentLength), 0, roadSegments);
      const lineRoad = roadPoints[nearest];
      const tileWidth = 11 / 12;
      for (let tile = 0; tile < 12; tile++) {
        const x0 = lineRoad.x - 5.5 + tile * tileWidth;
        const x1 = x0 + tileWidth;
        const tint = tile % 2 ? [.08,.09,.1] : [.96,.96,.91];
        mesh.quad([x0,lineRoad.y+.055,lineZ-.48],[x1,lineRoad.y+.055,lineZ-.48],
          [x1,lineRoad.y+.055,lineZ+.48],[x0,lineRoad.y+.055,lineZ+.48],tint);
      }
    }

    mesh.mountain(470, 48, 86, 86);
    mesh.mountain(500, -95, 65, 54);

    for (const driver of opponents) {
      if (!isForwardOpponent(driver.relativeDistance)) continue;
      const z = opponentWorldZ(driver.relativeDistance);
      const nearest = Math.min(roadSegments, Math.max(0, Math.round(z / segmentLength)));
      const road = roadPoints[nearest];
      const lane = driver.currentLane ?? driver.lane ?? 0;
      addCar(mesh, road.x + lane * 4.0, road.y, z, .78, hexColor(driver.color));
    }

    const playerRoad = roadPoints[3];
    const trackCenterX = playerRoad.x;
    const playerWorldX = trackCenterX + playerX * 4.2;
    const suspensionBob = running ? Math.sin(position * 4563 * .72) * Math.min(.075, speed / 330 * .075) : 0;
    addCar(mesh, playerWorldX, playerRoad.y + suspensionBob, 9, 1, offRoad ? [.72,.25,.12] : hexColor(playerColor));

    // Rubber trails appear behind the rear tyres when lateral grip is being used.
    if (running && Math.abs(lateralVelocity) > .48) {
      const markStrength = clamp((Math.abs(lateralVelocity) - .42) * .24, .035, .16);
      for (const side of [-1, 1]) {
        const markX = playerWorldX + side * .72;
        mesh.quad([markX-.12,playerRoad.y+.045,4.2],[markX+.12,playerRoad.y+.045,4.2],
          [markX+.12,playerRoad.y+.045,7.2],[markX-.12,playerRoad.y+.045,7.2],
          [.055,.06,.065].map(channel => channel * (1-markStrength)));
      }
    }

    // Keep the camera aligned with the circuit, not locked to the player's car.
    // This makes left/right steering visibly move the car across the road.
    const aspect = canvas.width / canvas.height;
    const baseFov = aspect < .8 ? 1.08 : .96;
    const speedFov = clamp(speed / 330, 0, 1) * .12;
    const projection = perspective(baseFov + speedFov, aspect, .1, 1000);
    const followTargetX = trackCenterX + playerX * 1.35;
    const followTargetY = 5.5 + clamp(speed / 330, 0, 1) * .28 - clamp(speedDelta / 180, -1, 1) * .12;
    const followEase = 1 - Math.exp(-Math.max(.001, dt) * 4.2);
    cameraX += (followTargetX - cameraX) * followEase;
    cameraHeight += (followTargetY - cameraHeight) * followEase;
    const eye = [cameraX + cameraShake * .012, cameraHeight, -8];
    const target = [cameraX + (playerWorldX - cameraX) * .42, 1.15, 33];
    const view = lookAt(eye, target, [0,1,0]);
    const viewProjection = multiply(projection, view);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(.43,.59,.68,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(matrixLocation, false, viewProjection);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.colors), gl.DYNAMIC_DRAW);
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
