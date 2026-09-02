/**
 * Ambient types for the Three.js build the landing page pulls from a CDN.
 *
 * The real `three` package is deliberately not a dependency — see the note in
 * `pages/landing/useLandingScenes.ts`. Only the constructors and members that
 * file actually touches are declared, so a typo in the scene code is still a
 * compile error rather than an `any` that silently passes.
 */
/*
 * No import or export appears in this file, which is what keeps it a global
 * script declaration rather than a module — `THREENamespace` has to be visible
 * from `useLandingScenes.ts` without being imported, and adding `export {}`
 * here would scope it to this file and break every annotation that uses it.
 */
interface Window {
  THREE?: typeof THREENamespace;
}

declare namespace THREENamespace {
  class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
  }
  class Matrix4 {
    private readonly __matrix4: unique symbol;
  }
  class Euler {
    x: number;
    y: number;
    z: number;
  }
  class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    setScalar(value: number): this;
    copy(v: Vector3): this;
    clone(): Vector3;
    multiplyScalar(scalar: number): this;
    distanceTo(v: Vector3): number;
    applyMatrix4(m: Matrix4): this;
    project(camera: PerspectiveCamera): this;
  }
  class Color {
    constructor(value?: number | string);
    r: number;
    g: number;
    b: number;
    setRGB(r: number, g: number, b: number): this;
    copy(c: Color): this;
  }

  class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    matrixWorld: Matrix4;
    visible: boolean;
    add(...objects: Object3D[]): this;
    lookAt(x: number, y: number, z: number): void;
  }
  class Group extends Object3D {}
  class Scene extends Object3D {
    fog: Fog | FogExp2 | null;
  }
  class FogExp2 {
    constructor(color: number, density: number);
  }
  class Fog {
    constructor(color: number, near: number, far: number);
  }
  class PerspectiveCamera extends Object3D {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    updateProjectionMatrix(): void;
  }
  class WebGLRenderer {
    constructor(params: {
      canvas: HTMLCanvasElement;
      antialias?: boolean;
      alpha?: boolean;
      powerPreference?: string;
    });
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }

  class BufferAttribute {
    constructor(array: Float32Array, itemSize: number);
    array: Float32Array;
    needsUpdate: boolean;
  }
  class Float32BufferAttribute extends BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number);
  }
  class BufferGeometry {
    attributes: { position: BufferAttribute };
    setAttribute(name: string, attribute: BufferAttribute): void;
    dispose(): void;
  }
  class SphereGeometry extends BufferGeometry {
    constructor(radius: number, widthSegments?: number, heightSegments?: number);
  }
  class TorusGeometry extends BufferGeometry {
    constructor(radius: number, tube: number, radialSegments?: number, tubularSegments?: number);
  }
  class CylinderGeometry extends BufferGeometry {
    constructor(
      radiusTop: number,
      radiusBottom: number,
      height: number,
      radialSegments?: number,
      heightSegments?: number,
      openEnded?: boolean,
      thetaStart?: number,
      thetaLength?: number,
    );
  }
  class LatheGeometry extends BufferGeometry {
    constructor(points: Vector2[], segments?: number);
  }
  class CircleGeometry extends BufferGeometry {
    constructor(radius: number, segments?: number);
  }
  class IcosahedronGeometry extends BufferGeometry {
    constructor(radius: number, detail?: number);
  }

  class Texture {
    private readonly __texture: unique symbol;
  }
  class CanvasTexture extends Texture {
    constructor(canvas: HTMLCanvasElement);
  }

  class Material {
    opacity: number;
    transparent: boolean;
    dispose(): void;
  }
  class MeshBasicMaterial extends Material {
    constructor(params?: Record<string, unknown>);
    color: Color;
    wireframe: boolean;
  }
  class MeshStandardMaterial extends Material {
    constructor(params?: Record<string, unknown>);
    color: Color;
  }
  class LineBasicMaterial extends Material {
    constructor(params?: Record<string, unknown>);
    color: Color;
  }
  class PointsMaterial extends Material {
    constructor(params?: Record<string, unknown>);
    color: Color;
  }
  class SpriteMaterial extends Material {
    constructor(params?: Record<string, unknown>);
    map: Texture | null;
  }

  class Mesh<M extends Material = Material> extends Object3D {
    constructor(geometry: BufferGeometry, material: M);
    material: M;
    clone(): Mesh<M>;
  }
  class Points extends Object3D {
    constructor(geometry: BufferGeometry, material: PointsMaterial);
    material: PointsMaterial;
  }
  class LineSegments extends Object3D {
    constructor(geometry: BufferGeometry, material: LineBasicMaterial);
    material: LineBasicMaterial;
  }
  class Sprite extends Object3D {
    constructor(material: SpriteMaterial);
    material: SpriteMaterial;
  }
  class GridHelper extends Object3D {
    constructor(size: number, divisions: number, color1?: number, color2?: number);
    material: LineBasicMaterial;
    clone(): GridHelper;
  }

  class Light extends Object3D {
    intensity: number;
  }
  class AmbientLight extends Light {
    constructor(color?: number, intensity?: number);
  }
  class DirectionalLight extends Light {
    constructor(color?: number, intensity?: number);
  }
  class PointLight extends Light {
    constructor(color?: number, intensity?: number, distance?: number);
  }

  class Clock {
    getDelta(): number;
    elapsedTime: number;
  }

  const AdditiveBlending: number;
  const NormalBlending: number;
}
