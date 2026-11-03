// Lớp đồ hoạ 3D (three.js): bầu trời đêm, thành phố có chiều sâu, trùm 3D, laser/tên lửa/vụ nổ phát sáng, bloom.
// Canvas 2D của game vẽ đè lên trên (bong bóng người xem, chữ, HUD) — hai lớp dùng chung hệ toạ độ sân khấu 1080×1920.
//
// Camera phối cảnh đặt thấp nhìn lên đĩa bay; dùng setViewOffset (dịch tâm ảnh) để mặt phẳng chơi z = 0 trùng khít
// toạ độ 2D: 1 đơn vị = 1 px sân khấu. Thành phố nằm sau mặt phẳng (z < 0) nên có thị sai & sương mù thật.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { BossId } from "../game/bosses";
import { buildBoss, PITCH, SPIN, type BossModel } from "./models";
import type { BlastView, View3D } from "./view";

const W = 1080;
const H = 1920;
/** khoảng cách camera → mặt phẳng chơi */
const D = 2800;
/** độ cao mắt so với tâm sân khấu (âm = thấp hơn): đường chân trời ở y = 960 − EYE */
const EYE = -260;
const GROUND = 960 - 1480;

export interface WorldOptions {
  bloom: boolean;
  /** 0.5..1: tỉ lệ độ phân giải */
  quality: number;
}

const hdr = (hex: string | number, k: number) => new THREE.Color(hex).multiplyScalar(k);

export class World3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private root = new THREE.Group();
  private bosses = new Map<BossId, BossModel>();
  private current: BossModel | null = null;
  private currentId: BossId | null = null;
  private spin = 0;
  private ufoLight = new THREE.PointLight(0xffffff, 0, 1600, 0);
  private beamCone: THREE.Mesh;
  private shieldBall: THREE.Mesh;
  private laserPool: THREE.Mesh[] = [];
  private rocketPool: THREE.Group[] = [];
  private blastFx = new Map<object, { ball: THREE.Mesh; ring: THREE.Mesh }>();
  private flashLights: THREE.PointLight[] = [];
  private searchlights: THREE.Group[] = [];
  private roofLights: THREE.Mesh[] = [];
  private clouds: THREE.Mesh[] = [];
  private lastT = 0;
  private flashOn = false;

  constructor(canvas: HTMLCanvasElement, private opts: WorldOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const fullH = H + 2 * Math.abs(EYE);
    this.camera = new THREE.PerspectiveCamera((2 * Math.atan(fullH / 2 / D) * 180) / Math.PI, W / fullH, 20, 30000);
    this.camera.position.set(0, EYE, D);
    this.camera.setViewOffset(W, fullH, 0, Math.abs(EYE) + EYE, W, H);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.scene.background = this.skyTexture();
    this.scene.fog = new THREE.Fog(0x0b1238, D + 400, D + 9000);
    this.scene.add(this.root);

    this.scene.add(new THREE.HemisphereLight(0x3a50a0, 0x05050a, 0.35));
    const moon = new THREE.DirectionalLight(0xaec4ff, 1.1);
    moon.position.set(-1, 1.2, 0.8);
    this.scene.add(moon);
    this.root.add(this.ufoLight);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 1200, 0);
      this.root.add(l);
      this.flashLights.push(l);
    }

    this.buildSky();
    this.buildCity();

    // tia hút dưới bụng UFO
    const beamTex = this.gradientTex(["rgba(255,255,255,0.9)", "rgba(255,255,255,0.25)", "rgba(255,255,255,0)"]);
    this.beamCone = new THREE.Mesh(
      new THREE.CylinderGeometry(60, 260, 1, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: beamTex, color: 0x9dff7a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.root.add(this.beamCone);
    // khiên tinh thể
    this.shieldBall = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.MeshBasicMaterial({ color: hdr(0x7ff0ff, 1.2), wireframe: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.root.add(this.shieldBall);

    if (opts.bloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.6, 0.45, 0.9));
      this.composer.addPass(new OutputPass());
    }
  }

  /** đổi kích thước theo khung hiển thị (CSS px) */
  resize(cssW: number, cssH: number) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * this.opts.quality;
    // không vẽ quá độ phân giải sân khấu (1080×1920)
    const scale = Math.min(ratio, W / Math.max(cssW, 1));
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(cssW, cssH, false);
    this.composer?.setPixelRatio(scale);
    this.composer?.setSize(cssW, cssH);
  }

  /** điểm có toạ độ màn hình (x, y) nằm ở độ sâu z (z < 0 là xa hơn mặt phẳng chơi) */
  private at(x: number, y: number, z = 0) {
    const k = (D - z) / D;
    return new THREE.Vector3((x - W / 2) * k, EYE + (960 - y - EYE) * k, z);
  }

  private gradientTex(stops: string[], vertical = true) {
    const cv = document.createElement("canvas");
    cv.width = vertical ? 4 : 256;
    cv.height = vertical ? 256 : 4;
    const c = cv.getContext("2d")!;
    const g = vertical ? c.createLinearGradient(0, 0, 0, 256) : c.createLinearGradient(0, 0, 256, 0);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    c.fillStyle = g;
    c.fillRect(0, 0, cv.width, cv.height);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private skyTexture() {
    const cv = document.createElement("canvas");
    cv.width = 270;
    cv.height = 480;
    const c = cv.getContext("2d")!;
    const g = c.createLinearGradient(0, 0, 0, 480);
    g.addColorStop(0, "#03040c");
    g.addColorStop(0.45, "#0a1030");
    g.addColorStop(0.7, "#1a1f4a");
    g.addColorStop(0.85, "#3a2a55");
    g.addColorStop(1, "#140c1e");
    c.fillStyle = g;
    c.fillRect(0, 0, 270, 480);
    // dải ngân hà chéo
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const u = Math.random();
      const x = 270 * u + (Math.random() - 0.5) * 60;
      const y = 40 + 260 * (1 - u) + (Math.random() - 0.5) * 60;
      const r = 10 + Math.random() * 30;
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${120 + Math.random() * 60},${100 + Math.random() * 60},200,0.06)`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = rg;
      c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildSky() {
    // sao: điểm sáng xa, nhấp nháy nhẹ nhờ bloom
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = this.at(Math.random() * W * 1.1 - W * 0.05, Math.random() * 1250, -12000);
      pos.set([p.x, p.y, p.z], i * 3);
      const b = 0.4 + Math.random() * (Math.random() < 0.05 ? 3 : 0.9);
      col.set([b, b, b * (0.9 + Math.random() * 0.3)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 9, sizeAttenuation: true, vertexColors: true, fog: false, toneMapped: false, transparent: true, depthWrite: false }));
    this.scene.add(stars);
    // trăng
    const moonPos = this.at(150, 330, -10000);
    const k = (D + 10000) / D;
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(60 * k, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0xdfe6ff, emissive: 0xcfd8ff, emissiveIntensity: 0.7, roughness: 1, fog: false }),
    );
    moon.position.copy(moonPos);
    this.scene.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTex("rgba(180,200,255,0.45)"), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.setScalar(200 * k);
    halo.position.copy(moonPos).add(new THREE.Vector3(0, 0, 10));
    this.scene.add(halo);
    // mây trôi
    const cloudTex = this.cloudTex();
    for (let i = 0; i < 9; i++) {
      const z = -1500 - Math.random() * 5000;
      const kk = (D - z) / D;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(900 * kk, 260 * kk),
        new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.08 + Math.random() * 0.1, depthWrite: false, color: 0x8090c8 }),
      );
      m.position.copy(this.at(Math.random() * W, 450 + Math.random() * 700, z));
      m.userData.speed = (8 + Math.random() * 18) * kk;
      m.userData.span = W * kk * 1.6;
      this.scene.add(m);
      this.clouds.push(m);
    }
  }

  private radialTex(inner: string) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const c = cv.getContext("2d")!;
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private cloudTex() {
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 160;
    const c = cv.getContext("2d")!;
    for (let i = 0; i < 60; i++) {
      const x = 60 + Math.random() * 392;
      const y = 50 + Math.random() * 60;
      const r = 20 + Math.random() * 60;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.22)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** ô cửa sổ sáng ngẫu nhiên (bản đồ phát sáng của toà nhà) */
  private windowTex() {
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 256;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#000";
    c.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 256; y += 22) {
      for (let x = 8; x < 128; x += 20) {
        if (Math.random() < 0.55) continue;
        const warm = Math.random();
        c.fillStyle = warm < 0.6 ? `rgba(255,${190 + Math.random() * 50},${110 + Math.random() * 60},${0.5 + Math.random() * 0.5})` : warm < 0.85 ? "rgba(150,210,255,0.8)" : "rgba(255,120,200,0.7)";
        c.fillRect(x, y, 10, 12);
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  private buildCity() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 30000), new THREE.MeshStandardMaterial({ color: 0x0a0c16, roughness: 0.9, metalness: 0.1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, GROUND, -12000);
    this.root.add(ground);
    const texes = Array.from({ length: 4 }, () => this.windowTex());
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const layers = [-120, -380, -750, -1250, -1900, -2800, -4000, -5600];
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a2a, emissiveIntensity: 3 });
    for (const z of layers) {
      const k = (D - z) / D;
      const half = (W / 2) * k + 300;
      let x = -half + Math.random() * 120;
      while (x < half) {
        // kích thước thật (không nhân theo độ sâu) → toà xa trông thấp & nhỏ hơn, có chiều sâu tự nhiên
        const w = 80 + Math.random() * 170;
        const h = (z > -500 ? 120 + Math.random() * 330 : 220 + Math.random() * 520) * (Math.random() < 0.12 ? 1.5 : 1);
        const d = 80 + Math.random() * 200;
        const tex = texes[(Math.random() * texes.length) | 0].clone();
        tex.repeat.set(Math.max(1, w / 160), Math.max(1, h / 300));
        tex.needsUpdate = true;
        const shade = 0.03 + Math.random() * 0.04;
        const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade, shade * 1.1, shade * 1.6), roughness: 0.85, metalness: 0.1, envMapIntensity: 0.15, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: z > -800 ? 0.55 : 0.75 });
        const b = new THREE.Mesh(box, mat);
        b.scale.set(w, h, d);
        b.position.set(x + w / 2, GROUND, z - d / 2);
        this.root.add(b);
        // đèn đỏ trên nóc nhà cao
        if (h > 500 && Math.random() < 0.6) {
          const r = new THREE.Mesh(new THREE.SphereGeometry(5 * Math.min(k, 2), 8, 6), roofMat.clone());
          r.position.set(x + w / 2, GROUND + h + 6, z - d / 2);
          r.userData.phase = Math.random() * 6;
          this.root.add(r);
          this.roofLights.push(r);
        }
        x += w + 6 + Math.random() * 40;
      }
    }
    // khung tiền cảnh: 2 toà tối sát mép dưới tạo chiều sâu
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x05060c, roughness: 0.9, emissive: 0xffffff, emissiveMap: (() => { const t = texes[0].clone(); t.repeat.set(3, 6); t.needsUpdate = true; return t; })(), emissiveIntensity: 0.5 }));
      b.scale.set(220, 300, 200);
      b.position.set(sx * 560, GROUND - 40, 420);
      this.root.add(b);
    }
    // đèn pha quét trời
    const beamTex = this.gradientTex(["rgba(200,220,255,0.0)", "rgba(200,220,255,0.35)", "rgba(200,220,255,0.6)"]);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(150, 12, 2600, 32, 1, true),
        new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.position.y = 1300;
      g.add(cone);
      g.position.set((i - 1) * 900 + (Math.random() - 0.5) * 200, GROUND, -1500 - i * 600);
      g.userData.phase = i * 2.1;
      this.root.add(g);
      this.searchlights.push(g);
    }
  }

  private model(id: BossId, width: number) {
    let m = this.bosses.get(id);
    if (!m) {
      m = buildBoss(id, width);
      this.bosses.set(id, m);
      this.root.add(m.group);
    }
    return m;
  }

  private laser(i: number) {
    let m = this.laserPool[i];
    if (!m) {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
      const glowM = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hdr(0xffffff, 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      core.scale.set(0.3, 1, 0.3);
      m = glowM;
      m.add(core);
      this.root.add(m);
      this.laserPool[i] = m;
    }
    return m;
  }

  private placeBeam(m: THREE.Mesh, x0: number, y0: number, x1: number, y1: number, r: number) {
    const a = this.at(x0, y0);
    const b = this.at(x1, y1);
    const d = b.clone().sub(a);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(r, d.length(), r);
    m.rotation.set(0, 0, Math.atan2(d.y, d.x) - Math.PI / 2);
  }

  private rocket(i: number) {
    let g = this.rocketPool[i];
    if (!g) {
      g = new THREE.Group();
      const spinG = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 26, 14), new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 0.7, roughness: 0.25 }));
      body.rotation.z = -Math.PI / 2;
      spinG.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(5, 14, 14), new THREE.MeshStandardMaterial({ color: 0xff4757, metalness: 0.4, roughness: 0.3 }));
      nose.rotation.z = -Math.PI / 2;
      nose.position.x = 20;
      spinG.add(nose);
      for (let k = 0; k < 4; k++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(9, 0.8, 7), nose.material);
        fin.position.set(-11, 0, 0);
        fin.rotation.x = (k / 4) * Math.PI * 2;
        fin.translateY(6);
        spinG.add(fin);
      }
      g.add(spinG);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(5, 34, 14, 1, true), new THREE.MeshBasicMaterial({ color: hdr(0xffa040, 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      flame.rotation.z = Math.PI / 2;
      flame.position.x = -30;
      g.add(flame);
      g.userData = { spinG, nose, flame };
      this.root.add(g);
      this.rocketPool[i] = g;
    }
    return g;
  }

  private blast(b: BlastView) {
    let fx = this.blastFx.get(b.ref);
    if (!fx) {
      const color = hdr(b.color, 3);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: hdr(b.color, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      this.root.add(ball, ring);
      fx = { ball, ring };
      this.blastFx.set(b.ref, fx);
    }
    const u = b.age / 0.6;
    const p = this.at(b.x, b.y, 20);
    fx.ball.position.copy(p);
    fx.ball.scale.setScalar(b.size * (0.25 + 0.6 * Math.sqrt(Math.min(u, 1))));
    (fx.ball.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - u) * 0.9;
    fx.ring.position.copy(p);
    fx.ring.scale.setScalar(b.size * (0.3 + 0.9 * u));
    (fx.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - u) * 0.45;
    return u < 1;
  }

  render(v: View3D) {
    const dt = Math.min(0.1, Math.max(0, v.time - this.lastT));
    this.lastT = v.time;
    const t = v.time;

    // rung màn hình & cảnh nuốt cả phố
    this.camera.position.set(v.shake > 0.3 ? (Math.random() - 0.5) * v.shake * 2 : 0, EYE + (v.shake > 0.3 ? (Math.random() - 0.5) * v.shake * 2 : 0), D);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1);
    if (v.tiltWorld) {
      const { k, mx, my } = v.tiltWorld;
      const m = this.at(mx, my);
      const s = 1 - 0.18 * k;
      const rot = -0.22 * k * k;
      // xoay & co quanh miệng hố đen: p' = m + R·S·(p − m)
      this.root.scale.setScalar(s);
      this.root.rotation.z = rot;
      const off = m.clone().multiplyScalar(-s).applyAxisAngle(new THREE.Vector3(0, 0, 1), rot).add(m);
      this.root.position.copy(off);
    }

    // trời & thành phố sống động
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > c.userData.span / 2) c.position.x = -c.userData.span / 2;
    }
    for (const r of this.roofLights) (r.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 2.2 + r.userData.phase) > 0.2 ? 3.5 : 0.3;
    for (const s of this.searchlights) {
      s.rotation.z = Math.sin(t * 0.25 + s.userData.phase) * 0.55;
      s.rotation.x = Math.sin(t * 0.18 + s.userData.phase) * 0.15 - 0.15;
    }

    // trùm
    const want = v.boss;
    if (want !== this.currentId) {
      if (this.current) this.current.group.visible = false;
      this.current = this.model(want, v.width);
      this.currentId = want;
      this.spin = 0;
    }
    const m = this.current!;
    m.group.visible = v.alive;
    if (v.alive) {
      const p = this.at(v.ux, v.uy);
      m.group.position.copy(p);
      this.spin += SPIN[want] * dt;
      m.group.rotation.set(PITCH[want] + Math.sin(t * 0.9) * 0.04, this.spin + (SPIN[want] ? 0 : Math.sin(t * 0.6) * 0.18), -v.tilt * 0.6 + Math.sin(t * 1.1) * 0.03);
      m.update(t, v);
      this.applyMaterials(m.group, v.hitFlash, v.cloak);
      // ánh sáng màu trùm hắt xuống phố
      this.ufoLight.color.set(v.bossColor);
      this.ufoLight.intensity = 0.7 + 0.35 * Math.sin(t * 5) + v.hitFlash;
      this.ufoLight.position.copy(this.at(v.ux, v.uy + v.belly, 120));
      // tia hút
      const beamMat = this.beamCone.material as THREE.MeshBasicMaterial;
      beamMat.opacity = Math.min(0.55, v.beam * 0.6) * (0.8 + 0.2 * Math.sin(t * 20));
      this.beamCone.visible = beamMat.opacity > 0.01;
      if (this.beamCone.visible) {
        const top = this.at(v.ux, v.uy + v.belly);
        const bottom = this.at(v.ux, 1480);
        this.beamCone.position.copy(top).add(bottom).multiplyScalar(0.5);
        this.beamCone.scale.set(1, top.y - bottom.y, 1);
        beamMat.color.set(v.bossColor);
      }
      // khiên tinh thể: lưới lục giác bao quanh trùm
      const sh = this.shieldBall.material as THREE.MeshBasicMaterial;
      sh.opacity = v.shield * (0.35 + 0.1 * Math.sin(t * 6));
      this.shieldBall.visible = v.shield > 0.01;
      if (this.shieldBall.visible) {
        this.shieldBall.position.copy(p);
        this.shieldBall.scale.setScalar(v.width * 0.62);
        this.shieldBall.rotation.set(t * 0.3, t * 0.5, 0);
      }
    } else {
      this.ufoLight.intensity = 0;
      this.beamCone.visible = false;
      this.shieldBall.visible = false;
    }

    // laser
    let li = 0;
    for (const l of v.lasers) {
      const mm = this.laser(li++);
      mm.visible = true;
      this.placeBeam(mm, l.x0, l.y0, l.x1, l.y1, 4.5);
      const mat = mm.material as THREE.MeshBasicMaterial;
      mat.color.copy(hdr(l.color, l.gold ? 1.8 : 1.4));
      mat.opacity = 0.5 * l.fade;
      ((mm.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = l.fade;
    }
    // tia năng lượng quà lớn
    for (const b of v.beams) {
      const mm = this.laser(li++);
      mm.visible = true;
      const r = b.style === "orbital" ? 70 : b.style === "earth" ? 55 : 12;
      if (b.style === "twin") {
        this.placeBeam(mm, b.x0 - 14, b.y0, b.x1, b.y1, r * b.k);
        const m2 = this.laser(li++);
        m2.visible = true;
        this.placeBeam(m2, b.x0 + 14, b.y0, b.x1, b.y1, r * b.k);
        (m2.material as THREE.MeshBasicMaterial).color.copy(hdr(0xff5adc, 2.5));
        (m2.material as THREE.MeshBasicMaterial).opacity = 0.8;
      } else this.placeBeam(mm, b.x0, b.y0, b.x1, b.y1, r * b.k * (0.9 + 0.1 * Math.sin(t * 40)));
      const mat = mm.material as THREE.MeshBasicMaterial;
      mat.color.copy(hdr(b.style === "orbital" ? 0x9fd8ff : b.style === "earth" ? 0xff5a6e : 0x5ad1ff, 2.6));
      mat.opacity = 0.8;
      ((mm.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1;
    }
    for (let i = li; i < this.laserPool.length; i++) this.laserPool[i].visible = false;

    // tên lửa
    let ri = 0;
    for (const r of v.rockets) {
      const g = this.rocket(ri++);
      g.visible = true;
      g.position.copy(this.at(r.x, r.y, 10));
      g.rotation.set(0, 0, -r.ang);
      g.scale.setScalar(r.sc * 0.9);
      const { spinG, nose, flame } = g.userData as { spinG: THREE.Group; nose: THREE.Mesh; flame: THREE.Mesh };
      spinG.rotation.x = t * 9;
      (nose.material as THREE.MeshStandardMaterial).color.set(r.color === "#ffffff" ? "#ff4757" : r.color);
      flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    }
    for (let i = ri; i < this.rocketPool.length; i++) this.rocketPool[i].visible = false;

    // vụ nổ: cầu lửa + sóng xung kích + chớp sáng chiếu lên thành phố
    const live = new Set<object>();
    const fresh: BlastView[] = [];
    for (const b of v.blasts) {
      if (this.blast(b)) {
        live.add(b.ref);
        if (b.age < 0.35) fresh.push(b);
      }
    }
    for (const [ref, fx] of this.blastFx) {
      if (live.has(ref)) continue;
      this.root.remove(fx.ball, fx.ring);
      (fx.ball.material as THREE.Material).dispose();
      (fx.ring.material as THREE.Material).dispose();
      fx.ball.geometry.dispose();
      fx.ring.geometry.dispose();
      this.blastFx.delete(ref);
    }
    fresh.sort((a, b) => b.size - a.size);
    this.flashLights.forEach((l, i) => {
      const b = fresh[i];
      if (!b) {
        l.intensity = 0;
        return;
      }
      l.position.copy(this.at(b.x, b.y, 150));
      l.color.set(b.color);
      l.intensity = (b.size / 60) * (1 - b.age / 0.35) * 1.6;
    });

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** nháy trắng khi trúng đạn, mờ khi tàng hình */
  private applyMaterials(g: THREE.Object3D, flash: number, cloak: number) {
    const on = flash > 0.02 || cloak > 0.02;
    if (!on && !this.flashOn) return;
    this.flashOn = on;
    const white = new THREE.Color(1, 1, 1);
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.material) return;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
      for (const mat of mats) {
        const base = mat.userData.baseEmissive as THREE.Color | undefined;
        if (base && mat.emissive) mat.emissive.copy(base).lerp(white, flash * 0.22);
        const op = (mat.userData.baseOpacity ?? 1) * (1 - 0.85 * cloak);
        mat.transparent = cloak > 0.02 ? true : mat.userData.baseTransparent ?? false;
        mat.opacity = op;
      }
    });
  }
}
