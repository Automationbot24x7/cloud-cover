/**
 * 3D renderer ("3D diorama, 2D rules").
 *
 * The game still runs entirely on the flat 2D rules in src/core: walls are segments, the cloud is a circle,
 * scoring counts sight lines on the ground plane. This file only draws that state as a night rooftop:
 * world (x, y) maps to three.js (x - 800, height, y - 480), so 1 world unit = 1 scene unit.
 *
 * The searchlight beams are not shadow-mapped lights: they are fans built from the same ray casts the rules
 * use (walls and the cloud stop them), so what looks lit is exactly what a watcher can see.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import floorUrl from '../assets/floor.jpg';
import roofUrl from '../assets/roof.jpg';
import runnerUrl from '../assets/runner.png';
import smokeAUrl from '../assets/smoke-a.png';
import smokeBUrl from '../assets/smoke-b.png';
import { raycast, segmentCircleEntry } from '../core/geom';
import type { Cloud, Segment, Vec } from '../core/types';
import { ARENA, type Level } from './levels';
import { squadPoses } from './squad';
import { TIMING, type GameState } from './state';

const CX = 800;
const CZ = 480;
const EYE_HEIGHT = 46;

const C = {
  bg: 0x040a18,
  fog: 0x061026,
  blue: 0x19a7ff,
  cyan: 0x7fe0ff,
  white: 0xf4f9ff,
  coral: 0xff5a6a,
  mint: 0x3df2b4,
  amber: 0xffc857,
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
const easeOutBack = (t: number): number => {
  const c = 1.9;
  const x = clamp01(t) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

/** Scene position for a world point at the given height. */
function at(p: Vec, h = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x - CX, h, p.y - CZ);
}

/** Small seeded generator so the city looks the same every load. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tileable facade texture: dark panels with a few lit windows. Drawn in code, so it is original. */
function windowTexture(seed: number): THREE.CanvasTexture {
  const rand = seeded(seed);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#0d1a33';
  g.fillRect(0, 0, 256, 256);
  for (let y = 8; y < 256; y += 32) {
    for (let x = 6; x < 256; x += 24) {
      const lit = rand();
      g.fillStyle =
        lit > 0.9 ? 'rgba(255, 214, 150, 0.95)' : lit > 0.78 ? 'rgba(127, 224, 255, 0.75)' : 'rgba(40, 70, 120, 0.55)';
      g.fillRect(x, y, 14, 18);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The crossing lane: chevrons that scroll in the running direction. */
function laneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(127, 224, 255, 0.95)';
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(36, 30);
  g.lineTo(80, 64);
  g.lineTo(36, 98);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft round glow used for blob shadows and the canister halo. */
function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Height of a building, from its footprint, so big blocks read as towers. */
function heightOf(poly: Vec[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const size = Math.sqrt((maxX - minX) * (maxY - minY));
  return 46 + Math.min(54, size * 0.14);
}

/**
 * Ground points a watcher can see across a fan of directions, stopped by walls and by clouds.
 * The fan is centred on `toward` and opens `half` radians to each side.
 */
export function visibilityFan(
  origin: Vec,
  toward: Vec,
  half: number,
  rays: number,
  walls: Segment[],
  clouds: Cloud[],
  maxDistance: number,
): Vec[] {
  const base = Math.atan2(toward.y - origin.y, toward.x - origin.x);
  const points: Vec[] = [];
  for (let i = 0; i <= rays; i++) {
    const ang = base - half + (2 * half * i) / rays;
    const dir = { x: Math.cos(ang), y: Math.sin(ang) };
    const hit = raycast(origin, dir, maxDistance, walls);
    let d = hit ? hit.distance : maxDistance;
    const end = { x: origin.x + dir.x * d, y: origin.y + dir.y * d };
    for (const cloud of clouds) {
      const entry = segmentCircleEntry(origin, end, cloud.center, cloud.radius);
      if (entry) d = Math.min(d, Math.hypot(entry.x - origin.x, entry.y - origin.y));
    }
    points.push({ x: origin.x + dir.x * d, y: origin.y + dir.y * d });
  }
  return points;
}

interface WatcherRig {
  group: THREE.Group;
  head: THREE.Object3D;
  eye: THREE.Mesh;
  floor: THREE.Mesh;
  beam: THREE.Mesh;
  scan: THREE.Mesh;
  light: THREE.PointLight;
}

export interface Renderer3D {
  canvas: HTMLCanvasElement;
  /** Size the drawing buffer to the stage, in CSS pixels. */
  resize(width: number, height: number, dpr: number): void;
  /** Draw one frame of the given state. */
  render(state: GameState): void;
  /** The world point on the ground under a screen position, or null if the ray misses the ground. */
  screenToWorld(clientX: number, clientY: number): Vec | null;
  /** Screen position (CSS pixels relative to the canvas) of a world point at a height. */
  project(p: Vec, h?: number): { x: number; y: number };
}

export function createRenderer3D(canvas: HTMLCanvasElement): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  // A faint studio environment gives the wet floor and metal something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  scene.fog = new THREE.FogExp2(C.fog, 0.00042);

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 10, 9000);
  const BASE_CAM = new THREE.Vector3(0, 1720, 1010);
  const LOOK = new THREE.Vector3(0, 0, 4);
  camera.position.copy(BASE_CAM);
  camera.lookAt(LOOK);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1600, 900), 0.85, 0.55, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const loader = new THREE.TextureLoader();
  const tex = (url: string, repeat?: number): THREE.Texture => {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    t.anisotropy = 8;
    return t;
  };
  const floorTex = tex(floorUrl);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(ARENA.w / 300, ARENA.h / 300);
  const roofTex = tex(roofUrl);
  roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping;
  roofTex.repeat.set(1 / 200, 1 / 200);
  const runnerTex = tex(runnerUrl);
  const smokeTex = [tex(smokeAUrl), tex(smokeBUrl)];
  const shadowTex = glowTexture('rgba(0,0,0,0.65)', 'rgba(0,0,0,0)');
  const haloTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const lane = laneTexture();

  // ---------- Lights: cool moonlight and a dark sky; the warm/red accents come from the scene itself. ----------
  scene.add(new THREE.HemisphereLight(0x6f8fd0, 0x0a1428, 1.25));
  const moon = new THREE.DirectionalLight(0xbcd6ff, 2.6);
  moon.position.set(-520, 1100, -420);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = -900;
  sc.right = 900;
  sc.top = 600;
  sc.bottom = -600;
  sc.near = 100;
  sc.far = 3000;
  moon.shadow.bias = -0.0005;
  scene.add(moon, moon.target);
  // One warm light against the navy: a sodium street glow from the near side.
  const warm = new THREE.DirectionalLight(0xffb070, 0.7);
  warm.position.set(700, 260, 900);
  scene.add(warm);
  const flashLight = new THREE.AmbientLight(0xdfffee, 0);
  scene.add(flashLight);

  // ---------- Static world: the plaza floor and the city around it. ----------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.w, ARENA.h),
    new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0xd8e4ff,
      roughness: 0.42,
      metalness: 0.35,
      emissive: 0x1a3566,
      emissiveMap: floorTex,
      emissiveIntensity: 0.45,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ARENA.x + ARENA.w / 2 - CX, 0, ARENA.y + ARENA.h / 2 - CZ);
  floor.receiveShadow = true;
  scene.add(floor);

  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 4000),
    new THREE.MeshStandardMaterial({ color: 0x050a16, roughness: 1 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -6;
  scene.add(outer);

  // Glowing curb around the play area.
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x0f2244, emissive: C.blue, emissiveIntensity: 0.55 });
  const curb = (w: number, d: number, x: number, z: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), curbMat);
    m.position.set(x, 3, z);
    scene.add(m);
  };
  const ax0 = ARENA.x - CX;
  const ax1 = ARENA.x + ARENA.w - CX;
  const az0 = ARENA.y - CZ;
  const az1 = ARENA.y + ARENA.h - CZ;
  curb(ARENA.w + 8, 4, (ax0 + ax1) / 2, az0);
  curb(ARENA.w + 8, 4, (ax0 + ax1) / 2, az1);
  curb(4, ARENA.h + 8, ax0, (az0 + az1) / 2);
  curb(4, ARENA.h + 8, ax1, (az0 + az1) / 2);

  // A ring of taller buildings outside the play area, for depth and city glow.
  {
    const rand = seeded(9);
    const facades = [windowTexture(3), windowTexture(5), windowTexture(8)];
    const skyline = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const side = i % 4;
      const w = 90 + rand() * 160;
      const d = 90 + rand() * 160;
      const h = 160 + rand() * 520;
      let x: number;
      let z: number;
      if (side === 0) {
        x = -1150 + rand() * 2300;
        z = az0 - 120 - d / 2 - rand() * 600;
      } else if (side === 1) {
        x = -1150 + rand() * 2300;
        z = az1 + 120 + d / 2 + rand() * 500;
      } else if (side === 2) {
        x = ax0 - 120 - w / 2 - rand() * 500;
        z = -700 + rand() * 1400;
      } else {
        x = ax1 + 120 + w / 2 + rand() * 500;
        z = -700 + rand() * 1400;
      }
      const facade = facades[i % facades.length].clone();
      facade.needsUpdate = true;
      facade.repeat.set(w / 120, h / 120);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0b1630,
        emissive: 0xffffff,
        emissiveMap: facade,
        emissiveIntensity: 0.55,
        roughness: 0.9,
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, h / 2 - 6, z);
      skyline.add(b);
    }
    scene.add(skyline);
  }

  // ---------- Per-level objects. ----------
  let levelGroup: THREE.Group | null = null;
  let levelId = '';
  let laneMesh: THREE.Mesh | null = null;
  let thrower: THREE.Group | null = null;
  let throwerArrow: THREE.Object3D | null = null;
  let throwerFigure: THREE.Mesh | null = null;
  const rigs: WatcherRig[] = [];
  const beacons: THREE.Mesh[] = [];

  const beamFloorMat = new THREE.MeshBasicMaterial({
    color: C.coral,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beamVolumeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(C.coral) }, strength: { value: 0.2 } },
    vertexShader: `
      attribute float fade;
      varying float vFade;
      void main() {
        vFade = fade;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float strength;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(color * strength * vFade, 1.0);
      }`,
  });

  function disposeGroup(g: THREE.Object3D): void {
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }

  function buildLevel(level: Level): void {
    if (levelGroup) {
      scene.remove(levelGroup);
      disposeGroup(levelGroup);
    }
    rigs.length = 0;
    beacons.length = 0;
    levelGroup = new THREE.Group();
    levelId = level.id;

    // Buildings: extruded footprints with roof texture on top and lit windows on the sides.
    const facade = windowTexture(level.id.length * 13 + 1);
    for (const poly of level.blocks) {
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x - CX, CZ - p.y)));
      const h = heightOf(poly);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const side = facade.clone();
      side.needsUpdate = true;
      side.repeat.set(1 / 110, 1 / 110);
      const roofMat = new THREE.MeshStandardMaterial({
        map: roofTex,
        color: 0xffffff,
        roughness: 0.7,
        emissive: 0x2a4a86,
        emissiveMap: roofTex,
        emissiveIntensity: 0.7,
      });
      const sideMat = new THREE.MeshStandardMaterial({
        color: 0x13254a,
        emissive: 0xffffff,
        emissiveMap: side,
        emissiveIntensity: 0.6,
        roughness: 0.85,
      });
      const mesh = new THREE.Mesh(geo, [roofMat, sideMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      levelGroup.add(mesh);

      // Rooftop clutter for scale: AC units with fans, a vent and a blinking beacon.
      {
        const rand = seeded(Math.round(poly[0].x * 7 + poly[0].y * 3));
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const q of poly) {
          minX = Math.min(minX, q.x);
          maxX = Math.max(maxX, q.x);
          minY = Math.min(minY, q.y);
          maxY = Math.max(maxY, q.y);
        }
        const inside = (x: number, y: number): boolean => {
          let hit = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const pi = poly[i];
            const pj = poly[j];
            if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) hit = !hit;
          }
          return hit;
        };
        const unitMat = new THREE.MeshStandardMaterial({ color: 0x8a9bb8, roughness: 0.5, metalness: 0.6 });
        const fanMat = new THREE.MeshStandardMaterial({ color: 0x20283a, roughness: 0.4, metalness: 0.7 });
        const count = Math.max(1, Math.round(((maxX - minX) * (maxY - minY)) / 14000));
        for (let k = 0; k < Math.min(4, count); k++) {
          const x = minX + 22 + rand() * Math.max(1, maxX - minX - 44);
          const y = minY + 22 + rand() * Math.max(1, maxY - minY - 44);
          if (!inside(x, y)) continue;
          const unit = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 22), unitMat);
          unit.position.copy(at({ x, y }, h + 7));
          unit.rotation.y = rand() > 0.5 ? 0 : Math.PI / 2;
          unit.castShadow = true;
          levelGroup.add(unit);
          const fan = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2, 16), fanMat);
          fan.position.copy(at({ x, y }, h + 15));
          levelGroup.add(fan);
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        if (inside(cx, cy)) {
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 26, 6), unitMat);
          mast.position.copy(at({ x: cx, y: cy }, h + 13));
          levelGroup.add(mast);
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(3.5, 10, 8),
            new THREE.MeshBasicMaterial({ color: C.coral }),
          );
          beacon.position.copy(at({ x: cx, y: cy }, h + 27));
          beacons.push(beacon);
          levelGroup.add(beacon);
        }
      }

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.55 }),
      );
      levelGroup.add(edges);
    }

    // Crossing lane and the two safe pads.
    const { a, b } = level.crossing;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    const laneTex = lane.clone();
    laneTex.needsUpdate = true;
    laneTex.repeat.set(len / 60, 1);
    const laneMat = new THREE.MeshBasicMaterial({
      map: laneTex,
      color: C.cyan,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    laneMesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 60), laneMat);
    laneMesh.rotation.x = -Math.PI / 2;
    laneMesh.rotation.z = -heading;
    laneMesh.position.copy(at(mid, 1.2));
    levelGroup.add(laneMesh);
    const laneBase = new THREE.Mesh(
      new THREE.PlaneGeometry(len, 64),
      new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    laneBase.rotation.copy(laneMesh.rotation);
    laneBase.position.copy(at(mid, 0.8));
    levelGroup.add(laneBase);

    const ux = (b.x - a.x) / (len || 1);
    const uy = (b.y - a.y) / (len || 1);
    for (const [p, dir] of [
      [a, -1],
      [b, 1],
    ] as const) {
      const c = { x: p.x + ux * 38 * dir, y: p.y + uy * 38 * dir };
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(84, 4, 100),
        new THREE.MeshStandardMaterial({ color: 0x1a3c66, emissive: 0x0a5aa0, emissiveIntensity: 0.45, roughness: 0.5 }),
      );
      pad.rotation.y = -heading + Math.PI / 2;
      pad.position.copy(at(c, 2));
      pad.receiveShadow = true;
      levelGroup.add(pad);
      const rim = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(84, 4, 100)),
        new THREE.LineBasicMaterial({ color: C.cyan }),
      );
      rim.rotation.copy(pad.rotation);
      rim.position.copy(pad.position);
      levelGroup.add(rim);
    }

    // The thrower: a lit pad with a pointer that follows the aim.
    thrower = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 34, 6, 40),
      new THREE.MeshStandardMaterial({ color: 0x0c2a50, emissive: C.blue, emissiveIntensity: 0.8 }),
    );
    pad.position.y = 3;
    thrower.add(pad);
    const ringGlow = new THREE.Mesh(
      new THREE.RingGeometry(34, 40, 48),
      new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ringGlow.rotation.x = -Math.PI / 2;
    ringGlow.position.y = 6.5;
    thrower.add(ringGlow);
    const figure = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 64),
      new THREE.MeshBasicMaterial({ map: runnerTex, transparent: true, depthWrite: false }),
    );
    figure.rotation.x = -Math.PI / 2;
    figure.position.y = 8;
    figure.renderOrder = 4;
    throwerFigure = figure;
    thrower.add(figure);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(9, 22, 3),
      new THREE.MeshBasicMaterial({ color: C.white }),
    );
    arrow.rotation.z = -Math.PI / 2;
    arrow.position.set(44, 8, 0);
    throwerArrow = new THREE.Group();
    throwerArrow.add(arrow);
    thrower.add(throwerArrow);
    thrower.position.copy(at(level.thrower));
    levelGroup.add(thrower);

    // Watchers: a turret with a red eye, its lit floor area, a beam volume and a scanning laser.
    for (const w of level.watchers) {
      const group = new THREE.Group();
      group.position.copy(at(w));
      group.scale.setScalar(1.5);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(20, 26, 30, 20),
        new THREE.MeshStandardMaterial({ color: 0x1c1f2c, roughness: 0.6, metalness: 0.5 }),
      );
      base.position.y = 15;
      base.castShadow = true;
      group.add(base);
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(24, 2.2, 8, 40),
        new THREE.MeshBasicMaterial({ color: C.coral }),
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = 4;
      group.add(band);
      const head = new THREE.Group();
      head.position.y = EYE_HEIGHT - 6;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(40, 20, 26),
        new THREE.MeshStandardMaterial({ color: 0x2a2f42, roughness: 0.5, metalness: 0.6 }),
      );
      box.castShadow = true;
      head.add(box);
      const eye = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 8, 6, 20),
        new THREE.MeshStandardMaterial({ color: C.coral, emissive: C.coral, emissiveIntensity: 3 }),
      );
      eye.rotation.z = Math.PI / 2;
      eye.position.x = 21;
      head.add(eye);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: haloTex, color: C.coral, transparent: true, opacity: 0.9, depthWrite: false }),
      );
      glow.scale.set(46, 46, 1);
      glow.position.x = 26;
      head.add(glow);
      group.add(head);
      const light = new THREE.PointLight(C.coral, 3, 260, 1.6);
      light.position.set(0, EYE_HEIGHT, 0);
      group.add(light);
      levelGroup.add(group);

      const floorMesh = new THREE.Mesh(new THREE.BufferGeometry(), beamFloorMat);
      floorMesh.renderOrder = 2;
      const beam = new THREE.Mesh(new THREE.BufferGeometry(), beamVolumeMat);
      beam.renderOrder = 3;
      const scan = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 1, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: C.coral, transparent: true, opacity: 0.95 }),
      );
      levelGroup.add(floorMesh, beam, scan);
      rigs.push({ group, head, eye, floor: floorMesh, beam, scan, light });
    }

    scene.add(levelGroup);
  }

  // ---------- Dynamic objects, reused every frame. ----------
  const lineMats: LineMaterial[] = [];
  const makeLine = (color: number, width: number, dashed: boolean, opacity = 1): Line2 => {
    const mat = new LineMaterial({
      color,
      linewidth: width,
      dashed,
      dashSize: 6,
      gapSize: 16,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    lineMats.push(mat);
    const line = new Line2(new LineGeometry(), mat);
    line.frustumCulled = false;
    line.renderOrder = 5;
    line.visible = false;
    scene.add(line);
    return line;
  };
  const routeLine = makeLine(C.white, 3.5, true, 0.85);
  const chargeLine = makeLine(C.cyan, 6, false);
  const stubLine = makeLine(C.amber, 5, false, 0.9);

  const setLine = (line: Line2, pts: Vec[], h: number): void => {
    if (pts.length < 2) {
      line.visible = false;
      return;
    }
    const arr: number[] = [];
    for (const p of pts) arr.push(p.x - CX, h, p.y - CZ);
    line.geometry.dispose();
    const g = new LineGeometry();
    g.setPositions(arr);
    line.geometry = g;
    line.computeLineDistances();
    line.visible = true;
  };

  const bounceDots: THREE.Mesh[] = [];
  const dotMat = new THREE.MeshBasicMaterial({ color: C.amber });
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), dotMat);
    d.visible = false;
    scene.add(d);
    bounceDots.push(d);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1, 72),
    new THREE.MeshBasicMaterial({ color: C.white, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const ringFill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 72),
    new THREE.MeshBasicMaterial({ color: C.white, transparent: true, opacity: 0.1, depthWrite: false }),
  );
  ringFill.rotation.x = -Math.PI / 2;
  ringFill.visible = false;
  scene.add(ringFill);

  const canister = new THREE.Group();
  {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 22, 16),
      new THREE.MeshStandardMaterial({ color: 0xdfe9f7, metalness: 0.7, roughness: 0.3 }),
    );
    body.rotation.z = Math.PI / 2;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(6.4, 6.4, 6, 16),
      new THREE.MeshStandardMaterial({ color: C.blue, emissive: C.blue, emissiveIntensity: 1.5 }),
    );
    band.rotation.z = Math.PI / 2;
    canister.add(body, band);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTex, color: C.cyan, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    halo.scale.set(70, 70, 1);
    canister.add(halo);
  }
  const canisterLight = new THREE.PointLight(C.cyan, 0, 380, 1.4);
  canister.add(canisterLight);
  canister.visible = false;
  scene.add(canister);

  // Smoke: a pool of camera-facing puffs, stacked in height for volume.
  const SMOKE_LAYERS = 3;
  const smokeSprites: THREE.Sprite[] = [];
  const smokeShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  smokeShadow.rotation.x = -Math.PI / 2;
  smokeShadow.visible = false;
  scene.add(smokeShadow);
  const ensureSmoke = (n: number): void => {
    while (smokeSprites.length < n) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: smokeTex[smokeSprites.length % 2],
          transparent: true,
          depthWrite: false,
          color: 0xffffff,
        }),
      );
      s.renderOrder = 6;
      s.visible = false;
      scene.add(s);
      smokeSprites.push(s);
    }
  };

  // Runners: textured cards lying just above the ground, with a blob shadow and a halo when spotted.
  const runners: { card: THREE.Mesh; shadow: THREE.Mesh; halo: THREE.Mesh }[] = [];
  for (let i = 0; i < 5; i++) {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(74, 74),
      new THREE.MeshBasicMaterial({ map: runnerTex, transparent: true, depthWrite: false }),
    );
    card.renderOrder = 4;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(28, 24),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(34, 32),
      new THREE.MeshBasicMaterial({ color: C.coral, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    halo.rotation.x = -Math.PI / 2;
    scene.add(shadow, halo, card);
    runners.push({ card, shadow, halo });
  }

  // Reveal sight lines: one segment per watcher-to-crossing line.
  const sightGeo = new THREE.BufferGeometry();
  const sightLines = new THREE.LineSegments(
    sightGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  sightLines.renderOrder = 7;
  sightLines.frustumCulled = false;
  scene.add(sightLines);

  // Particles and rings from the game's effect lists.
  const partGeo = new THREE.BufferGeometry();
  const parts = new THREE.Points(
    partGeo,
    new THREE.PointsMaterial({ size: 9, vertexColors: true, transparent: true, depthWrite: false, map: haloTex }),
  );
  parts.frustumCulled = false;
  scene.add(parts);
  const ringPool: THREE.Mesh[] = [];

  // ---------- Helpers ----------
  const tmpColor = new THREE.Color();
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let cssW = 1600;
  let cssH = 900;

  function setFan(mesh: THREE.Mesh, origin: Vec, pts: Vec[], height: number, volume: boolean): void {
    const n = pts.length;
    const pos = new Float32Array((n + 1) * 3);
    pos[0] = origin.x - CX;
    pos[1] = height;
    pos[2] = origin.y - CZ;
    for (let i = 0; i < n; i++) {
      pos[(i + 1) * 3] = pts[i].x - CX;
      pos[(i + 1) * 3 + 1] = volume ? 0.5 : 0.6;
      pos[(i + 1) * 3 + 2] = pts[i].y - CZ;
    }
    const idx: number[] = [];
    for (let i = 1; i < n; i++) idx.push(0, i, i + 1);
    const g = mesh.geometry as THREE.BufferGeometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (volume) {
      const fade = new Float32Array(n + 1);
      fade[0] = 1;
      for (let i = 1; i <= n; i++) fade[i] = 0.08;
      g.setAttribute('fade', new THREE.BufferAttribute(fade, 1));
    }
    g.setIndex(idx);
    g.computeBoundingSphere();
  }

  /** The clouds that block light right now: the real cloud, or the marker preview while charging. */
  function activeClouds(state: GameState): Cloud[] {
    if (state.cloud) {
      const age = state.phase === 'reveal' ? state.phaseTime : TIMING.reveal + state.phaseTime;
      const grow = clamp01(easeOutBack(age / TIMING.bloom));
      return [{ center: state.cloud.center, radius: state.cloud.radius * grow }];
    }
    if (state.phase === 'aim' && state.charging) return [{ center: state.marker, radius: state.level.cloudRadius }];
    return [];
  }

  function updateWatchers(state: GameState): void {
    const level = state.level;
    const { a, b } = level.crossing;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const clouds = activeClouds(state);
    const showBeams = state.phase !== 'summary';
    level.watchers.forEach((w, i) => {
      const rig = rigs[i];
      if (!rig) return;
      // The fan opens wide enough to cover the whole crossing, plus a margin.
      const angA = Math.atan2(a.y - w.y, a.x - w.x);
      const angB = Math.atan2(b.y - w.y, b.x - w.x);
      const angM = Math.atan2(mid.y - w.y, mid.x - w.x);
      const wrap = (v: number): number => Math.atan2(Math.sin(v), Math.cos(v));
      const half = Math.max(Math.abs(wrap(angA - angM)), Math.abs(wrap(angB - angM))) + 0.12;
      const pts = visibilityFan(w, mid, half, 96, state.walls, clouds, 1900);
      setFan(rig.floor, w, pts, 0.6, false);
      setFan(rig.beam, w, pts, EYE_HEIGHT, true);
      rig.floor.visible = showBeams;
      rig.beam.visible = showBeams;

      // Scanning laser sweeps across the fan; the head turns to follow it.
      const s = 0.5 + 0.5 * Math.sin(state.clock * 1.7 + i * 2.1);
      const target = pts[Math.min(pts.length - 1, Math.floor(s * (pts.length - 1)))];
      const from = at(w, EYE_HEIGHT);
      const to = at(target, 1);
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      rig.scan.position.copy(from).addScaledVector(dir, 0.5);
      rig.scan.scale.set(1, len, 1);
      rig.scan.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      rig.scan.visible = showBeams && (state.phase === 'aim' || state.phase === 'intro' || state.phase === 'attract');
      rig.head.rotation.y = -Math.atan2(target.y - w.y, target.x - w.x);
      const pulse = 0.75 + 0.25 * Math.sin(state.clock * 6 + i);
      (rig.eye.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.5 + pulse;
    });
  }

  function updateAim(state: GameState): void {
    const aiming = state.phase === 'aim';
    if (thrower && throwerArrow) {
      const t = state.level.thrower;
      const aimAngle = Math.atan2(state.aim.y - t.y, state.aim.x - t.x);
      throwerArrow.rotation.y = -aimAngle;
      if (throwerFigure) throwerFigure.rotation.z = -(aimAngle + Math.PI / 2);
      throwerArrow.visible = aiming || state.phase === 'intro';
    }
    const path = state.preview.path;
    const full = state.level.assist === 'full';
    if (!aiming) {
      routeLine.visible = chargeLine.visible = stubLine.visible = false;
      ring.visible = ringFill.visible = false;
      bounceDots.forEach((d) => (d.visible = false));
      return;
    }
    const route = full || path.length <= 2 ? path : [path[0], path[1]];
    setLine(routeLine, route, 3);
    (routeLine.material as LineMaterial).opacity = state.charging ? 0.35 : 0.85;
    if (!full && path.length > 2) {
      const p1 = path[1];
      const p2 = path[2];
      const l = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const k = Math.min(110, l) / l;
      setLine(stubLine, [p1, { x: p1.x + (p2.x - p1.x) * k, y: p1.y + (p2.y - p1.y) * k }], 3);
    } else {
      stubLine.visible = false;
    }
    const shown = full ? path.length - 1 : Math.min(2, path.length - 1);
    bounceDots.forEach((d, i) => {
      const p = path[i + 1];
      d.visible = !!p && i + 1 < shown;
      if (p) d.position.copy(at(p, 6));
    });

    if (state.charging) {
      const live: Vec[] = [path[0]];
      let left = state.charge;
      for (let i = 1; i < path.length; i++) {
        const p = path[i - 1];
        const q = path[i];
        const l = Math.hypot(q.x - p.x, q.y - p.y);
        if (left <= l) {
          const t = l > 0 ? left / l : 0;
          live.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
          break;
        }
        live.push(q);
        left -= l;
      }
      setLine(chargeLine, live, 4);
      const r = state.level.cloudRadius;
      ring.visible = ringFill.visible = true;
      ring.scale.set(r, r, 1);
      ringFill.scale.set(r, r, 1);
      ring.position.copy(at(state.marker, 2));
      ringFill.position.copy(at(state.marker, 1.5));
      ring.rotation.z = state.clock * 0.6;
    } else {
      chargeLine.visible = false;
      ring.visible = ringFill.visible = false;
    }
  }

  function updateCanister(state: GameState): void {
    const flying = state.phase === 'flight' && !!state.thrown;
    canister.visible = flying;
    canisterLight.intensity = flying ? 6 : 0;
    if (!flying || !state.thrown) return;
    // A low arc between bounce points so the throw reads as thrown, not slid.
    const k = Math.min(1, state.phaseTime / state.flightDuration);
    const hop = Math.sin(Math.PI * ((k * (state.thrown.bounces + 1)) % 1)) * 34 * (1 - k * 0.6);
    canister.position.copy(at(state.canister, 8 + hop));
    canister.rotation.set(state.phaseTime * 9, state.phaseTime * 14, 0);
  }

  function updateSmoke(state: GameState): void {
    const cloud = state.cloud;
    ensureSmoke(state.puffs.length * SMOKE_LAYERS);
    smokeSprites.forEach((s) => (s.visible = false));
    smokeShadow.visible = false;
    if (!cloud) return;
    const age = state.phase === 'reveal' ? state.phaseTime : TIMING.reveal + state.phaseTime;
    const r = cloud.radius;
    smokeShadow.visible = true;
    const grow = clamp01(age / TIMING.bloom);
    smokeShadow.scale.set(r * 1.35 * grow, r * 1.35 * grow, 1);
    smokeShadow.position.copy(at({ x: cloud.center.x + 14, y: cloud.center.y + 18 }, 0.4));

    // Lit from the watchers: puffs a watcher can see pick up a red edge.
    const seen = state.level.watchers.map((w) => w);
    let n = 0;
    state.puffs.forEach((puff) => {
      const k = easeOutBack((age - puff.delay) / (TIMING.bloom * 1.4));
      if (k <= 0) {
        n += SMOKE_LAYERS;
        return;
      }
      const drift = Math.min(1, age / 4);
      const px = cloud.center.x + puff.dx * k + Math.sin(state.clock * 0.9 + puff.phase) * 4 * drift;
      const py = cloud.center.y + puff.dy * k + Math.cos(state.clock * 0.7 + puff.phase) * 3 * drift;
      const pr = puff.r * k * (1 + 0.04 * Math.sin(state.clock * 1.6 + puff.phase));
      let redness = 0;
      for (const w of seen) {
        const d = Math.hypot(px - w.x, py - w.y);
        if (d < 520) redness = Math.max(redness, 1 - d / 520);
      }
      for (let layer = 0; layer < SMOKE_LAYERS; layer++) {
        const s = smokeSprites[n++];
        const lift = 0.35 + layer * 0.42;
        const size = pr * (2.5 - layer * 0.45);
        s.visible = true;
        s.position.copy(at({ x: px, y: py }, pr * lift + (layer === 2 ? age * 6 : 0)));
        s.scale.set(size, size, 1);
        const mat = s.material as THREE.SpriteMaterial;
        mat.rotation = puff.angle + puff.spin * age + layer;
        mat.opacity = layer === 2 ? 0.75 : 0.95;
        // Lower layers a touch blue (shadowed), top layer white (moonlit), red where a beam hits.
        tmpColor.setRGB(0.82 + layer * 0.09, 0.88 + layer * 0.06, 0.98);
        tmpColor.lerp(new THREE.Color(1, 0.72, 0.76), redness * 0.35);
        mat.color.copy(tmpColor);
      }
    });
  }

  function updateRunners(state: GameState): void {
    const poses = squadPoses(state, 1.75);
    poses.forEach((p, i) => {
      const r = runners[i];
      const show = state.phase !== 'summary' && state.phase !== 'attract';
      r.card.visible = r.shadow.visible = show;
      const bob = p.running ? Math.abs(Math.sin(state.clock * 16 + i)) * 4 : 0;
      r.card.position.copy(at(p, 3 + p.hop + bob));
      r.card.rotation.set(-Math.PI / 2, 0, -(p.heading + Math.PI / 2));
      (r.card.material as THREE.MeshBasicMaterial).opacity = p.alpha;
      (r.card.material as THREE.MeshBasicMaterial).color.set(p.spotted ? 0xffb0b8 : 0xffffff);
      r.shadow.position.copy(at({ x: p.x + 4, y: p.y + 6 }, 0.5));
      r.halo.visible = show && p.spotted;
      r.halo.position.copy(at(p, 1));
    });
  }

  function updateSight(state: GameState): void {
    const cov = state.coverage;
    if (!cov || (state.phase !== 'reveal' && state.phase !== 'result')) {
      sightLines.visible = false;
      return;
    }
    const t = state.phase === 'reveal' ? state.phaseTime : TIMING.reveal;
    const p = easeOutCubic((t - TIMING.sweepStart) / TIMING.sweepLength);
    const fade = state.phase === 'result' ? Math.max(0, 1 - state.phaseTime / 0.5) : 1;
    if (p <= 0 || fade <= 0) {
      sightLines.visible = false;
      return;
    }
    const lines = cov.lines.filter((l) => l.state !== 'wall');
    const pos = new Float32Array(lines.length * 6);
    const col = new Float32Array(lines.length * 6);
    lines.forEach((l, i) => {
      const tip = { x: l.from.x + (l.end.x - l.from.x) * p, y: l.from.y + (l.end.y - l.from.y) * p };
      pos.set([l.from.x - CX, EYE_HEIGHT, l.from.y - CZ, tip.x - CX, 4, tip.y - CZ], i * 6);
      tmpColor.set(l.state === 'cloud' ? C.mint : C.coral).multiplyScalar(fade);
      col.set([tmpColor.r, tmpColor.g, tmpColor.b, tmpColor.r, tmpColor.g, tmpColor.b], i * 6);
    });
    sightGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sightGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sightLines.visible = true;
  }

  function updateEffects(state: GameState): void {
    const n = state.particles.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    state.particles.forEach((p, i) => {
      const life = Math.max(0, p.life / p.max);
      pos.set([p.x - CX, 10 + (1 - life) * 30, p.y - CZ], i * 3);
      tmpColor.setStyle(p.color.startsWith('rgba') ? '#f4f9ff' : p.color).multiplyScalar(life);
      col.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    });
    partGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    partGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    while (ringPool.length < state.rings.length) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1, 64),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      m.rotation.x = -Math.PI / 2;
      scene.add(m);
      ringPool.push(m);
    }
    ringPool.forEach((m, i) => {
      const r = state.rings[i];
      m.visible = !!r;
      if (!r) return;
      const k = 1 - r.life / r.max;
      const radius = r.from + (r.to - r.from) * easeOutCubic(k);
      m.scale.set(radius, radius, 1);
      m.position.copy(at({ x: r.x, y: r.y }, 2));
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.setStyle(r.color);
      mat.opacity = (1 - k) * 0.9;
    });
    flashLight.intensity = state.flash * 4;
  }

  function updateCamera(state: GameState): void {
    const pos = BASE_CAM.clone();
    const look = LOOK.clone();
    if (state.phase === 'intro') {
      // Fly in from high over the city at the start of each round.
      const k = easeOutCubic(state.phaseTime / TIMING.intro);
      pos.lerp(new THREE.Vector3(-420, 2300, 1900), 1 - k);
    } else if (state.phase === 'attract' || state.phase === 'summary') {
      const t = state.clock * 0.12;
      pos.set(Math.sin(t) * 380, 1500, 980 + Math.cos(t) * 160);
    } else if (state.phase === 'reveal' && state.phaseTime > TIMING.runStart - 0.2) {
      // Lean in towards the crossing while the squad runs.
      const { a, b } = state.level.crossing;
      const mid = at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const k = easeOutCubic((state.phaseTime - TIMING.runStart + 0.2) / 0.6) * 0.18;
      pos.lerp(new THREE.Vector3(mid.x, 900, mid.z + 560), k);
      look.lerp(mid, k);
    } else if (state.phase === 'result') {
      const { a, b } = state.level.crossing;
      const mid = at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const k = 0.18 * Math.max(0, 1 - state.phaseTime / 0.8);
      pos.lerp(new THREE.Vector3(mid.x, 900, mid.z + 560), k);
      look.lerp(mid, k);
    }
    if (state.shake > 0) {
      pos.x += (Math.random() - 0.5) * state.shake * 1.6;
      pos.z += (Math.random() - 0.5) * state.shake * 1.6;
    }
    camera.position.copy(pos);
    camera.lookAt(look);
  }

  return {
    canvas,
    resize(width, height, dpr) {
      cssW = width;
      cssH = height;
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      for (const m of lineMats) m.resolution.set(width * dpr, height * dpr);
    },
    render(state) {
      if (state.level.id !== levelId) buildLevel(state.level);
      if (laneMesh) {
        const map = (laneMesh.material as THREE.MeshBasicMaterial).map;
        if (map) map.offset.x = -state.clock * 0.9;
      }
      beacons.forEach((b, i) => (b.visible = Math.sin(state.clock * 3 + i * 1.9) > 0.2));
      updateWatchers(state);
      updateAim(state);
      updateCanister(state);
      updateSmoke(state);
      updateRunners(state);
      updateSight(state);
      updateEffects(state);
      updateCamera(state);
      composer.render();
    },
    screenToWorld(clientX, clientY) {
      const box = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
      // Aim against the resting camera, so a shake or fly-in never moves the aim point.
      const still = camera.clone();
      still.position.copy(BASE_CAM);
      still.lookAt(LOOK);
      still.updateMatrixWorld();
      raycaster.setFromCamera(ndc, still);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(ground, hit)) return null;
      return { x: hit.x + CX, y: hit.z + CZ };
    },
    project(p, h = 0) {
      const v = at(p, h).project(camera);
      return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH };
    },
  };
}
