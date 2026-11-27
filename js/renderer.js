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
    vertex(a[0], a[1], a[2], tint); vertex(b[0], b[1], b[2], tint); vertex(c[0], c[1], c[2], tint);
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
  // Adaptive resolution: if frames keep taking longer than ~24 ms the canvas is rendered at a
  // lower pixel density (HUD stays crisp); when there is headroom it climbs back up.
  const QUALITY_STEPS = [1, .8, .64, .5];
  let qualityLevel = 0, qualityScale = 1, slowFrames = 0, fastFrames = 0, lastFrameAt = 0;
  function adaptQuality(now) {
    const delta = lastFrameAt ? now - lastFrameAt : 16;
    lastFrameAt = now;
    if (delta > 250) { slowFrames = fastFrames = 0; return; } // tab switch / pause, not load
    if (delta > 24) { slowFrames++; fastFrames = 0; } else if (delta < 18.5) { fastFrames++; slowFrames = Math.max(0, slowFrames - 1); }
    let next = qualityLevel;
    if (slowFrames >= 45 && qualityLevel < QUALITY_STEPS.length - 1) next++;
    else if (fastFrames >= 600 && qualityLevel > 0) next--;
    if (next !== qualityLevel) {
      qualityLevel = next; qualityScale = QUALITY_STEPS[next]; slowFrames = fastFrames = 0;
      resize();
    }
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, touchQuality ? 1.2 : 1.5);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const maxDimension = 1920;
    const pixelBudgetScale = Math.sqrt(1500000 / Math.max(1, width * height));
    const scale = Math.min(dpr, maxDimension / Math.max(width, height), pixelBudgetScale) * qualityScale;
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // Cars are assembled from layered aero surfaces and animated 12-sided wheel meshes.
  function addCar(mesh, x, y, z, scale, tint, yaw = 0, wheelRotation = 0, suspension = 0) {
    const c = Math.cos(yaw), n = Math.sin(yaw);
    const place = (lx, lz) => [x + lx * c + lz * n, z - lx * n + lz * c];
    const part = (lx, ly, lz, sx, sy, sz, color) => {
      const [px, pz] = place(lx * scale, lz * scale);
      mesh.box(px, y + (ly + suspension) * scale, pz, sx * scale, sy * scale, sz * scale, color, yaw);
    };
    part(0, .12, 0, 1.72, .36, 3.75, tint);
    part(0, .5, .08, .92, .42, 1.42, [.055,.085,.12]);
    part(0, .12, 1.95, 2.1, .12, .34, [.9,.91,.88]);
    part(0, .5, -1.95, 1.95, .13, .26, tint);
    part(0, .25, .55, 1.95, .25, 1.35, tint);
    part(0, .68, -.95, .08, .08, 1.75, [.22,.25,.28]);
    part(-.55, .69, -.12, .08, .08, .9, [.22,.25,.28]);
    part(.55, .69, -.12, .08, .08, .9, [.22,.25,.28]);
    const noseA=place(-.24*scale,1.3*scale),noseB=place(.24*scale,1.3*scale),noseTip=place(0,2.15*scale);
    mesh.triangle([noseA[0],y+.25*scale,noseA[1]],[noseB[0],y+.25*scale,noseB[1]],[noseTip[0],y+.18*scale,noseTip[1]],[Math.min(1,tint[0]*1.18),Math.min(1,tint[1]*1.18),Math.min(1,tint[2]*1.18)]);
    function wheel(lx,lz) {
      const radius=.34*scale, thickness=.25*scale, centerY=y+(.04+suspension)*scale;
      const [centerX,centerZ]=place(lx*scale,lz*scale);
      const ring=[];
      for(let i=0;i<12;i++){
        const angle=i*Math.PI/6+wheelRotation;
        const [px,pz]=place(lx*scale,(lz+Math.sin(angle)*.34)*scale);
        ring.push([px,centerY+Math.cos(angle)*radius,pz]);
      }
      for(let i=0;i<12;i++){
        const a=ring[i],b=ring[(i+1)%12];
        const [ax0,az0]=place((lx-.125)*scale,(lz+Math.sin(i*Math.PI/6+wheelRotation)*.34)*scale);
        const [ax1,az1]=place((lx+.125)*scale,(lz+Math.sin(i*Math.PI/6+wheelRotation)*.34)*scale);
        const [bx0,bz0]=place((lx-.125)*scale,(lz+Math.sin((i+1)*Math.PI/6+wheelRotation)*.34)*scale);
        const [bx1,bz1]=place((lx+.125)*scale,(lz+Math.sin((i+1)*Math.PI/6+wheelRotation)*.34)*scale);
        mesh.quad([ax0,a[1],az0],[ax1,a[1],az1],[bx1,b[1],bz1],[bx0,b[1],bz0],[.025,.03,.035]);
        for(const side of [-1,1]){
          const faceX=place((lx+side*.126)*scale,lz*scale)[0];
          mesh.triangle([faceX,centerY,centerZ],[faceX,a[1],a[2]],[faceX,b[1],b[2]],[.09,.105,.11]);
        }
      }
      const hub=place((lx+.13)*scale,lz*scale);
      for(let spoke=0;spoke<6;spoke++){
        const a=spoke*Math.PI/3+wheelRotation, b=a+.12;
        const p0=place((lx+.132)*scale,(lz+Math.sin(a)*.22)*scale);
        const p1=place((lx+.132)*scale,(lz+Math.sin(b)*.22)*scale);
        mesh.triangle([hub[0],centerY,centerZ],[p0[0],centerY+Math.cos(a)*.22*scale,p0[1]],[p1[0],centerY+Math.cos(b)*.22*scale,p1[1]],[.58,.62,.64]);
      }
    }
    for(const side of [-1,1])for(const axle of [-1,1])wheel(side*.96,axle*1.25);
  }

  function render({ position = 0, playerX = 0, speed = 0, speedDelta = 0, lateralVelocity = 0, offRoad = false, running = false, opponents = [], cameraShake = 0, playerColor = '#df3039', driftAngle = 0, weather = {}, finished = false, dt = 1/60 }) {
    if (lost) return;
    adaptQuality(performance.now());
    mesh.positions.length = 0;
    mesh.colors.length = 0;
    const roadSegments = touchQuality ? 64 : 118;
    const segmentLength = 4.2;
    const lapDistance = 4563;
    const path = buildRoadPath({ position, lapDistance, segments: roadSegments, segmentLength });
    const roadPoints = path.points;
    const travelledThisLap = path.travelled;
    const half = 5.5;
    const wetness = clamp(Number(weather.rain) || 0, 0, 1);
    const edge = (p, off, dy = 0) => [p.x + p.nx * off, p.y + dy, p.z + p.nz * off];

    mesh.quad([-900,-2.5,-60],[900,-2.5,-60],[900,-2.5,700],[-900,-2.5,700],[.28,.43,.29]);
    for (let i = 0; i < roadSegments; i++) {
      const a = roadPoints[i], b = roadPoints[i+1];
      const worldSegment = Math.floor(travelledThisLap / segmentLength) + i;
      const baseRoad = worldSegment % 2 ? [.19,.21,.23] : [.22,.24,.26];
      const roadTint = baseRoad.map((channel,index)=>channel*(1-wetness*.3)+(index===2 ? .32 : .29)*wetness*.3);
      const kerb = i % 2 ? [.88,.85,.78] : [.78,.18,.2];
      // Grass verge follows the road so hills and bends read clearly against the ground plane.
      const grass = worldSegment % 2 ? [.27,.45,.29] : [.31,.5,.32];
      const wetGrass = grass.map(channel=>channel*(1-wetness*.12));
      mesh.quad(edge(a,-half-.42,-.01), edge(a,-half-30,-.02), edge(b,-half-30,-.02), edge(b,-half-.42,-.01), wetGrass);
      mesh.quad(edge(a,half+.42,-.01), edge(b,half+.42,-.01), edge(b,half+30,-.02), edge(a,half+30,-.02), wetGrass);
      mesh.quad(edge(a,-half), edge(a,half), edge(b,half), edge(b,-half), roadTint);
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
              stand((seat - (touchQuality ? 2 : 4)) * .72, 1.35 + row * .34 + Math.sin(position * 4563 * .55 + seat * 1.7 + row) * .045, (row - 1) * 2.2, .28, .3, .28, palette[(seat + row + i) % palette.length]);
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
      const pos = lateral(road, lane * 4.0);
      addCar(mesh, pos[0], road.y, pos[1], .78, hexColor(driver.color), road.h, position * 4563 * .65 + Number(driver.relativeDistance || 0) * .08, Math.sin(position * 4563 + Number(driver.relativeDistance || 0)) * .025);
    }

    const playerRoad = pointAt(path, 9);
    const trackCenterX = playerRoad.x;
    const playerWorldX = trackCenterX + playerX * 4.2;
    const suspensionBob = running ? Math.sin(position * 4563 * .72) * Math.min(.11, speed / 330 * .11) : 0;
    const suspensionTravel = running ? Math.sin(position * 4563 * 1.9) * .035 + Math.abs(lateralVelocity) * .018 : 0;
    const carYaw = clamp(driftAngle + lateralVelocity * .012, -.9, .9);
    mesh.quad([playerWorldX-1.35,playerRoad.y+.035,6.7],[playerWorldX+1.35,playerRoad.y+.035,6.7],[playerWorldX+1.35,playerRoad.y+.035,11.5],[playerWorldX-1.35,playerRoad.y+.035,11.5],[.055,.06,.065]);
    addCar(mesh, playerWorldX, playerRoad.y + suspensionBob, 9, 1, offRoad ? [.72,.25,.12] : hexColor(playerColor), carYaw, position * 4563 * .65, suspensionTravel);

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
    const cameraLean = clamp(lateralVelocity * .018 + carYaw * .16, -.42, .42);
    const finishLift = finished ? .8 : 0;
    const eye = [cameraX + cameraShake * .012 + cameraLean * 2.4, cameraHeight + finishLift, -8];
    const target = [cameraX + (playerWorldX - cameraX) * .42 + (lookAhead.x - trackCenterX) * .55 + carYaw * 7 + cameraLean * 4, playerRoad.y + 1.15 + (lookAhead.y - playerRoad.y) * .35 + finishLift * .3, finished ? 40 : 33];
    const view = lookAt(eye, target, [0,1,0]);
    const viewProjection = multiply(projection, view);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    const cloud=clamp((weather.current==='cloudy' ? .24 : 0)+wetness*.52,0,.72);
    gl.clearColor(.43*(1-cloud)+.34*cloud,.59*(1-cloud)+.43*cloud,.68*(1-cloud)+.49*cloud,1);
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
  return { render, resize, triggerImpact, mode: 'webgl-3d', getQuality: () => ({ level: qualityLevel, scale: qualityScale }) };
}
