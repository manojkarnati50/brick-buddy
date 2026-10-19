import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LDrawLoader } from "three/examples/jsm/loaders/LDrawLoader.js";
import { brickMesh } from "@/lib/bricks3d";
import { colourInfo } from "@/lib/store";
import type { Brick } from "@/lib/types";

export interface Placed {
  bricks: Brick[];
  offset?: [number, number, number];
}

interface Props {
  models: Placed[];
  /** line -> colour override (Colour Studio). */
  colours?: Map<number, number>;
  onTap?: (brick: Brick, point: THREE.Vector3) => void;
  highlight?: Set<number>; // uids that glow
  maxStep?: number; // build guide: hide later steps
  currentStep?: number; // build guide: pulse this step
  autoRotate?: boolean;
  baseplate?: number; // studs; draws a green plate under everything
  realParts?: string | null; // MPD text -> render with three's LDrawLoader (needs /ldraw library)
  className?: string;
  onReady?: (canvas: HTMLCanvasElement) => void;
}

const LDU = 0.05; // 1 LDU -> 0.05 three units (a 2x4 brick is 4 x 1.2 x 2)

export default function BrickViewer(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    root: THREE.Group;
    meshes: Map<string, THREE.Mesh>;
    bricks: Map<string, Brick>;
    ground: THREE.Mesh;
    particles: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[];
    framed: boolean;
    raf: number;
  } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // ---- one-time scene setup ----
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
    camera.position.set(9, 8, 12);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xddf2e6, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.ShadowMaterial({ opacity: 0.12 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const root = new THREE.Group();
    root.rotation.x = Math.PI; // LDraw -Y up -> three +Y up
    root.scale.setScalar(LDU);
    scene.add(root);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotateSpeed = 1.2;

    const s = { renderer, scene, camera, controls, root, ground, meshes: new Map(), bricks: new Map(), particles: [] as { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[], framed: false, raf: 0 };
    state.current = s;

    const resize = () => {
      const w = el.clientWidth || 300,
        h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // tap vs drag
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const fast = performance.now() - down.t < 450;
      down = null;
      if (moved > 10 || !fast || !propsRef.current.onTap) return;
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects([...s.meshes.values()].filter((m) => m.visible), false);
      if (hits.length) {
        const b = s.bricks.get(hits[0].object.userData.key as string);
        if (b) {
          propsRef.current.onTap(b, hits[0].point);
          splash(hits[0].point, (hits[0].object as THREE.Mesh).material as THREE.MeshStandardMaterial);
          pop(hits[0].object as THREE.Mesh);
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function splash(at: THREE.Vector3, mat: THREE.MeshStandardMaterial) {
      if (reduced) return;
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat);
        m.position.copy(at);
        scene.add(m);
        s.particles.push({ mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4), life: 0.6 });
      }
    }
    function pop(mesh: THREE.Mesh) {
      if (reduced) return;
      if (mesh.matrixAutoUpdate) return; // unknown parts are scaled boxes; skip the pop
      const t0 = performance.now();
      const base = mesh.matrix.clone();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 260);
        const sc = 1 + Math.sin(k * Math.PI) * 0.12;
        mesh.matrix.copy(base).multiply(new THREE.Matrix4().makeScale(sc, sc, sc));
        if (k < 1) requestAnimationFrame(step);
        else mesh.matrix.copy(base);
      };
      step();
    }

    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      s.particles = s.particles.filter((p) => {
        p.life -= dt;
        p.v.y -= 9 * dt;
        p.mesh.position.addScaledVector(p.v, dt);
        if (p.life <= 0) {
          scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          return false;
        }
        return true;
      });
      // glow pulse
      const glow = 0.25 + 0.2 * Math.sin(now / 180);
      for (const m of s.meshes.values()) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (m.userData.glow) mat.emissiveIntensity = glow;
      }
      controls.update();
      renderer.render(scene, camera);
      s.raf = requestAnimationFrame(loop);
    };
    loop();
    propsRef.current.onReady?.(renderer.domElement);

    return () => {
      cancelAnimationFrame(s.raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      state.current = null;
    };
  }, []);

  // ---- (re)build meshes when the model changes ----
  const modelKey = props.models.map((m) => `${m.bricks.length}:${m.bricks[0]?.uid}:${m.bricks[0]?.line}:${m.offset?.join(",")}`).join("|") + `|${props.realParts ? "real" : "box"}|${props.baseplate}`;
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.root.clear();
    s.meshes.clear();
    s.bricks.clear();
    s.ground.position.y = props.baseplate ? -0.42 : 0;
    const box = new THREE.Box3();
    if (props.baseplate) {
      const n = props.baseplate;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(n * 20, 8, n * 20), new THREE.MeshStandardMaterial({ color: "#58AB41", roughness: 0.6 }));
      plate.position.set(n * 10 - 40, 4, n * 10 - 40);
      plate.receiveShadow = true;
      s.root.add(plate);
    }
    if (props.realParts) {
      // three r170's LDrawLoader: parse(text, onLoad, onError) + setPartsLibraryPath (typings lag behind)
      const loader = new LDrawLoader() as unknown as {
        setPartsLibraryPath(p: string): void;
        smoothNormals: boolean;
        preloadMaterials(url: string): Promise<void>;
        parse(text: string, onLoad: (g: THREE.Group) => void, onError?: (e: unknown) => void): void;
      };
      loader.setPartsLibraryPath("/ldraw/");
      loader.smoothNormals = true;
      void loader
        .preloadMaterials("/ldraw/LDConfig.ldr")
        .then(() =>
          loader.parse(props.realParts!, (group) => {
            s.root.add(group);
            group.traverse((o) => {
              if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
            });
            frame(new THREE.Box3().setFromObject(group));
          }),
        )
        .catch(() => undefined);
      return;
    }
    props.models.forEach((m, mi) => {
      for (const b of m.bricks) {
        const hex = colourInfo(propsRef.current.colours?.get(b.line) ?? b.colour).hex;
        const mesh = brickMesh(b, hex, m.offset);
        const key = `${mi}:${b.uid}`;
        mesh.userData.key = key;
        s.root.add(mesh);
        s.meshes.set(key, mesh);
        s.bricks.set(key, b);
      }
    });
    s.root.updateMatrixWorld(true);
    if (props.baseplate) box.expandByObject(s.root); // town: frame the whole baseplate
    else for (const mesh of s.meshes.values()) box.expandByObject(mesh);
    frame(box);

    function frame(bx: THREE.Box3) {
      if (bx.isEmpty() || !s) return;
      const c = bx.getCenter(new THREE.Vector3());
      const size = bx.getSize(new THREE.Vector3()).length();
      const radius = size / 2;
      // fit the bounding sphere in both the vertical and horizontal field of view
      const vfov = THREE.MathUtils.degToRad(s.camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * s.camera.aspect);
      const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.08;
      s.controls.target.copy(c);
      const dir = new THREE.Vector3(0.75, 0.62, 1).normalize();
      s.camera.position.copy(c).addScaledVector(dir, Math.max(4, dist));
      s.camera.near = 0.1;
      s.camera.far = size * 20 + 100;
      s.camera.updateProjectionMatrix();
      s.controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  // ---- colours / highlight / steps (cheap updates, no rebuild) ----
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    for (const mesh of s.meshes.values()) {
      const b = s.bricks.get(mesh.userData.key);
      if (!b) continue;
      const hex = colourInfo(props.colours?.get(b.line) ?? b.colour).hex;
      const glow = props.highlight?.has(b.uid) || (props.currentStep !== undefined && b.step === props.currentStep);
      if (glow) {
        const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.35, emissive: new THREE.Color("#fff3a0"), emissiveIntensity: 0.3 });
        mesh.material = mat;
        mesh.userData.glow = true;
      } else {
        mesh.userData.glow = false;
        const cur = mesh.material as THREE.MeshStandardMaterial;
        if (cur.emissiveIntensity > 0 || `#${cur.color.getHexString()}`.toLowerCase() !== hex.toLowerCase()) {
          mesh.material = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.35 });
        }
      }
      mesh.visible = props.maxStep === undefined || b.step <= props.maxStep;
    }
  }, [props.colours, props.highlight, props.maxStep, props.currentStep, modelKey]);

  useEffect(() => {
    if (state.current) state.current.controls.autoRotate = Boolean(props.autoRotate);
  }, [props.autoRotate]);

  return <div ref={host} className={props.className ?? "h-full w-full"} />;
}
