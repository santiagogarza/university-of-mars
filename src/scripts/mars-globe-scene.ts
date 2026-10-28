import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  ACESFilmicToneMapping,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface GlobeSite {
  id: string;
  label: string;
  lat: number;
  lon: number;
  main: boolean;
}

export interface GlobeOptions {
  host: HTMLElement;
  sites: GlobeSite[];
  colorUrl: string;
  bumpUrl: string;
  reducedMotion: boolean;
  onPick: (id: string) => void;
  onReady: () => void;
  onError: (error: unknown) => void;
}

export interface GlobeHandle {
  focus: (id: string) => void;
  release: () => void;
  zoomBy: (factor: number) => void;
  resetView: () => void;
  setCardInset: (px: number) => void;
  setReducedMotion: (reduced: boolean) => void;
}

const HOME_DISTANCE = 4.1;
const FOCUS_DISTANCE = 2.7;
const MIN_DISTANCE = 1.45;
const MAX_DISTANCE = 6.5;
const ATMOSPHERE_RADIUS = 1.16;
const SPIN_PER_SECOND = 0.045;
const IDLE_BEFORE_SPIN_MS = 7000;
const MAIN_COLOR = new Color('#ffd27a');
const STATION_COLOR = new Color('#9fe6ff');
const DUST = new Color('#f0a27a');

function surface(lat: number, lon: number, radius = 1): Vector3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return new Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).multiplyScalar(radius);
}

function radialTexture(stops: Array<[number, string]>, size = 128): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function starfield(count: number, size: number, opacity: number, seed: number, dot: CanvasTexture): Points {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const positions: number[] = [];
  const colors: number[] = [];
  const tints = [new Color('#ffffff'), new Color('#ffe9d6'), new Color('#d6e4ff'), new Color('#fff4e0')];
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const theta = rnd() * Math.PI * 2;
    const r = 90 + rnd() * 40;
    const k = Math.sqrt(1 - u * u);
    positions.push(r * k * Math.cos(theta), r * u, r * k * Math.sin(theta));
    const tint = tints[Math.floor(rnd() * tints.length)];
    const b = 0.35 + rnd() * 0.65;
    colors.push(tint.r * b, tint.g * b, tint.b * b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const material = new PointsMaterial({
    size,
    map: dot,
    vertexColors: true,
    sizeAttenuation: false,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  return new Points(geometry, material);
}

interface Pin {
  site: GlobeSite;
  head: Vector3;
  glow: Sprite;
  ring: Mesh<RingGeometry, MeshBasicMaterial>;
  headMesh: Mesh;
  label: HTMLButtonElement;
  phase: number;
}

export function createGlobe(options: GlobeOptions): GlobeHandle {
  const { host, sites } = options;
  let reducedMotion = options.reducedMotion;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'globe-gl';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const labelLayer = document.createElement('div');
  labelLayer.className = 'globe-labels';
  host.append(labelLayer);

  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 400);
  scene.add(camera);

  const sun = new DirectionalLight(0xfff1e2, 3.1);
  sun.position.set(-2.4, 1.5, 1.9);
  camera.add(sun);
  scene.add(new AmbientLight(0xffd6c2, 0.09));

  const dot = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.4, 'rgba(255,255,255,0.8)'],
    [1, 'rgba(255,255,255,0)'],
  ], 32);
  scene.add(starfield(2400, 1.6, 0.8, 7, dot));
  scene.add(starfield(140, 3.2, 0.95, 11, dot));

  const globe = new Group();
  scene.add(globe);

  const loader = new TextureLoader();
  const planetMaterial = new MeshStandardMaterial({ roughness: 0.96, metalness: 0, color: 0xffffff });
  const planet = new Mesh(new SphereGeometry(1, 128, 96), planetMaterial);
  globe.add(planet);

  const lightWorld = new Vector3();
  const atmosphereUniforms = {
    uLight: { value: lightWorld },
    uColor: { value: DUST.clone() },
    uRadius: { value: ATMOSPHERE_RADIUS },
  };
  const halo = new Mesh(
    new SphereGeometry(ATMOSPHERE_RADIUS, 96, 64),
    new ShaderMaterial({
      uniforms: atmosphereUniforms,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight;
        uniform vec3 uColor;
        uniform float uRadius;
        varying vec3 vWorld;
        void main() {
          vec3 dir = normalize(vWorld - cameraPosition);
          float along = -dot(cameraPosition, dir);
          vec3 closest = cameraPosition + dir * along;
          float d = length(closest);
          float t = clamp((d - 1.0) / (uRadius - 1.0), 0.0, 1.0);
          float glow = pow(1.0 - t, 3.2);
          float lit = smoothstep(-0.45, 0.65, dot(normalize(closest), uLight));
          gl_FragColor = vec4(uColor * (0.12 + 0.95 * lit), glow);
        }`,
    }),
  );
  scene.add(halo);

  const limb = new Mesh(
    new SphereGeometry(1.004, 96, 64),
    new ShaderMaterial({
      uniforms: atmosphereUniforms,
      side: FrontSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vNormal = normalize(world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight;
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vWorld;
        void main() {
          vec3 view = normalize(cameraPosition - vWorld);
          float rim = pow(1.0 - max(dot(vNormal, view), 0.0), 3.0);
          float lit = smoothstep(-0.2, 0.7, dot(vNormal, uLight));
          gl_FragColor = vec4(uColor, rim * lit * 0.75);
        }`,
    }),
  );
  scene.add(limb);

  const glowTexture = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.18, 'rgba(255,255,255,0.85)'],
    [0.45, 'rgba(255,255,255,0.22)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  const up = new Vector3(0, 1, 0);
  const pins: Pin[] = sites.map((site, index) => {
    const color = site.main ? MAIN_COLOR : STATION_COLOR;
    const normal = surface(site.lat, site.lon);
    const pin = new Group();
    pin.quaternion.setFromUnitVectors(up, normal);
    globe.add(pin);

    const stemHeight = site.main ? 0.085 : 0.07;
    const stem = new Mesh(
      new CylinderGeometry(0.0035, 0.0035, stemHeight, 8),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false }),
    );
    stem.position.y = 1 + stemHeight / 2;
    pin.add(stem);

    const headMesh = new Mesh(new SphereGeometry(site.main ? 0.016 : 0.013, 16, 12), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    headMesh.position.y = 1 + stemHeight;
    pin.add(headMesh);

    const glow = new Sprite(
      new SpriteMaterial({ map: glowTexture, color, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
    );
    glow.position.y = 1 + stemHeight;
    glow.scale.setScalar(site.main ? 0.16 : 0.12);
    pin.add(glow);

    const ring = new Mesh(
      new RingGeometry(0.022, 0.028, 48),
      new MeshBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false, side: FrontSide, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1.003;
    pin.add(ring);

    const label = document.createElement('button');
    label.type = 'button';
    label.className = `globe-label${site.main ? ' is-main' : ''}`;
    label.textContent = site.label;
    label.tabIndex = -1;
    label.setAttribute('aria-hidden', 'true');
    label.addEventListener('click', (event) => {
      event.stopPropagation();
      options.onPick(site.id);
    });
    labelLayer.append(label);

    return { site, head: new Vector3(0, 1 + stemHeight, 0), glow, ring, headMesh, label, phase: index * 0.27 };
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;

  const jezero = sites.find((site) => site.main) ?? sites[0];
  camera.position.copy(surface(jezero.lat * 0.6, jezero.lon + 30).multiplyScalar(HOME_DISTANCE));
  controls.update();

  let width = 1;
  let height = 1;
  let inset = 0;
  let insetNow = 0;
  let selected: string | null = null;
  let hovered: string | null = null;
  let lastInteraction = performance.now() - IDLE_BEFORE_SPIN_MS;
  let flight: { from: Vector3; to: Vector3; fromDist: number; toDist: number; start: number; duration: number; arc: number } | null = null;
  let zoomTarget: number | null = null;
  let visible = true;
  let frame = 0;
  let last = performance.now();
  let ready = false;

  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    applyInset();
  }

  function applyInset() {
    if (insetNow < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(width, height, insetNow / 2, 0, width, height);
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const camDir = new Vector3();

  function headWorld(pin: Pin, out: Vector3): Vector3 {
    return out.copy(pin.head).applyMatrix4(pin.glow.parent!.matrixWorld);
  }

  function screenOf(pin: Pin): { x: number; y: number; facing: number } {
    headWorld(pin, tmp);
    camDir.copy(camera.position).normalize();
    const facing = tmp2.copy(tmp).normalize().dot(camDir);
    tmp.project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * width, y: (-tmp.y * 0.5 + 0.5) * height, facing };
  }

  function pickAt(x: number, y: number): Pin | null {
    let best: Pin | null = null;
    let bestDist = 26;
    for (const pin of pins) {
      const s = screenOf(pin);
      if (s.facing < 0.12) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestDist) {
        best = pin;
        bestDist = d;
      }
    }
    return best;
  }

  const down = new Vector2();
  let pointerDown = false;
  renderer.domElement.addEventListener('pointerdown', (event) => {
    pointerDown = true;
    down.set(event.clientX, event.clientY);
    markInteraction();
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!pointerDown) return;
    pointerDown = false;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const pin = pickAt(event.clientX - rect.left, event.clientY - rect.top);
    if (pin) options.onPick(pin.site.id);
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (pointerDown) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const pin = pickAt(event.clientX - rect.left, event.clientY - rect.top);
    hovered = pin?.site.id ?? null;
    renderer.domElement.style.cursor = pin ? 'pointer' : 'grab';
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    hovered = null;
  });
  renderer.domElement.addEventListener('wheel', markInteraction, { passive: true });
  controls.addEventListener('start', () => {
    flight = null;
    zoomTarget = null;
    markInteraction();
  });

  function markInteraction() {
    lastInteraction = performance.now();
  }

  function flyTo(direction: Vector3, distance: number) {
    markInteraction();
    zoomTarget = null;
    const from = camera.position.clone().normalize();
    const to = direction.clone().normalize();
    if (reducedMotion) {
      camera.position.copy(to.multiplyScalar(distance));
      controls.update();
      flight = null;
      return;
    }
    const angle = from.angleTo(to);
    flight = {
      from,
      to,
      fromDist: camera.position.length(),
      toDist: distance,
      start: performance.now(),
      duration: Math.min(1900, 850 + angle * 420),
      arc: Math.min(0.9, angle * 0.32),
    };
  }

  const qStart = new Quaternion();
  const qFull = new Quaternion();
  const qNow = new Quaternion();
  function stepFlight(now: number) {
    if (!flight) return;
    const k = Math.min(1, (now - flight.start) / flight.duration);
    const e = easeInOutCubic(k);
    qFull.setFromUnitVectors(flight.from, flight.to);
    qNow.slerpQuaternions(qStart, qFull, e);
    const dist = flight.fromDist + (flight.toDist - flight.fromDist) * e + Math.sin(Math.PI * e) * flight.arc;
    camera.position.copy(flight.from).applyQuaternion(qNow).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
    if (k >= 1) flight = null;
  }

  function stepZoom() {
    if (zoomTarget == null || flight) return;
    const len = camera.position.length();
    const next = len + (zoomTarget - len) * 0.16;
    camera.position.setLength(next);
    if (Math.abs(next - zoomTarget) < 0.002) zoomTarget = null;
  }

  function updateLabels() {
    for (const pin of pins) {
      const s = screenOf(pin);
      const active = pin.site.id === selected;
      const show = s.facing > 0.05;
      const opacity = show ? Math.min(1, (s.facing - 0.05) * 4) : 0;
      pin.label.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      pin.label.style.opacity = opacity.toFixed(2);
      pin.label.style.pointerEvents = opacity > 0.4 ? 'auto' : 'none';
      pin.label.classList.toggle('is-active', active);
    }
  }

  function animatePins(now: number) {
    for (const pin of pins) {
      const active = pin.site.id === selected;
      const hot = active || pin.site.id === hovered;
      const base = pin.site.main ? 0.16 : 0.12;
      const breathe = reducedMotion ? 0 : Math.sin(now / 520 + pin.phase * 6) * 0.012;
      pin.glow.scale.setScalar((hot ? base * 1.3 : base) + breathe);
      pin.headMesh.scale.setScalar(hot ? 1.2 : 1);
      if (reducedMotion) {
        pin.ring.scale.setScalar(active ? 2.2 : 1.6);
        pin.ring.material.opacity = active ? 0.7 : 0.35;
      } else {
        const t = (now / 2200 + pin.phase) % 1;
        pin.ring.scale.setScalar(1 + t * (active ? 3 : 2.4));
        pin.ring.material.opacity = (1 - t) * (active ? 0.95 : 0.55);
      }
    }
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const idle = now - lastInteraction > IDLE_BEFORE_SPIN_MS;
    if (!reducedMotion && !selected && !flight && !pointerDown && idle) globe.rotation.y += SPIN_PER_SECOND * dt;

    if (Math.abs(insetNow - inset) > 0.5) {
      insetNow += (inset - insetNow) * (reducedMotion ? 1 : 0.12);
      applyInset();
    } else if (insetNow !== inset) {
      insetNow = inset;
      applyInset();
    }

    if (flight) stepFlight(now);
    else {
      stepZoom();
      controls.update();
    }

    globe.updateMatrixWorld();
    lightWorld.copy(sun.getWorldPosition(tmp)).normalize();
    animatePins(now);
    updateLabels();
    renderer.render(scene, camera);
  }

  function start() {
    if (frame || !ready || !visible || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  const visibility = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) start();
    else stop();
  });
  visibility.observe(host);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  Promise.all([loader.loadAsync(options.colorUrl), loader.loadAsync(options.bumpUrl)])
    .then(([color, bump]) => {
      color.colorSpace = SRGBColorSpace;
      color.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      planetMaterial.map = color;
      planetMaterial.bumpMap = bump;
      planetMaterial.bumpScale = 2.2;
      planetMaterial.needsUpdate = true;
      ready = true;
      start();
      options.onReady();
    })
    .catch(options.onError);

  return {
    focus(id) {
      const pin = pins.find((p) => p.site.id === id);
      if (!pin) return;
      selected = id;
      globe.updateMatrixWorld();
      flyTo(headWorld(pin, new Vector3()), FOCUS_DISTANCE);
    },
    release() {
      selected = null;
      markInteraction();
      zoomTarget = HOME_DISTANCE;
      if (reducedMotion) {
        camera.position.setLength(HOME_DISTANCE);
        zoomTarget = null;
      }
    },
    zoomBy(factor) {
      markInteraction();
      flight = null;
      const base = zoomTarget ?? camera.position.length();
      zoomTarget = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, base * factor));
      if (reducedMotion) {
        camera.position.setLength(zoomTarget);
        zoomTarget = null;
      }
    },
    resetView() {
      selected = null;
      lastInteraction = performance.now() - IDLE_BEFORE_SPIN_MS + 1500;
      globe.updateMatrixWorld();
      const home = surface(jezero.lat * 0.6, jezero.lon + 30).applyMatrix4(globe.matrixWorld);
      flyTo(home, HOME_DISTANCE);
    },
    setCardInset(px) {
      inset = Math.max(0, px);
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced;
    },
  };
}
