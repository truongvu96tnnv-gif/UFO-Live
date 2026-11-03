// 12 model trùm 3D dựng bằng hình khối của three.js (không cần file model ngoài).
// Mỗi model dựng theo đơn vị chuẩn (bán kính ~1) rồi được chuẩn hoá về đúng độ rộng của art 2D (BOSS_ART.width).

import * as THREE from "three";
import type { BossId } from "../game/bosses";
import type { View3D } from "./view";

export interface BossModel {
  group: THREE.Group;
  /** hoạt ảnh riêng của model (đèn chạy, xúc tu, chân, cánh…) */
  update(t: number, v: View3D): void;
}

const TAU = Math.PI * 2;

const metal = (color: THREE.ColorRepresentation, metalness = 0.75, roughness = 0.32) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const glow = (color: THREE.ColorRepresentation, intensity = 2.2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.6 });
const glass = (color: THREE.ColorRepresentation, opacity = 0.55, emissive = 0.35) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.05, transparent: true, opacity, emissive: color, emissiveIntensity: emissive, clearcoat: 1, depthWrite: false });
const additive = (color: THREE.ColorRepresentation, opacity = 0.6) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function lathe(profile: [number, number][], segments = 64) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** đĩa bay cơ bản: thân tiện tròn + vòm kính */
function saucer(bodyColor: THREE.ColorRepresentation, domeColor: THREE.ColorRepresentation, domeR = 0.34) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    lathe([[0, -0.2], [0.3, -0.22], [0.66, -0.15], [0.96, -0.04], [1.02, 0], [0.98, 0.04], [0.7, 0.12], [0.42, 0.17], [0, 0.19]]),
    metal(bodyColor),
  );
  g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(domeR, 40, 20, 0, TAU, 0, Math.PI / 2), glass(domeColor));
  dome.position.y = 0.16;
  g.add(dome);
  return g;
}

/** vòng đèn quanh vành, chạy đuổi */
function rimLights(g: THREE.Group, n: number, r: number, y: number, colors: THREE.ColorRepresentation[], size = 0.045) {
  const mats = colors.map((c) => glow(c, 3));
  const lights: THREE.Mesh[] = [];
  const geo = new THREE.SphereGeometry(size, 10, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const m = new THREE.Mesh(geo, mats[i % mats.length].clone());
    m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    g.add(m);
    lights.push(m);
  }
  return (t: number, speed = 6) => {
    lights.forEach((m, i) => {
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + 3 * Math.max(0, Math.sin(t * speed - i * 0.8));
    });
  };
}

function canvasTex(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  paint(cv.getContext("2d")!);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- UFO thường

function ufo(): BossModel {
  const group = saucer(0x9aa3b2, 0x7fe8ff);
  const chase = rimLights(group, 18, 0.98, 0, [0xff3344, 0xffd060]);
  // 3 ống phản lực xanh dưới bụng
  const jets: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.12, 16), metal(0x55606e));
    pod.position.set(Math.cos(a) * 0.5, -0.22, Math.sin(a) * 0.5);
    group.add(pod);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 16, 1, true), additive(0x5ad1ff, 0.8));
    jet.position.set(pod.position.x, -0.42, pod.position.z);
    jet.rotation.x = Math.PI;
    group.add(jet);
    jets.push(jet);
  }
  return {
    group,
    update(t) {
      chase(t);
      jets.forEach((j, i) => j.scale.set(1, 0.8 + 0.35 * Math.sin(t * 30 + i * 2), 1));
    },
  };
}

function ufo2(): BossModel {
  const group = saucer(0x6f7d92, 0x3aa8ff, 0.42);
  const chase = rimLights(group, 14, 0.98, 0, [0x5ad1ff, 0xffffff]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.38, 12), metal(0xc8d4e6, 0.9, 0.2));
    spike.position.set(Math.cos(a) * 0.62, 0.26, Math.sin(a) * 0.62);
    spike.rotation.z = -Math.cos(a) * 0.4;
    spike.rotation.x = Math.sin(a) * 0.4;
    group.add(spike);
  }
  // cổng hút dưới bụng
  const portal = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 12, 48), glow(0x5ad1ff, 3));
  portal.rotation.x = Math.PI / 2;
  portal.position.y = -0.23;
  group.add(portal);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.28, 40), additive(0x9fe6ff, 0.7));
  core.rotation.x = Math.PI / 2;
  core.position.y = -0.235;
  group.add(core);
  return {
    group,
    update(t) {
      chase(t, 4);
      const k = 0.5 + 0.5 * Math.sin(t * 5);
      (core.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * k;
      (portal.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + 2.5 * k;
    },
  };
}

function ufo3(): BossModel {
  const group = new THREE.Group();
  const base = new THREE.Mesh(lathe([[0, -0.35], [0.5, -0.33], [0.95, -0.2], [1, -0.14], [0.6, -0.08], [0, -0.08]]), metal(0x5d6270));
  group.add(base);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 24), glow(0xb46bff, 2.5));
  core.position.y = 0.22;
  group.add(core);
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({ color: 0x9ff8ff, wireframe: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
  inner.position.y = 0.22;
  group.add(inner);
  const arcs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 10, 60, Math.PI * 1.05), metal(0x8892a4, 0.9, 0.25));
    arc.position.y = -0.1;
    arc.rotation.y = (i / 4) * Math.PI;
    group.add(arc);
    arcs.push(arc);
  }
  // tia điện chập chờn quanh lõi
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 2 * 24), 3));
  const bolts = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ color: 0xd9a8ff, transparent: true, blending: THREE.AdditiveBlending }));
  group.add(bolts);
  let lastBolt = -1;
  return {
    group,
    update(t) {
      const k = 0.5 + 0.5 * Math.sin(t * 6);
      (core.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.8 + 1.6 * k;
      core.scale.setScalar(0.95 + 0.08 * k);
      inner.rotation.set(t * 0.9, t * 1.3, 0);
      if (t - lastBolt > 0.07) {
        lastBolt = t;
        const p = boltGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 24; i++) {
          const a = Math.random() * TAU;
          const b = Math.random() * 1.2 - 0.3;
          const r0 = 0.42;
          const r1 = 0.62 + Math.random() * 0.12;
          p.setXYZ(i * 2, Math.cos(a) * r0, 0.22 + b * 0.3, Math.sin(a) * r0);
          p.setXYZ(i * 2 + 1, Math.cos(a + (Math.random() - 0.5) * 0.5) * r1, 0.22 + b * 0.4 + (Math.random() - 0.5) * 0.2, Math.sin(a) * r1);
        }
        p.needsUpdate = true;
      }
    },
  };
}

// ---------------------------------------------------------------- trùm ngẫu nhiên

function gold(): BossModel {
  const goldMat = metal(0xffc24a, 1, 0.22);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(lathe([[0, -0.16], [0.4, -0.18], [0.8, -0.1], [1.02, -0.02], [1.04, 0.02], [0.8, 0.09], [0.45, 0.13], [0, 0.14]]), goldMat));
  for (const r of [0.55, 0.78, 0.95]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.015, 8, 80), metal(0xfff0b0, 1, 0.15));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = r > 0.9 ? 0.03 : 0.12 - r * 0.08;
    group.add(ring);
  }
  // vương miện gai + ngọc đỏ
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, i % 2 ? 0.26 : 0.4, 10), goldMat);
    spike.position.set(Math.cos(a) * 0.34, 0.24, Math.sin(a) * 0.34);
    group.add(spike);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: 0xff2040, emissive: 0xff1030, emissiveIntensity: 1.8, metalness: 0.2, roughness: 0.1 }));
  gem.position.y = 0.3;
  group.add(gem);
  // vòng vàng bay quanh
  const halo = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.25 + i * 0.12, 0.012, 6, 100), glow(0xffd55a, 2));
    r.rotation.x = Math.PI / 2 + 0.25 * (i ? 1 : -1);
    halo.add(r);
  }
  group.add(halo);
  const chase = rimLights(group, 16, 1.0, 0, [0xfff3c0]);
  return {
    group,
    update(t) {
      chase(t, 5);
      gem.rotation.y = t * 1.5;
      halo.rotation.y = t * 0.4;
      halo.rotation.z = Math.sin(t * 0.7) * 0.15;
    },
  };
}

function octopus(): BossModel {
  const group = new THREE.Group();
  const skin = canvasTex(256, 128, (c) => {
    c.fillStyle = "#7a3aa8";
    c.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 140; i++) {
      c.fillStyle = `rgba(${200 + Math.random() * 55},${120 + Math.random() * 60},255,${0.15 + Math.random() * 0.35})`;
      c.beginPath();
      c.arc(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 6, 0, TAU);
      c.fill();
    }
  });
  const skinMat = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.45, metalness: 0.05, emissive: 0x3a0a5a, emissiveIntensity: 0.4 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 48, 32), skinMat);
  head.scale.set(1, 1.2, 0.95);
  head.position.y = 0.25;
  group.add(head);
  const eyes: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffb400, emissiveIntensity: 1.6 })));
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    pupil.position.z = 0.13;
    eye.add(pupil);
    eye.position.set(sx * 0.27, 0.12, 0.5);
    group.add(eye);
    eyes.push(eye);
  }
  // 8 xúc tu: chuỗi khối cầu (instanced) uốn lượn
  const SEG = 16;
  const tent = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), skinMat, 8 * SEG);
  group.add(tent);
  const dummy = new THREE.Object3D();
  return {
    group,
    update(t, v) {
      const grab = v.charge;
      head.scale.set(1 + 0.04 * Math.sin(t * 2.2), 1.2 - 0.05 * Math.sin(t * 2.2), 0.95);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + 0.2;
        for (let i = 0; i < SEG; i++) {
          const s = i / (SEG - 1);
          const wave = Math.sin(t * 2.4 + k * 1.7 + s * 5) * 0.28 * s;
          const r = 0.42 + s * 0.95;
          const aa = a + Math.sin(t * 1.7 + k + s * 4) * 0.35 * s;
          dummy.position.set(Math.cos(aa) * r, -0.15 - s * (0.95 + grab * 0.4) + wave, Math.sin(aa) * r * 0.75);
          dummy.scale.setScalar(0.15 * (1 - s * 0.78));
          dummy.updateMatrix();
          tent.setMatrixAt(k * SEG + i, dummy.matrix);
        }
      }
      tent.instanceMatrix.needsUpdate = true;
      for (const e of eyes) e.scale.y = Math.sin(t * 0.9) > 0.97 ? 0.15 : 1;
    },
  };
}

function stealth(): BossModel {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.55);
  shape.lineTo(1.0, -0.22);
  shape.lineTo(0.78, -0.3);
  shape.lineTo(0.4, -0.12);
  shape.lineTo(0, -0.28);
  shape.lineTo(-0.4, -0.12);
  shape.lineTo(-0.78, -0.3);
  shape.lineTo(-1.0, -0.22);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 });
  geo.center();
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x101218, metalness: 0.5, roughness: 0.6 });
  wingMat.userData.env = 0.35; // sơn đen nhám hấp thụ ánh sáng
  const wing = new THREE.Mesh(geo, wingMat);
  wing.rotation.x = -Math.PI / 2;
  group.add(wing);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: 0x5ad1ff, transparent: true }));
  edges.rotation.x = -Math.PI / 2;
  group.add(edges);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, TAU, 0, Math.PI / 2), glass(0x5ad1ff, 0.7, 0.8));
  cockpit.scale.set(1, 0.6, 1.8);
  cockpit.position.set(0, 0.06, -0.12);
  group.add(cockpit);
  const engines: THREE.Mesh[] = [];
  for (const sx of [-0.45, 0.45]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), glow(0x5ad1ff, 3));
    e.position.set(sx, 0, 0.2);
    group.add(e);
    engines.push(e);
  }
  return {
    group,
    update(t) {
      (edges.material as THREE.LineBasicMaterial).opacity = 0.6 + 0.4 * Math.sin(t * 4);
      engines.forEach((e, i) => ((e.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(t * 25 + i)));
    },
  };
}

function spider(): BossModel {
  const group = new THREE.Group();
  const shell = metal(0x9ca3ad, 0.85, 0.3);
  const dark = metal(0x3a3f47, 0.8, 0.4);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 24), shell);
  body.scale.set(1.15, 0.55, 1);
  group.add(body);
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 20), dark);
  abdomen.scale.set(1, 0.7, 1.2);
  abdomen.position.set(0, 0.05, -0.55);
  group.add(abdomen);
  const core = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 12, 40), glow(0x7dff4a, 1.8));
  core.rotation.x = Math.PI / 2;
  core.position.y = 0.28;
  group.add(core);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), glow(0x7dff4a, 2));
  eye.position.set(0, 0.28, 0);
  group.add(eye);
  // 2 súng gatling trên lưng
  const guns: THREE.Group[] = [];
  for (const sx of [-0.42, 0.42]) {
    const gun = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), dark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.1);
      gun.add(barrel);
    }
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.28, 16), shell);
    housing.rotation.x = Math.PI / 2;
    housing.position.z = -0.2;
    gun.add(housing);
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 20), glow(0x7dff4a, 2));
    muzzle.position.z = 0.38;
    gun.add(muzzle);
    gun.position.set(sx, 0.36, 0.05);
    group.add(gun);
    guns.push(gun);
  }
  // 8 chân, mỗi chân 2 đốt
  const segGeo = new THREE.CylinderGeometry(0.045, 0.035, 1, 10);
  const legs: { a: number; upper: THREE.Mesh; lower: THREE.Mesh; tip: THREE.Mesh }[] = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const a = side * (0.5 + (i % 4) * 0.38) + (side < 0 ? Math.PI : 0);
    const upper = new THREE.Mesh(segGeo, shell);
    const lower = new THREE.Mesh(segGeo, dark);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 8), glow(0x7dff4a, 1.5));
    group.add(upper, lower, tip);
    legs.push({ a: i < 4 ? Math.PI - (0.5 + (i % 4) * 0.38) + 0.6 : 0.5 + (i % 4) * 0.38 - 0.6, upper, lower, tip });
    void a;
  }
  const up = new THREE.Vector3(0, 1, 0);
  const place = (m: THREE.Mesh, p0: THREE.Vector3, p1: THREE.Vector3) => {
    const d = p1.clone().sub(p0);
    m.position.copy(p0).addScaledVector(d, 0.5);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(up, d.normalize());
  };
  return {
    group,
    update(t) {
      legs.forEach((l, i) => {
        const phase = t * 3 + (i % 2) * Math.PI + (i % 4) * 0.6;
        const lift = Math.max(0, Math.sin(phase)) * 0.18;
        const swing = Math.cos(phase) * 0.12;
        const a = l.a + swing;
        const hip = new THREE.Vector3(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.4);
        const knee = new THREE.Vector3(Math.cos(a) * 0.95, 0.45 + lift, Math.sin(a) * 0.85);
        const foot = new THREE.Vector3(Math.cos(a) * 1.35, -0.55 + lift * 0.6, Math.sin(a) * 1.15);
        place(l.upper, hip, knee);
        place(l.lower, knee, foot);
        l.tip.position.copy(foot);
        l.tip.rotation.x = Math.PI;
      });
      guns.forEach((g, i) => (g.children.forEach((c, j) => j < 6 && (c.position.x = Math.cos((j / 6) * TAU + t * 8 * (i ? 1 : -1)) * 0.06, c.position.y = Math.sin((j / 6) * TAU + t * 8 * (i ? 1 : -1)) * 0.06))));
      (core.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + 0.8 * Math.sin(t * 4);
    },
  };
}

function devourer(): BossModel {
  const group = new THREE.Group();
  const hide = metal(0x3b2450, 0.6, 0.45);
  hide.userData.env = 0.8;
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), hide);
  group.add(ball);
  // gai theo pháp tuyến, chừa mặt trước cho miệng
  const ico = new THREE.IcosahedronGeometry(1, 1);
  const pos = ico.attributes.position as THREE.BufferAttribute;
  const seen = new Set<string>();
  const spikeMat = metal(0x6b4a86, 0.7, 0.35);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pos.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    const key = p.toArray().map((x) => x.toFixed(2)).join();
    if (seen.has(key) || p.z > 0.55) continue;
    seen.add(key);
    const len = 0.35 + Math.random() * 0.4;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, len, 8), spikeMat);
    spike.position.copy(p).multiplyScalar(0.98 + len / 2);
    spike.quaternion.setFromUnitVectors(up, p);
    group.add(spike);
  }
  // miệng hố đen + đĩa bồi tụ cam
  const maw = new THREE.Group();
  maw.position.z = 0.82;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  maw.add(hole);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.52 + i * 0.07, 0.025 - i * 0.005, 8, 72), glow(i ? 0xff6a1a : 0xffc060, 3 - i * 0.7));
    r.scale.set(1, 0.92, 1);
    maw.add(r);
    rings.push(r);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 6), metal(0xe8dcc8, 0.2, 0.5));
    tooth.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.02);
    tooth.rotation.z = a + Math.PI / 2;
    maw.add(tooth);
  }
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshStandardMaterial({ color: 0x2f7fff, emissive: 0x10305a, emissiveIntensity: 0.6, roughness: 0.6 }));
  earth.position.z = 0.15;
  maw.add(earth);
  group.add(maw);
  return {
    group,
    update(t, v) {
      ball.rotation.y = Math.sin(t * 0.3) * 0.2;
      rings.forEach((r, i) => (r.rotation.z = t * (1.5 + i) * (i % 2 ? -1 : 1)));
      const chew = 1 + 0.06 * Math.sin(t * 3) + v.charge * 0.25;
      maw.scale.set(chew, chew, 1);
      earth.position.set(Math.cos(t * 2) * 0.12, Math.sin(t * 2) * 0.1, 0.15);
      earth.rotation.y = t;
    },
  };
}

// ---------------------------------------------------------------- trùm mốc

function crystal(): BossModel {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x5fc8e8, emissive: 0x1a90c0, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.88, clearcoat: 1 });
  const shards: [number, number, number, number, number, number][] = [
    [0, 0, 0, 0.26, 1.5, 0],
    [-0.38, -0.1, 0.05, 0.18, 1.0, 0.35],
    [0.4, -0.05, -0.05, 0.2, 1.15, -0.3],
    [-0.2, -0.2, 0.3, 0.14, 0.75, 0.2],
    [0.22, -0.22, 0.28, 0.15, 0.8, -0.25],
    [0, -0.15, -0.35, 0.16, 0.9, 0.1],
    [-0.55, -0.25, -0.15, 0.11, 0.6, 0.6],
    [0.58, -0.25, 0.1, 0.12, 0.65, -0.55],
  ];
  for (const [x, y, z, r, h, tilt] of shards) {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), mat));
    const top = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.6, 6), mat);
    top.position.y = h / 2 + r * 0.8;
    s.add(top);
    const bot = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.2, 6), mat);
    bot.position.y = -h / 2 - r * 0.6;
    bot.rotation.x = Math.PI;
    s.add(bot);
    s.position.set(x, y, z);
    s.rotation.z = tilt;
    group.add(s);
  }
  const runes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.95 + i * 0.12, 0.014, 6, 120), glow(0x7ff0ff, 2.5));
    r.rotation.x = Math.PI / 2 + (i - 1) * 0.5;
    group.add(r);
    runes.push(r);
  }
  return {
    group,
    update(t) {
      runes.forEach((r, i) => (r.rotation.z = t * (0.5 + i * 0.3) * (i % 2 ? -1 : 1)));
      mat.emissiveIntensity = 0.4 + 0.25 * Math.sin(t * 2.5);
    },
  };
}

function mother(): BossModel {
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      lathe([[0, -0.2], [0.35, -0.22], [0.75, -0.16], [1.0, -0.06], [1.02, -0.02], [0.92, 0.02], [0.78, 0.05], [0.7, 0.09], [0.52, 0.11], [0.45, 0.15], [0.3, 0.17], [0, 0.18]], 96),
      metal(0x7a808c, 0.8, 0.35),
    ),
  );
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 40, 20, 0, TAU, 0, Math.PI / 2), glass(0xffc070, 0.6, 0.6));
  dome.position.y = 0.16;
  group.add(dome);
  // ô cửa khoang chứa quanh vành
  const winMat = glow(0xffb15a, 2.4);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.01), winMat);
    w.position.set(Math.cos(a) * 0.84, 0.035, Math.sin(a) * 0.84);
    w.rotation.y = -a + Math.PI / 2;
    group.add(w);
  }
  const chase = rimLights(group, 28, 1.01, -0.03, [0xffb15a, 0xff5030], 0.025);
  const bay = new THREE.Mesh(new THREE.CircleGeometry(0.3, 48), additive(0xffc070, 0.7));
  bay.rotation.x = Math.PI / 2;
  bay.position.y = -0.225;
  group.add(bay);
  const gyro = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.38 + i * 0.06, 0.012, 6, 80), glow(0xffd090, 2));
    r.rotation.x = Math.PI / 2;
    gyro.add(r);
  }
  gyro.position.y = -0.24;
  group.add(gyro);
  return {
    group,
    update(t) {
      chase(t, 3);
      (bay.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.35 * Math.sin(t * 3);
      gyro.rotation.y = t * 1.2;
      gyro.children.forEach((c, i) => (c.rotation.y = Math.sin(t + i) * 0.3));
    },
  };
}

function planet(): BossModel {
  const group = new THREE.Group();
  const lava = canvasTex(512, 256, (c) => {
    c.fillStyle = "#2a1410";
    c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(${60 + Math.random() * 40},${30 + Math.random() * 20},20,0.5)`;
      c.fillRect(Math.random() * 512, Math.random() * 256, 3 + Math.random() * 18, 3 + Math.random() * 10);
    }
  });
  const cracks = canvasTex(512, 256, (c) => {
    c.fillStyle = "#000";
    c.fillRect(0, 0, 512, 256);
    c.lineCap = "round";
    for (let i = 0; i < 40; i++) {
      let x = Math.random() * 512;
      let y = Math.random() * 256;
      c.strokeStyle = i % 3 ? "#ff5a10" : "#ffc040";
      c.lineWidth = 1 + Math.random() * 3;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (Math.random() - 0.5) * 50;
        y += (Math.random() - 0.5) * 30;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  });
  const rock = new THREE.MeshStandardMaterial({ map: lava, emissiveMap: cracks, emissive: 0xffffff, emissiveIntensity: 1.8, roughness: 0.85, metalness: 0.1 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), rock);
  group.add(ball);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.75, 96), additive(0xff8a4a, 0.35));
  ring.rotation.x = -Math.PI / 2 + 0.35;
  ring.rotation.y = 0.35;
  group.add(ring);
  const eye = new THREE.Group();
  eye.position.z = 0.82;
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 20), new THREE.MeshStandardMaterial({ color: 0xf0e6d8, roughness: 0.3 }));
  white.scale.z = 0.5;
  eye.add(white);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2020, emissiveIntensity: 2.5 }));
  iris.position.z = 0.175;
  eye.add(iris);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  pupil.position.z = 0.18;
  eye.add(pupil);
  group.add(eye);
  return {
    group,
    update(t, v) {
      ball.rotation.y = t * 0.15;
      rock.emissiveIntensity = 1.4 + 0.6 * Math.sin(t * 1.5) + v.charge * 2;
      (iris.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.5 + v.charge * 6;
      iris.scale.setScalar(1 + v.charge * 0.4);
      pupil.position.x = Math.sin(t * 0.7) * 0.05;
    },
  };
}

function dragon(): BossModel {
  const group = new THREE.Group();
  const plate = metal(0x1e1a2a, 0.85, 0.35);
  plate.userData.env = 0.6;
  const accent = glow(0xb98cff, 2.2);
  // thân rồng: chuỗi đốt (instanced) từ cổ qua thân tới đuôi
  const N = 26;
  const spine = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), plate, N);
  group.add(spine);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 6), plate);
  skull.rotation.x = Math.PI / 2;
  skull.position.z = 0.22;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6), plate);
  jaw.rotation.x = Math.PI / 2 + 0.25;
  jaw.position.set(0, -0.12, 0.18);
  head.add(jaw);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 8), metal(0x4a3a6a, 0.9, 0.2));
    horn.position.set(sx * 0.12, 0.16, -0.08);
    horn.rotation.x = -0.9;
    horn.rotation.z = -sx * 0.3;
    head.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), glow(0xd9b0ff, 4));
    eye.position.set(sx * 0.11, 0.06, 0.2);
    head.add(eye);
  }
  const mouthGlow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 12), additive(0xc79bff, 0.9));
  mouthGlow.position.set(0, -0.06, 0.5);
  head.add(mouthGlow);
  group.add(head);
  // cánh thiên hà
  const galaxy = canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(60, 60, 10, 128, 128, 220);
    g.addColorStop(0, "#c9a0ff");
    g.addColorStop(0.4, "#5a2aa8");
    g.addColorStop(1, "#0a0620");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(255,255,255,${Math.random()})`;
      c.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
  });
  const wingMat = new THREE.MeshStandardMaterial({ map: galaxy, emissiveMap: galaxy, emissive: 0xffffff, emissiveIntensity: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.95, roughness: 0.6 });
  const wings: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(sx * 0.55, 0.55);
    s.lineTo(sx * 1.25, 0.7);
    s.quadraticCurveTo(sx * 1.05, 0.25, sx * 1.15, -0.2);
    s.quadraticCurveTo(sx * 0.85, 0.05, sx * 0.78, -0.35);
    s.quadraticCurveTo(sx * 0.5, -0.1, sx * 0.38, -0.42);
    s.quadraticCurveTo(sx * 0.2, -0.15, 0, -0.2);
    s.closePath();
    const wing = new THREE.Group();
    const membrane = new THREE.Mesh(new THREE.ShapeGeometry(s, 16), wingMat);
    wing.add(membrane);
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 1.3, 8), plate);
    bone.position.set(sx * 0.62, 0.62, 0.01);
    bone.rotation.z = -sx * 1.36;
    wing.add(bone);
    const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(s.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0.01))), new THREE.LineBasicMaterial({ color: 0xb98cff }));
    wing.add(edge);
    wing.position.set(sx * 0.12, 0.1, -0.1);
    group.add(wing);
    wings.push(wing);
  }
  const dummy = new THREE.Object3D();
  const path = (s: number, t: number): THREE.Vector3 => {
    // s: 0 = đầu cổ, 1 = chóp đuôi
    const x = Math.sin(s * 5 + t * 1.4) * 0.18 * s + (s > 0.6 ? (s - 0.6) * 1.2 : 0);
    const y = 0.55 - s * 1.25 + Math.sin(t * 1.1 + s * 3) * 0.05;
    const z = Math.cos(s * 4 + t) * 0.12;
    return new THREE.Vector3(x, y, z);
  };
  return {
    group,
    update(t, v) {
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1);
        dummy.position.copy(path(s, t));
        const r = s < 0.12 ? 0.13 : s < 0.45 ? 0.22 - (s - 0.12) * 0.1 : 0.19 * (1 - s) + 0.03;
        dummy.scale.set(r, r * 0.9, r);
        dummy.updateMatrix();
        spine.setMatrixAt(i, dummy.matrix);
      }
      spine.instanceMatrix.needsUpdate = true;
      const neck = path(0, t);
      const inhale = v.charge;
      head.position.set(neck.x, neck.y + 0.2 + inhale * 0.08, neck.z + 0.1 + inhale * 0.1);
      head.rotation.x = -0.25 + Math.sin(t * 1.3) * 0.08 - inhale * 0.3;
      mouthGlow.scale.setScalar(0.3 + inhale * 2.2 + 0.1 * Math.sin(t * 20));
      const flap = Math.sin(t * 2.2) * 0.45;
      wings[0].rotation.y = flap;
      wings[1].rotation.y = -flap;
      wings.forEach((w) => (w.rotation.x = 0.2 + Math.sin(t * 2.2 + 1) * 0.1));
      accent.emissiveIntensity = 2;
    },
  };
}

const BUILDERS: Record<BossId, () => BossModel> = { ufo, ufo2, ufo3, gold, octopus, stealth, spider, devourer, crystal, mother, planet, dragon };

/** góc nhìn riêng: đĩa bay chúc mặt về camera để thấy vòm, sinh vật nhìn thẳng */
export const PITCH: Record<BossId, number> = {
  ufo: 0.32, ufo2: 0.32, ufo3: 0.25, gold: 0.34, mother: 0.3, stealth: 0.55, spider: 0.35,
  octopus: 0.05, devourer: 0, crystal: 0.1, planet: 0, dragon: 0,
};

/** đĩa bay xoay tròn quanh trục đứng (sinh vật thì không) */
export const SPIN: Record<BossId, number> = {
  ufo: 0.6, ufo2: 0.5, ufo3: 0.4, gold: 0.35, mother: 0.15, crystal: 0.25, stealth: 0, spider: 0, octopus: 0, devourer: 0, planet: 0, dragon: 0,
};

/** Dựng model & chuẩn hoá: bề ngang = width px sân khấu */
export function buildBoss(id: BossId, width: number): BossModel {
  const m = BUILDERS[id]();
  m.update(0, { charge: 0 } as View3D);
  const box = new THREE.Box3().setFromObject(m.group);
  const size = box.getSize(new THREE.Vector3());
  const k = width / Math.max(size.x, 1e-3);
  const inner = m.group;
  inner.scale.setScalar(k);
  const center = box.getCenter(new THREE.Vector3());
  inner.position.set(-center.x * k, -center.y * k, -center.z * k);
  const outer = new THREE.Group();
  outer.add(inner);
  // lưu vật liệu gốc để nháy trắng khi trúng đạn & mờ khi tàng hình
  outer.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.Line).isLine) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats as THREE.Material[]) {
      mat.userData.baseOpacity = mat.opacity;
      // trùm phản chiếu môi trường rõ hơn thành phố (kim loại / vàng bóng)
      if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) (mat as THREE.MeshStandardMaterial).envMapIntensity = mat.userData.env ?? 1.6;
      mat.userData.baseTransparent = mat.transparent;
      const std = mat as THREE.MeshStandardMaterial;
      if (std.emissive) mat.userData.baseEmissive = std.emissive.clone();
    }
  });
  return { group: outer, update: m.update };
}
