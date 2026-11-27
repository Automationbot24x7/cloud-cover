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

import blockTopUrl from '../assets/block-top.jpg';
import cloudSeaUrl from '../assets/cloud-sea.jpg';
import skyUrl from '../assets/sky.jpg';
import smokeAUrl from '../assets/smoke-a.png';
import smokeBUrl from '../assets/smoke-b.png';
import { raycast, segmentCircleEntry } from '../core/geom';
import type { Cloud, Segment, Vec } from '../core/types';
import { ARENA, type Level } from './levels';
import { squadPoses } from './squad';
import { LIVE_READOUT_ROUNDS, TIMING, type GameState } from './state';

const CX = 800;
const CZ = 480;
const EYE_HEIGHT = 46;

const C = {
  bg: 0x8fc8f4,
  fog: 0xcfe6fb,
  orange: 0xff7a2e,
  slate: 0x5d6878,
  alu: 0xd9e1ea,
  ceramic: 0xf6f4ef,
  sky: 0x5cb8ff,
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

/** The deck floor: large warm sand-grey tiles with thin charcoal joints and a faint speckle. Drawn in code. */
function sandTileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rand = seeded(33);
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const v = 200 + Math.floor(rand() * 10);
      g.fillStyle = `rgb(${v + 8}, ${v - 4}, ${v - 26})`;
      g.fillRect(tx * 256, ty * 256, 256, 256);
    }
  }
  for (let i = 0; i < 2600; i++) {
    const v = 150 + Math.floor(rand() * 90);
    g.fillStyle = `rgba(${v}, ${v - 10}, ${v - 30}, 0.16)`;
    g.fillRect(rand() * 512, rand() * 512, 1 + rand() * 2.5, 1 + rand() * 2.5);
  }
  g.strokeStyle = 'rgba(52, 56, 64, 0.85)';
  g.lineWidth = 3;
  for (const x of [0, 256, 512]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(0, x);
    g.lineTo(512, x);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Rooftop structure walls: poured concrete panels with seams and a darker cap band. No windows. */
function concreteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#2a3a56';
  g.fillRect(0, 0, 256, 256);
  const rand = seeded(21);
  for (let i = 0; i < 900; i++) {
    const v = 30 + Math.floor(rand() * 40);
    g.fillStyle = `rgba(${v}, ${v + 14}, ${v + 34}, 0.25)`;
    g.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 2 + rand() * 4);
  }
  g.strokeStyle = 'rgba(10, 18, 34, 0.8)';
  g.lineWidth = 3;
  for (let x = 0; x <= 256; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  g.fillStyle = 'rgba(8, 14, 28, 0.55)';
  g.fillRect(0, 0, 256, 22);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Three hard light bands for the cel-shaded smoke. */
function toonRamp(): THREE.DataTexture {
  const data = new Uint8Array([120, 120, 120, 255, 195, 195, 195, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** A lumpy unit sphere: an icosphere with its vertices pushed in and out a little. */
function lumpySphere(seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const rand = seeded(seed);
  const bumps = Array.from({ length: 5 }, () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize());
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let k = 1;
    for (const b of bumps) k += Math.max(0, v.dot(b) - 0.55) * 0.5;
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** The crossing lane: chevrons that scroll in the running direction. */
function laneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
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
  spill: THREE.Mesh;
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
  /** Release the GPU and remove the canvas and overlays (used when switching to safe mode). */
  dispose(): void;
  /** GPU object counts, for soak tests. */
  stats(): { geometries: number; textures: number; programs: number };
}

interface Figurine {
  group: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  legs: THREE.Mesh[];
}

/**
 * A small white ceramic runner with sky-blue trim, built from simple shapes (body, head, cap, waist band, legs).
 * `overlay` draws it without depth testing so the squad stays visible through the smoke.
 */
function makeFigurine(overlay: boolean): Figurine {
  const ceramic = new THREE.MeshStandardMaterial({ color: C.ceramic, roughness: 0.32, metalness: 0.02 });
  const trim = new THREE.MeshStandardMaterial({ color: C.sky, roughness: 0.4, metalness: 0.05 });
  const mats = [ceramic, trim];
  if (overlay) {
    for (const m of mats) {
      m.transparent = true;
      m.depthTest = false;
      m.depthWrite = false;
    }
  }
  const group = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, order: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = !overlay;
    if (overlay) m.renderOrder = order;
    group.add(m);
    return m;
  };
  const legs = [
    add(new THREE.CapsuleGeometry(3.6, 7, 4, 8), ceramic, 0, 7, -4.6, 9),
    add(new THREE.CapsuleGeometry(3.6, 7, 4, 8), ceramic, 0, 7, 4.6, 9),
  ];
  add(new THREE.CapsuleGeometry(8.5, 12, 6, 12), ceramic, 0, 21, 0, 10);
  const band = add(new THREE.TorusGeometry(8.7, 2.1, 8, 24), trim, 0, 16, 0, 11);
  band.rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(10, 18, 14), ceramic, 1, 40, 0, 12);
  // A small sky-blue cap at the back of the head, so the white figurine still reads from above.
  const cap = add(new THREE.SphereGeometry(10.6, 18, 8, 0, Math.PI * 2, 0, Math.PI / 4.2), trim, -2, 41, 0, 13);
  cap.rotation.z = 0.9;
  return { group, mats, legs };
}

export function createRenderer3D(canvas: HTMLCanvasElement): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  // A faint studio environment gives the wet floor and metal something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;
  scene.fog = new THREE.Fog(C.fog, 2600, 6400);

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 10, 9000);
  // 20 degrees off vertical, close enough that the field fills the space between the top bar and the hint strip.
  const LOOK = new THREE.Vector3(0, 0, -20);
  const BASE_CAM = new THREE.Vector3(0, 1780 * Math.cos(0.349), -20 + 1780 * Math.sin(0.349));
  camera.position.copy(BASE_CAM);
  camera.lookAt(LOOK);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1600, 900), 0.12, 0.35, 0.99);
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
  const floorTex = sandTileTexture();
  floorTex.repeat.set(ARENA.w / 240, ARENA.h / 240);
  const blockTopTex = tex(blockTopUrl);
  const skyTex = tex(skyUrl);
  const cloudSeaTex = tex(cloudSeaUrl);
  const smokeTex = [tex(smokeAUrl), tex(smokeBUrl)];
  const shadowTex = glowTexture('rgba(0,0,0,0.65)', 'rgba(0,0,0,0)');
  const haloTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const lane = laneTexture();

  // ---------- Lights: late-morning sun over a sea of clouds. ----------
  scene.background = skyTex;
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0xd9c9ad, 0.9));
  const moon = new THREE.DirectionalLight(0xfff1dc, 2.3);
  moon.position.set(-620, 1250, -520);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = -900;
  sc.right = 900;
  sc.top = 600;
  sc.bottom = -600;
  sc.near = 100;
  sc.far = 3200;
  moon.shadow.bias = -0.0005;
  moon.shadow.radius = 3;
  scene.add(moon, moon.target);
  const flashLight = new THREE.AmbientLight(0xdfffee, 0);
  scene.add(flashLight);

  // ---------- Static world: the deck floor, the deck slab, its glass edge and the sky around it. ----------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.w, ARENA.h),
    new THREE.MeshStandardMaterial({ map: floorTex, color: 0xffffff, roughness: 0.82, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ARENA.x + ARENA.w / 2 - CX, 0, ARENA.y + ARENA.h / 2 - CZ);
  floor.receiveShadow = true;
  scene.add(floor);

  // A sea of clouds far below the deck.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 5200),
    new THREE.MeshBasicMaterial({ map: cloudSeaTex, color: 0xffffff, fog: false }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -900;
  scene.add(sea);

  const ax0 = ARENA.x - CX;
  const ax1 = ARENA.x + ARENA.w - CX;
  const az0 = ARENA.y - CZ;
  const az1 = ARENA.y + ARENA.h - CZ;
  {
    // The deck slab: a cream concrete platform the arena sits on.
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xe8e1d2, roughness: 0.75 });
    const underMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ae, roughness: 0.9 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(ARENA.w + 90, 46, ARENA.h + 90), slabMat);
    slab.position.set((ax0 + ax1) / 2, -23.5, (az0 + az1) / 2);
    slab.receiveShadow = true;
    scene.add(slab);
    const under = new THREE.Mesh(new THREE.BoxGeometry(ARENA.w + 20, 90, ARENA.h + 20), underMat);
    under.position.set((ax0 + ax1) / 2, -92, (az0 + az1) / 2);
    scene.add(under);

    // The bounce wall: a low clear glass barrier with an aluminium rail and a metal kick plate.
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xd6f1ff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      metalness: 0.1,
      depthWrite: false,
    });
    const railMat = new THREE.MeshStandardMaterial({ color: C.alu, metalness: 0.85, roughness: 0.28 });
    const H = 34;
    const T = 6;
    const edge = (w: number, d: number, x: number, z: number): void => {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), glassMat);
      glass.position.set(x, H / 2 + 4, z);
      glass.renderOrder = 2;
      scene.add(glass);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 4, d + 4), railMat);
      rail.position.set(x, H + 6, z);
      rail.castShadow = true;
      scene.add(rail);
      const kick = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 6, d + 2), railMat);
      kick.position.set(x, 3, z);
      scene.add(kick);
    };
    edge(ARENA.w + 2 * T, T, (ax0 + ax1) / 2, az0 - T / 2);
    edge(ARENA.w + 2 * T, T, (ax0 + ax1) / 2, az1 + T / 2);
    edge(T, ARENA.h, ax0 - T / 2, (az0 + az1) / 2);
    edge(T, ARENA.h, ax1 + T / 2, (az0 + az1) / 2);
    // Posts every few metres so the barrier reads as solid.
    const postGeo = new THREE.BoxGeometry(5, H + 4, 5);
    for (let x = ax0; x <= ax1 + 1; x += 150) {
      for (const z of [az0 - T / 2, az1 + T / 2]) {
        const post = new THREE.Mesh(postGeo, railMat);
        post.position.set(x, H / 2 + 4, z);
        scene.add(post);
      }
    }
    for (let z = az0; z <= az1 + 1; z += 148) {
      for (const x of [ax0 - T / 2, ax1 + T / 2]) {
        const post = new THREE.Mesh(postGeo, railMat);
        post.position.set(x, H / 2 + 4, z);
        scene.add(post);
      }
    }
  }

  // The world around the deck: smaller floating platforms, camera drones and a hovering screen.
  const drones: THREE.Group[] = [];
  {
    const platMat = new THREE.MeshStandardMaterial({ color: 0xe3dccd, roughness: 0.8 });
    const platUnder = new THREE.MeshStandardMaterial({ color: 0xa3abb6, roughness: 0.9 });
    const platform = (w: number, d: number, x: number, y: number, z: number): void => {
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, 22, d), platMat);
      top.position.set(x, y, z);
      scene.add(top);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.32, Math.min(w, d) * 0.12, 70, 6), platUnder);
      base.position.set(x, y - 46, z);
      scene.add(base);
    };
    platform(260, 200, -1080, -160, -640);
    platform(200, 170, 1120, -230, -560);
    platform(320, 230, 1080, -140, 640);
    platform(180, 150, -1140, -260, 560);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4, metalness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b313b, roughness: 0.5, metalness: 0.5 });
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x8ea0b4, transparent: true, opacity: 0.45 });
    const makeDrone = (x: number, y: number, z: number): void => {
      const d = new THREE.Group();
      d.add(new THREE.Mesh(new THREE.BoxGeometry(34, 10, 22), bodyMat));
      const lens = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), darkMat);
      lens.position.set(14, -7, 0);
      d.add(lens);
      for (const [px, pz] of [[-22, -18], [22, -18], [-22, 18], [22, 18]]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 3), darkMat);
        arm.position.set(px / 2, 2, pz / 2);
        arm.rotation.y = Math.atan2(pz, px);
        d.add(arm);
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 1, 16), rotorMat);
        rotor.position.set(px, 5, pz);
        d.add(rotor);
      }
      d.position.set(x, y, z);
      d.userData.base = new THREE.Vector3(x, y, z);
      scene.add(d);
      drones.push(d);
    };
    makeDrone(-860, 190, -520);
    makeDrone(900, 230, 420);

    // A hovering blank broadcast screen on a thin frame, angled towards the deck.
    const frame = new THREE.Mesh(new THREE.BoxGeometry(10, 150, 260), darkMat);
    frame.position.set(1150, 150, -80);
    scene.add(frame);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(240, 132), new THREE.MeshBasicMaterial({ color: 0xbfe4ff }));
    panel.rotation.y = -Math.PI / 2;
    panel.position.set(1144, 150, -80);
    scene.add(panel);
  }

  // ---------- Per-level objects. ----------
  let levelGroup: THREE.Group | null = null;
  let levelId = '';
  let laneMesh: THREE.Mesh | null = null;
  let thrower: THREE.Group | null = null;
  let throwerArrow: THREE.Object3D | null = null;
  let throwerFigure: THREE.Object3D | null = null;
  const rigs: WatcherRig[] = [];
  const beacons: THREE.Mesh[] = [];

  const beamFloorMat = new THREE.MeshBasicMaterial({
    color: C.orange,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beamVolumeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(C.orange) }, strength: { value: 0.42 } },
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
        gl_FragColor = vec4(color, strength * vFade);
      }`,
  });

  // Dim spill: the searchlight's wider glow, fading to nothing a little past the crossing.
  const beamSpillMat = beamVolumeMat.clone();
  beamSpillMat.uniforms.strength.value = 0.16;

  /** Textures made for the current level only; released when the next level is built. */
  const levelTextures: THREE.Texture[] = [];

  function disposeGroup(g: THREE.Object3D): void {
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      // Shared materials (beams) live for the whole session; per-level ones go with the level.
      for (const m of mats) if (m !== beamFloorMat && m !== beamSpillMat && m !== beamVolumeMat) m.dispose();
    });
    levelTextures.forEach((t) => t.dispose());
    levelTextures.length = 0;
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

    // Cover blocks: matte slate with a panelled roof (fitted to each block) and bright aluminium edges.
    const concrete = concreteTexture();
    levelTextures.push(concrete);
    for (const poly of level.blocks) {
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x - CX, CZ - p.y)));
      const h = heightOf(poly);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const side = concrete.clone();
      side.needsUpdate = true;
      levelTextures.push(side);
      side.repeat.set(1 / 120, 1 / h);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const q of poly) {
        minX = Math.min(minX, q.x - CX);
        maxX = Math.max(maxX, q.x - CX);
        minY = Math.min(minY, CZ - q.y);
        maxY = Math.max(maxY, CZ - q.y);
      }
      const top = blockTopTex.clone();
      top.needsUpdate = true;
      levelTextures.push(top);
      top.repeat.set(1 / Math.max(1, maxX - minX), 1 / Math.max(1, maxY - minY));
      top.offset.set(-minX / Math.max(1, maxX - minX), -minY / Math.max(1, maxY - minY));
      const roofMat = new THREE.MeshStandardMaterial({ map: top, color: 0xffffff, roughness: 0.75 });
      const sideMat = new THREE.MeshStandardMaterial({ color: C.slate, map: side, roughness: 0.85 });
      const mesh = new THREE.Mesh(geo, [roofMat, sideMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      levelGroup.add(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: C.alu, transparent: true, opacity: 0.85 }),
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
    levelTextures.push(laneTex);
    laneTex.repeat.set(len / 60, 1);
    const laneMat = new THREE.MeshBasicMaterial({
      map: laneTex,
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    laneMesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 60), laneMat);
    laneMesh.rotation.x = -Math.PI / 2;
    laneMesh.rotation.z = -heading;
    laneMesh.position.copy(at(mid, 1.2));
    levelGroup.add(laneMesh);
    const laneBase = new THREE.Mesh(
      new THREE.PlaneGeometry(len, 64),
      new THREE.MeshBasicMaterial({ color: C.sky, transparent: true, opacity: 0.78, depthWrite: false }),
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
        new THREE.MeshStandardMaterial({ color: 0x9fb2c6, roughness: 0.55, metalness: 0.2 }),
      );
      pad.rotation.y = -heading + Math.PI / 2;
      pad.position.copy(at(c, 2));
      pad.receiveShadow = true;
      levelGroup.add(pad);
      const rim = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(84, 4, 100)),
        new THREE.LineBasicMaterial({ color: C.sky }),
      );
      rim.rotation.copy(pad.rotation);
      rim.position.copy(pad.position);
      levelGroup.add(rim);
    }

    // The thrower: a lit pad with a pointer that follows the aim.
    thrower = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 34, 6, 40),
      new THREE.MeshStandardMaterial({ color: 0xf1f4f7, roughness: 0.45, metalness: 0.2 }),
    );
    pad.position.y = 3;
    thrower.add(pad);
    const ringGlow = new THREE.Mesh(
      new THREE.RingGeometry(34, 40, 48),
      new THREE.MeshBasicMaterial({ color: C.sky, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    ringGlow.rotation.x = -Math.PI / 2;
    ringGlow.position.y = 6.5;
    thrower.add(ringGlow);
    const figure = makeFigurine(false).group;
    figure.position.y = 6;
    figure.scale.setScalar(1.3);
    throwerFigure = figure;
    thrower.add(figure);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(9, 22, 3),
      new THREE.MeshBasicMaterial({ color: 0x1f7fd6 }),
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
        new THREE.CylinderGeometry(16, 22, 30, 24),
        new THREE.MeshStandardMaterial({ color: 0xf3f3ef, roughness: 0.35, metalness: 0.15 }),
      );
      base.position.y = 15;
      base.castShadow = true;
      group.add(base);
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(20, 2, 8, 40),
        new THREE.MeshBasicMaterial({ color: C.orange }),
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = 4;
      group.add(band);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 5, 22, 10),
        new THREE.MeshStandardMaterial({ color: 0x2f3540, metalness: 0.7, roughness: 0.35 }),
      );
      pole.position.y = 34;
      group.add(pole);
      const head = new THREE.Group();
      head.position.y = EYE_HEIGHT - 2;
      head.rotation.z = 0;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(36, 22, 24),
        new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.3, metalness: 0.15 }),
      );
      box.castShadow = true;
      head.add(box);
      const eye = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 8, 6, 20),
        new THREE.MeshStandardMaterial({ color: 0x1b1f27, emissive: C.orange, emissiveIntensity: 1.6, roughness: 0.2 }),
      );
      eye.rotation.z = Math.PI / 2;
      eye.position.x = 21;
      head.add(eye);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: haloTex, color: C.orange, transparent: true, opacity: 0.75, depthWrite: false }),
      );
      glow.scale.set(46, 46, 1);
      glow.position.x = 26;
      head.add(glow);
      group.add(head);
      const light = new THREE.PointLight(C.orange, 1.2, 200, 1.6);
      light.position.set(0, EYE_HEIGHT, 0);
      group.add(light);
      levelGroup.add(group);

      const spill = new THREE.Mesh(new THREE.BufferGeometry(), beamSpillMat);
      spill.renderOrder = 1;
      levelGroup.add(spill);
      const floorMesh = new THREE.Mesh(new THREE.BufferGeometry(), beamFloorMat);
      floorMesh.renderOrder = 2;
      const beam = new THREE.Mesh(new THREE.BufferGeometry(), beamVolumeMat);
      beam.renderOrder = 3;
      const scan = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 1, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: C.orange, transparent: true, opacity: 0.95 }),
      );
      levelGroup.add(floorMesh, beam, scan);
      rigs.push({ spill, group, head, eye, floor: floorMesh, beam, scan, light });
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
  const routeLine = makeLine(0x1f6fbf, 3.5, true, 0.9);
  const trailMat = new LineMaterial({ linewidth: 7, vertexColors: true, transparent: true, depthWrite: false });
  trailMat.blending = THREE.AdditiveBlending;
  lineMats.push(trailMat);
  const trail = new Line2(new LineGeometry(), trailMat);
  trail.frustumCulled = false;
  trail.visible = false;
  trail.renderOrder = 5;
  scene.add(trail);
  const chargeLine = makeLine(0x1f8fe0, 6, false);
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
    new THREE.MeshBasicMaterial({ color: 0x1f6fbf, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const ringFill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 72),
    new THREE.MeshBasicMaterial({ color: 0x5cb8ff, transparent: true, opacity: 0.18, depthWrite: false }),
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
  const SMOKE_LAYERS = 1;
  const toon = toonRamp();
  const puffGeos = [lumpySphere(1), lumpySphere(2), lumpySphere(3)];
  const puffMat = new THREE.MeshToonMaterial({ color: 0xf2f7ff, gradientMap: toon, emissive: 0x2a4670, emissiveIntensity: 0.35 });
  // A faint blue rim on the smoke's silhouette, so it sits in the night scene and matches the title art.
  puffMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rimK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      outgoingLight += vec3(0.3, 0.62, 1.0) * pow(rimK, 2.6) * 0.75;
      #include <opaque_fragment>`,
    );
  };
  const puffMeshes: THREE.Mesh[] = [];
  const ensurePuffMeshes = (n: number): void => {
    while (puffMeshes.length < n) {
      const m = new THREE.Mesh(puffGeos[puffMeshes.length % 3], puffMat);
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      puffMeshes.push(m);
    }
  };
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

  // Runners: ceramic figurines, drawn over the smoke so the squad stays visible (faint while hidden inside it).
  const runners: { fig: Figurine; shadow: THREE.Mesh; halo: THREE.Mesh }[] = [];
  for (let i = 0; i < 5; i++) {
    const fig = makeFigurine(true);
    fig.group.scale.setScalar(1.55);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(22, 24),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(30, 32),
      new THREE.MeshBasicMaterial({ color: C.coral, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    halo.rotation.x = -Math.PI / 2;
    scene.add(shadow, halo, fig.group);
    runners.push({ fig, shadow, halo });
  }

  // A "% hidden" tag beside the landing ring, as an overlay positioned from the 3D scene.
  const tag = document.createElement('div');
  tag.className = 'world-tag';
  tag.hidden = true;
  canvas.parentElement?.appendChild(tag);
  // "YOU" above the thrower while aiming, and a short "SPOTTED" flash over each runner a watcher catches.
  const you = document.createElement('div');
  you.className = 'world-you';
  you.textContent = 'YOU';
  you.hidden = true;
  canvas.parentElement?.appendChild(you);
  const spotTags = Array.from({ length: 5 }, () => {
    const d = document.createElement('div');
    d.className = 'world-spotted';
    d.textContent = 'SPOTTED';
    d.hidden = true;
    canvas.parentElement?.appendChild(d);
    return d;
  });
  const spottedAt: number[] = [-1, -1, -1, -1, -1];
  // Power ring around the thrower while charging.
  const powerRing = new THREE.Mesh(
    new THREE.RingGeometry(46, 54, 64, 1, 0, 0.01),
    new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, depthWrite: false }),
  );
  powerRing.rotation.x = -Math.PI / 2;
  powerRing.visible = false;
  scene.add(powerRing);

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
    new THREE.PointsMaterial({ size: 16, vertexColors: true, transparent: true, depthWrite: false, map: haloTex }),
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

  function project(p: Vec, h = 0): { x: number; y: number } {
    const v = at(p, h).project(camera);
    return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH };
  }

  function setFan(mesh: THREE.Mesh, origin: Vec, pts: Vec[], height: number, volume: boolean, edgeFade = 0.08): void {
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
    if (volume || mesh.material === beamSpillMat) {
      const fade = new Float32Array(n + 1);
      fade[0] = 1;
      for (let i = 1; i <= n; i++) fade[i] = edgeFade;
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
    if (state.phase === 'aim' && state.charging && !state.pro) return [{ center: state.marker, radius: state.level.cloudRadius }];
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
      const span = Math.max(Math.abs(wrap(angA - angM)), Math.abs(wrap(angB - angM)));
      // Dim spill: the whole searchlight, out to the walls.
      const reach = Math.max(Math.hypot(a.x - w.x, a.y - w.y), Math.hypot(b.x - w.x, b.y - w.y)) + 160;
      const spillPts = visibilityFan(w, mid, span + 0.12, 72, state.walls, clouds, reach);
      setFan(rig.spill, w, spillPts, 0.4, false, 0);
      // Bright fan: only what the watcher can see of the crossing, stopping just past the lane,
      // so lit = dangerous and nothing else glows.
      const raw = visibilityFan(w, mid, span + 0.02, 96, state.walls, clouds, 1900);
      const pts = raw.map((q) => {
        const dx = q.x - w.x;
        const dy = q.y - w.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        // Distance along this ray to the crossing line, if it crosses it ahead of the watcher.
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const den = ux * ey - uy * ex;
        if (Math.abs(den) < 1e-6) return q;
        const t = ((a.x - w.x) * ey - (a.y - w.y) * ex) / den;
        if (t <= 0) return q;
        const stop = Math.min(d, t + 34);
        return { x: w.x + ux * stop, y: w.y + uy * stop };
      });
      setFan(rig.floor, w, pts, 0.6, false);
      setFan(rig.beam, w, pts, EYE_HEIGHT, true);
      rig.spill.visible = showBeams;
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
      (rig.eye.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + pulse;
    });
  }

  function updateAim(state: GameState): void {
    const aiming = state.phase === 'aim';
    if (thrower && throwerArrow) {
      const t = state.level.thrower;
      const aimAngle = Math.atan2(state.aim.y - t.y, state.aim.x - t.x);
      throwerArrow.rotation.y = -aimAngle;
      if (throwerFigure) throwerFigure.rotation.y = -aimAngle;
      throwerArrow.visible = aiming || state.phase === 'intro';
      you.hidden = !(aiming || state.phase === 'intro');
      if (!you.hidden) {
        const sp = project(t, 70);
        you.style.left = `${sp.x}px`;
        you.style.top = `${sp.y}px`;
      }
    }
    const path = state.preview.path;
    const full = state.level.assist === 'full' && !state.pro;
    if (!aiming) {
      routeLine.visible = chargeLine.visible = stubLine.visible = false;
      ring.visible = ringFill.visible = false;
      powerRing.visible = false;
      tag.hidden = true;
      bounceDots.forEach((d) => (d.visible = false));
      return;
    }
    // Full assist: at most three legs, so a long zig-zag does not cover the map. Otherwise the first leg and a stub.
    const route = full || path.length <= 2 ? path.slice(0, 4) : [path[0], path[1]];
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
    const shown = full ? Math.min(3, path.length - 1) : Math.min(2, path.length - 1);
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
      if (state.pro) chargeLine.visible = false;
      else setLine(chargeLine, live, 4);
      const r = state.level.cloudRadius;
      ring.visible = ringFill.visible = !state.pro;
      ring.scale.set(r, r, 1);
      ringFill.scale.set(r, r, 1);
      ring.position.copy(at(state.marker, 2));
      ringFill.position.copy(at(state.marker, 1.5));
      ring.rotation.z = state.clock * 0.6;
      const top = Math.max(1, state.preview.length);
      const share = Math.max(0.01, Math.min(1, state.charge / top));
      powerRing.geometry.dispose();
      powerRing.geometry = new THREE.RingGeometry(46, 54, 64, 1, Math.PI / 2, -share * Math.PI * 2);
      powerRing.position.copy(at(state.level.thrower, 7));
      (powerRing.material as THREE.MeshBasicMaterial).color.set(share > 0.85 ? C.amber : C.cyan);
      powerRing.visible = true;
      // Live readout beside the landing ring on the first two maps only: it teaches what "covered" means,
      // then the result stays a surprise until the squad runs.
      if (state.live && state.roundIndex < LIVE_READOUT_ROUNDS) {
        const pct = Math.round(state.live.ratio * 100);
        const edge = project({ x: state.marker.x + r, y: state.marker.y }, 4);
        tag.hidden = false;
        tag.style.left = `${edge.x + 10}px`;
        tag.style.top = `${edge.y - 28}px`;
        tag.dataset.grade = pct >= 97 ? '3' : pct >= 70 ? '2' : pct >= 35 ? '1' : '0';
        tag.innerHTML = `<b>${pct}%</b><span>HIDDEN</span>`;
      } else {
        tag.hidden = true;
      }
    } else {
      chargeLine.visible = false;
      ring.visible = ringFill.visible = false;
      powerRing.visible = false;
      tag.hidden = true;
    }
  }

  function updateCanister(state: GameState): void {
    const flying = state.phase === 'flight' && !!state.thrown;
    canister.visible = flying;
    if (!flying) trail.visible = false;
    canisterLight.intensity = flying ? 6 : 0;
    if (!flying || !state.thrown) return;
    // A low arc between bounce points so the throw reads as thrown, not slid.
    const k = Math.min(1, state.phaseTime / state.flightDuration);
    const hop = Math.sin(Math.PI * ((k * (state.thrown.bounces + 1)) % 1)) * 34 * (1 - k * 0.6);
    canister.position.copy(at(state.canister, 8 + hop));
    canister.rotation.set(state.phaseTime * 9, state.phaseTime * 14, 0);
    // A glowing trail: the last stretch of the real throw path behind the canister.
    const thrown = state.thrown;
    const eased = 1 - Math.pow(1 - k, 1.6);
    const head = thrown.length * eased;
    const tail = Math.max(0, head - 220);
    const pts: Vec[] = [];
    let walked = 0;
    for (let i = 1; i < thrown.path.length; i++) {
      const p0 = thrown.path[i - 1];
      const p1 = thrown.path[i];
      const seg = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const s0 = walked;
      const s1 = walked + seg;
      if (s1 >= tail && s0 <= head && seg > 0) {
        const t0 = Math.max(0, (tail - s0) / seg);
        const t1 = Math.min(1, (head - s0) / seg);
        if (!pts.length) pts.push({ x: p0.x + (p1.x - p0.x) * t0, y: p0.y + (p1.y - p0.y) * t0 });
        pts.push({ x: p0.x + (p1.x - p0.x) * t1, y: p0.y + (p1.y - p0.y) * t1 });
      }
      walked = s1;
    }
    if (pts.length >= 2) {
      const pos: number[] = [];
      const col: number[] = [];
      pts.forEach((v, i) => {
        const f = (i + 1) / pts.length;
        pos.push(v.x - CX, 10, v.y - CZ);
        col.push(0.5 * f, 0.88 * f, 1.0 * f);
      });
      trail.geometry.dispose();
      const g = new LineGeometry();
      g.setPositions(pos);
      g.setColors(col);
      trail.geometry = g;
      trail.visible = true;
    }
  }

  function updateSmoke(state: GameState): void {
    const cloud = state.cloud;
    ensureSmoke(state.puffs.length * SMOKE_LAYERS);
    ensurePuffMeshes(state.puffs.length * 3);
    smokeSprites.forEach((s) => (s.visible = false));
    puffMeshes.forEach((m) => (m.visible = false));
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
    let pm = 0;
    state.puffs.forEach((puff, pi) => {
      const k = easeOutBack((age - puff.delay) / (TIMING.bloom * 1.4));
      if (k <= 0) {
        n += SMOKE_LAYERS;
        return;
      }
      const drift = Math.min(1, age / 4);
      const px = cloud.center.x + puff.dx * k + Math.sin(state.clock * 0.9 + puff.phase) * 4 * drift;
      const py = cloud.center.y + puff.dy * k + Math.cos(state.clock * 0.7 + puff.phase) * 3 * drift;
      const pr = puff.r * k * (1 + 0.04 * Math.sin(state.clock * 1.6 + puff.phase));
      // Two solid toon puffs per puff: a body and a smaller crown, rising slowly.
      for (let layer = 0; layer < 3; layer++) {
        const m = puffMeshes[pm++];
        const sz = pr * (layer === 0 ? 0.72 : layer === 1 ? 0.5 : 0.34);
        const off = layer === 0 ? 0 : (layer === 1 ? 0.35 : -0.3) * pr;
        m.visible = true;
        m.scale.setScalar(sz);
        m.position.copy(
          at({ x: px + off, y: py - off * 0.6 }, sz * 0.75 + layer * pr * 0.42 + Math.min(age, 3) * 3),
        );
        m.rotation.set(puff.angle, puff.angle * 0.7 + puff.spin * age, pi);
      }
      let redness = 0;
      for (const w of seen) {
        const d = Math.hypot(px - w.x, py - w.y);
        if (d < 520) redness = Math.max(redness, 1 - d / 520);
      }
      for (let layer = 0; layer < SMOKE_LAYERS; layer++) {
        const s = smokeSprites[n++];
        const lift = 0.7 + layer * 0.42;
        const size = pr * 2.3;
        s.visible = true;
        s.position.copy(at({ x: px, y: py }, pr * lift + (layer === 2 ? age * 6 : 0)));
        s.scale.set(size, size, 1);
        const mat = s.material as THREE.SpriteMaterial;
        mat.rotation = puff.angle + puff.spin * age + layer;
        mat.opacity = 0.5;
        // Lower layers a touch blue (shadowed), top layer white (moonlit), red where a beam hits.
        tmpColor.setRGB(0.82 + layer * 0.09, 0.88 + layer * 0.06, 0.98);
        tmpColor.lerp(new THREE.Color(1, 0.72, 0.76), redness * 0.35);
        mat.color.copy(tmpColor);
      }
    });
  }

  // One red "seen by" line per runner, from the watcher that spotted them through the gap.
  const seenLines: Line2[] = [];
  for (let i = 0; i < 5; i++) {
    const l = makeLine(C.coral, 5, false, 0.95);
    (l.material as LineMaterial).depthTest = false;
    l.renderOrder = 10;
    seenLines.push(l);
  }

  function updateRunners(state: GameState): void {
    const poses = squadPoses(state, 1.75);
    const cloud = state.cloud;
    poses.forEach((p, i) => {
      // Inside the cloud: draw faint, so "hidden" reads as hidden while the player can still count heads.
      const hidden = !!cloud && Math.hypot(p.x - cloud.center.x, p.y - cloud.center.y) < cloud.radius * 0.95;
      const line = seenLines[i];
      line.visible = false;
      if (p.spotted && (state.phase === 'reveal' || state.phase === 'result')) {
        const clouds = cloud ? [cloud] : [];
        const seer = state.level.watchers.find((w) => {
          const d = Math.hypot(p.x - w.x, p.y - w.y) || 1;
          const dir = { x: (p.x - w.x) / d, y: (p.y - w.y) / d };
          if (raycast(w, dir, d - 1, state.walls)) return false;
          return !clouds.some((c) => segmentCircleEntry(w, p, c.center, c.radius));
        });
        if (seer) {
          setLine(line, [seer, p], EYE_HEIGHT * 0.6);
          (line.material as LineMaterial).opacity = 0.6 + 0.4 * Math.sin(state.clock * 14);
        }
      }
      const r = runners[i];
      const show = state.phase !== 'summary' && state.phase !== 'attract';
      r.fig.group.visible = r.shadow.visible = show;
      const bob = p.running ? Math.abs(Math.sin(state.clock * 16 + i)) * 4 : 0;
      r.fig.group.position.copy(at(p, 1 + p.hop + bob));
      const stride = p.running ? Math.sin(state.clock * 18 + i * 1.7) : 0;
      r.fig.group.rotation.set(0, -p.heading, stride * 0.12);
      r.fig.legs[0].rotation.z = stride * 0.7;
      r.fig.legs[1].rotation.z = -stride * 0.7;
      const opacity = p.spotted ? 1 : hidden ? 0.45 : p.alpha;
      r.fig.mats[0].opacity = r.fig.mats[1].opacity = opacity;
      r.fig.mats[0].color.set(p.spotted ? 0xffb3ba : C.ceramic);
      r.shadow.position.copy(at({ x: p.x + 4, y: p.y + 6 }, 0.5));
      r.halo.visible = show && p.spotted;
      r.halo.position.copy(at(p, 1));
      const tagEl = spotTags[i];
      const running = state.phase === 'reveal' || state.phase === 'result';
      if (!running || !p.spotted) spottedAt[i] = -1;
      else if (spottedAt[i] < 0) spottedAt[i] = state.clock;
      const since = spottedAt[i] < 0 ? -1 : state.clock - spottedAt[i];
      tagEl.hidden = since < 0 || since > 1.1;
      if (!tagEl.hidden) {
        const sp = project(p, 40);
        tagEl.style.left = `${sp.x}px`;
        tagEl.style.top = `${sp.y}px`;
      }
    });
  }

  function updateEffects(state: GameState): void {
    const n = state.particles.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    state.particles.forEach((p, i) => {
      const life = Math.max(0, p.life / p.max);
      pos.set([p.x - CX, 14 + (1 - life) * 46, p.y - CZ], i * 3);
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
      drones.forEach((d, i) => {
        const base = d.userData.base as THREE.Vector3;
        // Slow and small: the throw, the beams and the smoke own the screen.
        d.position.set(base.x + Math.sin(state.clock * 0.12 + i * 2) * 22, base.y + Math.sin(state.clock * 0.8 + i) * 4, base.z);
        d.rotation.y = Math.sin(state.clock * 0.15 + i) * 0.3;
      });
      updateWatchers(state);
      updateAim(state);
      updateCanister(state);
      updateSmoke(state);
      updateRunners(state);
      sightLines.visible = false;
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
    project,
    stats() {
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
      };
    },
    dispose() {
      tag.remove();
      you.remove();
      spotTags.forEach((d) => d.remove());
      composer.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
