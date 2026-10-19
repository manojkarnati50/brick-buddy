/**
 * Chunky brick meshes for the kid viewer. Every brick is its own Mesh so a tap can be
 * raycast back to its LDraw line (mesh.userData.line) for Colour Studio painting.
 * Coordinates are LDraw LDU; the root group is rotated 180° about X (same as three's
 * LDrawLoader) so LDraw's -Y "up" becomes three's +Y.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Brick } from "./types";

const cache = new Map<string, THREE.BufferGeometry>();

function studs(x: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < x; i++)
    for (let j = 0; j < z; j++) {
      const s = new THREE.CylinderGeometry(6, 6, 4.2, 20);
      s.translate(-x * 10 + 10 + i * 20, -2.0, -z * 10 + 10 + j * 20);
      out.push(s);
    }
  return out;
}

function box(x: number, z: number, h: number): THREE.BufferGeometry {
  // tiny bevel feel: slightly inset body so neighbouring bricks show a seam
  const g = new THREE.BoxGeometry(x * 20 - 0.6, h - 0.3, z * 20 - 0.6);
  g.translate(0, h / 2, 0);
  return g;
}

function wedge(x: number, z: number, h: number): THREE.BufferGeometry {
  // Slope: high flat strip at local +Z (back), slopes down to a 4 LDU lip at -Z (front).
  const X = x * 10 - 0.3,
    Z = z * 10 - 0.3,
    flat = Math.min(20, z * 10),
    lip = h - 4;
  const shape = new THREE.Shape();
  // profile in (z, y) with y down: back-bottom -> back-top -> flat end -> front lip -> front-bottom
  shape.moveTo(Z, h);
  shape.lineTo(Z, 0);
  shape.lineTo(Z - flat, 0);
  shape.lineTo(-Z, lip);
  shape.lineTo(-Z, h);
  shape.lineTo(Z, h);
  const g = new THREE.ExtrudeGeometry(shape, { depth: X * 2, bevelEnabled: false });
  // extrude goes along +Z of the shape space; map shape(x=z, y=y, z=x)
  g.rotateY(-Math.PI / 2);
  g.translate(X, 0, 0);
  return g;
}

export function geometryFor(b: Brick): THREE.BufferGeometry {
  const key = `${b.part}:${b.kind}:${b.dims?.join("x") ?? "?"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry;
  if (b.dims) {
    const [x, z, h] = b.dims;
    if (b.kind === "slope") {
      const parts = [wedge(x, z, h)];
      g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
    } else if (b.kind === "round") {
      const c = new THREE.CylinderGeometry(x * 10 - 0.5, x * 10 - 0.5, h - 0.3, 28);
      c.translate(0, h / 2, 0);
      g = mergeGeometries([c, ...studs(x, z)].map((p) => p.toNonIndexed()), false)!;
    } else {
      const parts = [box(x, z, h)];
      if (b.kind !== "tile") parts.push(...studs(x, z));
      g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
    }
  } else {
    g = new THREE.BoxGeometry(1, 1, 1); // unknown part: sized per-instance from its bbox
  }
  g.computeVertexNormals();
  cache.set(key, g);
  return g;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function material(hex: string): THREE.MeshStandardMaterial {
  let m = matCache.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.35, metalness: 0.0 });
    matCache.set(hex, m);
  }
  return m;
}

/** Build one mesh per brick. `offset` (LDU) lets the town place several models on one plate. */
export function brickMesh(b: Brick, hex: string, offset: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometryFor(b), material(hex));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (b.dims) {
    const m = b.matrix;
    const mat4 = new THREE.Matrix4().set(
      m[0], m[1], m[2], b.pos[0] + offset[0],
      m[3], m[4], m[5], b.pos[1] + offset[1],
      m[6], m[7], m[8], b.pos[2] + offset[2],
      0, 0, 0, 1,
    );
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(mat4);
  } else {
    const [x0, y0, z0, x1, y1, z1] = b.bbox;
    mesh.position.set((x0 + x1) / 2 + offset[0], (y0 + y1) / 2 + offset[1], (z0 + z1) / 2 + offset[2]);
    mesh.scale.set(Math.max(1, x1 - x0), Math.max(1, y1 - y0), Math.max(1, z1 - z0));
  }
  mesh.userData = { uid: b.uid, line: b.line, section: b.section, step: b.step, part: b.part };
  return mesh;
}
