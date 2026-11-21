/**
 * Browser-native WebGL2 renderer.  One THREE.Points per subshell layer, all samples
 * in a single typed attribute buffer (one draw call per layer) — replacing the
 * per-particle sphere glDrawArrays loop of the upstream desktop viewer.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { POINT_FRAG, POINT_VERT } from "./shaders";
import { BOHR_PM, type QuantumNumbers } from "@/physics/hydrogenic";
import { probabilityCurrentAnalytic } from "@/physics/current";
import type { IsosurfaceMeshBuffers, Slice2DResult } from "@/numerics/isosurface/marchingTetrahedra";

export type ColorMode = "density" | "phase-real" | "phase-complex" | "layer";
export type SliceAxis = "none" | "x" | "y" | "z";

export interface LayerData {
  positionsBohr: Float32Array;
  density: Float32Array;
  phase: Float32Array;
  maxDensity: number;
  color: string;
}

export interface RenderSettings {
  pointSize: number;
  brightness: number;
  cutoff: number;
  colorMode: ColorMode;
  sliceAxis: SliceAxis;
  slicePosPm: number;
  sliceThicknessPm: number;
  showAxes: boolean;
  showNucleus: boolean;
  nucleusRadiusPm: number;
}

export interface CurrentField {
  q: QuantumNumbers;
  zeff: number;
  rMaxBohr: number;
}

export interface SceneStats {
  fps: number;
  drawCalls: number;
  points: number;
  gpuUploadMs: number;
}

const AXIS_IDX: Record<SliceAxis, number> = { none: -1, x: 0, y: 1, z: 2 };
const MODE_IDX: Record<ColorMode, number> = { density: 0, "phase-real": 1, "phase-complex": 2, layer: 3 };

interface Layer {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  opacity: number;
  visible: boolean;
  count: number;
  ownMax: number;
}

export class OrbitalScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private layers = new Map<string, Layer>();
  private isosurfaceGroup = new THREE.Group();
  private sliceHeatmapMesh: THREE.Mesh | null = null;
  private axes = new THREE.Group();
  private nucleus: THREE.Mesh;
  private currentLines: THREE.LineSegments | null = null;
  private slicePlane: THREE.Mesh;
  private raf = 0;
  private frames = 0;
  private lastFpsT = performance.now();
  private settings: RenderSettings;
  private extentPm = 500;
  /** Shared brightness normalisation for full-atom mode; null ⇒ per-layer relative. */
  private sharedMax: number | null = null;
  stats: SceneStats = { fps: 0, drawCalls: 0, points: 0, gpuUploadMs: 0 };
  onStats?: (s: SceneStats) => void;
  shaderError: string | null = null;

  constructor(canvas: HTMLCanvasElement, settings: RenderSettings) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 is not available in this browser/GPU context.");
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.debug.onShaderError = (_gl, _prog, vs, fs) => {
      const log = `${_gl.getShaderInfoLog(vs) ?? ""}\n${_gl.getShaderInfoLog(fs) ?? ""}`.trim();
      this.shaderError = log || "Unknown shader compile/link error";
    };
    this.settings = { ...settings };
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1e6);
    this.camera.position.set(0, -900, 500);
    this.camera.up.set(0, 0, 1); // z is the polar axis
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    this.nucleus = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.scene.add(this.nucleus);
    this.scene.add(this.axes);
    this.slicePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.slicePlane.visible = false;
    this.scene.add(this.slicePlane);
    this.scene.add(this.isosurfaceGroup);
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(1, -1.2, 1.4);
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.35);
    fillLight.position.set(-1, 1, -0.6);
    this.scene.add(ambient, keyLight, fillLight);
    this.rebuildAxes();
    this.applySettings(settings);
    this.loop();
  }

  private rebuildAxes(): void {
    this.axes.clear();
    const L = this.extentPm;
    const mk = (dir: THREE.Vector3, color: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(L)]);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
    };
    this.axes.add(mk(new THREE.Vector3(1, 0, 0), 0xef4444), mk(new THREE.Vector3(0, 1, 0), 0x22c55e), mk(new THREE.Vector3(0, 0, 1), 0x3b82f6));
    // faint ground grid in xy plane
    const grid = new THREE.GridHelper(L * 2, 20, 0x222222, 0x151515);
    grid.rotation.x = Math.PI / 2;
    this.axes.add(grid);
  }

  /** World extent in pm (used for axes/scale/camera framing). */
  setExtent(pm: number): void {
    if (Math.abs(pm - this.extentPm) / this.extentPm < 0.05) return;
    this.extentPm = pm;
    this.rebuildAxes();
    this.slicePlane.scale.set(2 * pm, 2 * pm, 1);
    this.camera.far = pm * 50;
    this.camera.updateProjectionMatrix();
  }

  frame(pm: number): void {
    const d = pm * 2.2;
    this.camera.position.set(0, -d, d * 0.55);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  resetCamera(): void {
    this.frame(this.extentPm);
  }

  applySettings(s: RenderSettings): void {
    this.settings = { ...s };
    for (const L of this.layers.values()) this.updateUniforms(L);
    this.axes.visible = s.showAxes;
    this.nucleus.visible = s.showNucleus;
    this.nucleus.scale.setScalar(Math.max(s.nucleusRadiusPm, 0.01));
    const ax = AXIS_IDX[s.sliceAxis];
    this.slicePlane.visible = ax >= 0;
    if (ax >= 0) {
      this.slicePlane.rotation.set(0, 0, 0);
      this.slicePlane.position.set(0, 0, 0);
      if (ax === 0) {
        this.slicePlane.rotation.y = Math.PI / 2;
        this.slicePlane.position.x = s.slicePosPm;
      } else if (ax === 1) {
        this.slicePlane.rotation.x = Math.PI / 2;
        this.slicePlane.position.y = s.slicePosPm;
      } else this.slicePlane.position.z = s.slicePosPm;
      this.slicePlane.scale.set(2 * this.extentPm, 2 * this.extentPm, 1);
    }
  }

  private updateUniforms(L: Layer): void {
    const u = L.material.uniforms;
    const s = this.settings;
    u.uPointSize.value = s.pointSize;
    u.uBrightness.value = s.brightness;
    u.uCutoff.value = s.cutoff;
    u.uColorMode.value = MODE_IDX[s.colorMode];
    u.uSliceAxis.value = AXIS_IDX[s.sliceAxis];
    u.uSlicePos.value = s.slicePosPm;
    u.uSliceHalf.value = s.sliceThicknessPm / 2;
    u.uOpacity.value = L.opacity;
    u.uMaxDensity.value = Math.max(this.sharedMax ?? L.ownMax, 1e-30);
    u.uPixelRatio.value = this.renderer.getPixelRatio();
    L.points.visible = L.visible && L.count > 0;
  }

  setLayer(key: string, data: LayerData, opacity: number, visible: boolean): void {
    const t0 = performance.now();
    let L = this.layers.get(key);
    const n = data.density.length;
    const posPm = new Float32Array(data.positionsBohr.length);
    for (let i = 0; i < posPm.length; i++) posPm[i] = data.positionsBohr[i] * BOHR_PM;
    if (!L) {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.ShaderMaterial({
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uPointSize: { value: 1 },
          uMaxDensity: { value: 1 },
          uCutoff: { value: 0 },
          uSliceAxis: { value: -1 },
          uSlicePos: { value: 0 },
          uSliceHalf: { value: 0 },
          uPixelRatio: { value: 1 },
          uColorMode: { value: 0 },
          uLayerColor: { value: new THREE.Color(data.color) },
          uOpacity: { value: 1 },
          uBrightness: { value: 1 },
        },
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      this.scene.add(points);
      L = { points, geometry, material, opacity, visible, count: 0, ownMax: 1 };
      this.layers.set(key, L);
    }
    L.geometry.setAttribute("position", new THREE.BufferAttribute(posPm, 3));
    L.geometry.setAttribute("aDensity", new THREE.BufferAttribute(data.density, 1));
    L.geometry.setAttribute("aPhase", new THREE.BufferAttribute(data.phase, 1));
    L.geometry.setDrawRange(0, n);
    L.count = n;
    L.ownMax = data.maxDensity;
    L.opacity = opacity;
    L.visible = visible;
    (L.material.uniforms.uLayerColor.value as THREE.Color).set(data.color);
    this.updateUniforms(L);
    this.stats.gpuUploadMs = performance.now() - t0;
  }

  /**
   * Full-atom mode: one normalisation constant across all subshell layers so peaks from
   * different subshells are comparable.  Passing null restores per-layer relative
   * brightness (single-orbital mode, explicitly labelled as within-orbital).
   */
  setSharedMax(v: number | null): void {
    this.sharedMax = v;
    for (const L of this.layers.values()) this.updateUniforms(L);
  }

  setLayerState(key: string, opacity: number, visible: boolean): void {
    const L = this.layers.get(key);
    if (!L) return;
    L.opacity = opacity;
    L.visible = visible;
    this.updateUniforms(L);
  }

  removeLayersExcept(keep: Set<string>): void {
    for (const [k, L] of this.layers) {
      if (keep.has(k)) continue;
      this.scene.remove(L.points);
      L.geometry.dispose();
      L.material.dispose();
      this.layers.delete(k);
    }
  }

  /** Probability-current field (complex basis, m≠0 only). 600 line segments on a ring sample. */
  setCurrentField(field: CurrentField | null): void {
    if (this.currentLines) {
      this.scene.remove(this.currentLines);
      this.currentLines.geometry.dispose();
      (this.currentLines.material as THREE.Material).dispose();
      this.currentLines = null;
    }
    if (!field || field.q.m === 0) return;
    const pts: number[] = [];
    const cols: number[] = [];
    const rings = 6,
      per = 24,
      thetas = 4;
    let maxJ = 0;
    const vecs: { p: THREE.Vector3; j: THREE.Vector3 }[] = [];
    for (let ti = 1; ti <= thetas; ti++) {
      const theta = (Math.PI * ti) / (thetas + 1);
      for (let ri = 1; ri <= rings; ri++) {
        const r = (field.rMaxBohr * ri) / (rings + 1);
        for (let k = 0; k < per; k++) {
          const phi = (2 * Math.PI * k) / per;
          const x = r * Math.sin(theta) * Math.cos(phi),
            y = r * Math.sin(theta) * Math.sin(phi),
            z = r * Math.cos(theta);
          const [jx, jy, jz] = probabilityCurrentAnalytic(field.q, x, y, z, field.zeff);
          const mag = Math.hypot(jx, jy, jz);
          if (mag > maxJ) maxJ = mag;
          vecs.push({ p: new THREE.Vector3(x, y, z).multiplyScalar(BOHR_PM), j: new THREE.Vector3(jx, jy, jz) });
        }
      }
    }
    if (maxJ <= 0) return;
    const segLen = field.rMaxBohr * BOHR_PM * 0.045;
    for (const v of vecs) {
      const mag = v.j.length() / maxJ;
      if (mag < 0.02) continue;
      const dir = v.j.clone().normalize().multiplyScalar(segLen * (0.3 + 0.7 * mag));
      pts.push(v.p.x, v.p.y, v.p.z, v.p.x + dir.x, v.p.y + dir.y, v.p.z + dir.z);
      cols.push(0.2, 1, 0.8, 0.2, 1, 0.8, 0.0, 0.3, 0.2, 0.0, 0.3, 0.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.85 });
    this.currentLines = new THREE.LineSegments(g, m);
    this.scene.add(this.currentLines);
  }

  /** Render extracted Marching Tetrahedra isosurfaces without touching point-cloud layers. */
  setIsosurfaceMeshes(
    meshes: readonly IsosurfaceMeshBuffers[],
    opts: { readonly opacity?: number; readonly wireframe?: boolean } = {},
  ): void {
    this.clearIsosurfaces();
    const opacity = Math.max(0.05, Math.min(1, opts.opacity ?? 0.55));
    const wireframe = opts.wireframe ?? false;

    for (const m of meshes) {
      if (m.triangleCount === 0) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(m.positionsPm, 3));
      geom.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      const color =
        m.polarity === "positive" ? 0xf59e0b : m.polarity === "negative" ? 0x38bdf8 : 0x22d3ee;
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.08,
        transparent: opacity < 0.99,
        opacity,
        wireframe,
        side: THREE.DoubleSide,
        depthWrite: opacity >= 0.99,
      });
      const mesh = new THREE.Mesh(geom, mat);
      this.isosurfaceGroup.add(mesh);
    }
  }

  clearIsosurfaces(): void {
    while (this.isosurfaceGroup.children.length > 0) {
      const child = this.isosurfaceGroup.children.pop()!;
      this.isosurfaceGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  /** Project a 2D slice heatmap quad onto XY / XZ / YZ plane inside the 3D scene. */
  setSliceHeatmap(slice: Slice2DResult | null): void {
    if (this.sliceHeatmapMesh) {
      this.scene.remove(this.sliceHeatmapMesh);
      this.sliceHeatmapMesh.geometry.dispose();
      const mat = this.sliceHeatmapMesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.sliceHeatmapMesh = null;
    }
    if (!slice || slice.maxAbs <= 0) return;
    const N = slice.resolution;
    const rgba = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const v = slice.values[i];
      if (slice.isSigned) {
        const norm = Math.min(1, Math.abs(v) / slice.maxAbs);
        const gamma = Math.pow(norm, 0.55);
        if (v >= 0) {
          rgba[4 * i] = Math.round(245 * gamma);
          rgba[4 * i + 1] = Math.round(158 * gamma);
          rgba[4 * i + 2] = Math.round(24 * gamma);
        } else {
          rgba[4 * i] = Math.round(40 * gamma);
          rgba[4 * i + 1] = Math.round(165 * gamma);
          rgba[4 * i + 2] = Math.round(248 * gamma);
        }
        rgba[4 * i + 3] = Math.round(30 + 215 * gamma);
      } else {
        const norm = Math.min(1, Math.log1p(250 * (Math.max(0, v) / slice.maxAbs)) / Math.log1p(250));
        rgba[4 * i] = Math.round(Math.min(255, norm * 280));
        rgba[4 * i + 1] = Math.round(Math.min(255, norm * norm * 255));
        rgba[4 * i + 2] = Math.round(Math.min(255, (0.3 + 0.7 * norm) * 230));
        rgba[4 * i + 3] = Math.round(20 + 225 * norm);
      }
    }
    const tex = new THREE.DataTexture(rgba, N, N, THREE.RGBAFormat);
    tex.needsUpdate = true;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;

    const sizePm = slice.extentPm * 2;
    const geom = new THREE.PlaneGeometry(sizePm, sizePm);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const offPm = slice.offsetBohr * BOHR_PM;
    if (slice.plane === "xy") {
      mesh.position.set(0, 0, offPm);
    } else if (slice.plane === "xz") {
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(0, offPm, 0);
    } else {
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(offPm, 0, 0);
    }
    this.sliceHeatmapMesh = mesh;
    this.scene.add(mesh);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsT >= 500) {
      this.stats.fps = (this.frames * 1000) / (now - this.lastFpsT);
      this.stats.drawCalls = this.renderer.info.render.calls;
      this.stats.points = this.renderer.info.render.points;
      this.frames = 0;
      this.lastFpsT = now;
      this.onStats?.({ ...this.stats });
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.removeLayersExcept(new Set());
    this.clearIsosurfaces();
    this.setSliceHeatmap(null);
    this.setCurrentField(null);
    this.controls.dispose();
    this.nucleus.geometry.dispose();
    (this.nucleus.material as THREE.Material).dispose();
    this.slicePlane.geometry.dispose();
    (this.slicePlane.material as THREE.Material).dispose();
    this.axes.traverse((o) => {
      if (o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
  }
}
