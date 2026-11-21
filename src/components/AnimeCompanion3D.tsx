import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CompanionEmotion } from '../types';

interface AnimeCompanion3DProps {
  emotion: CompanionEmotion;
  isSpeaking: boolean;
  isListening: boolean;
  audioLevelRef: React.MutableRefObject<number>;
}

const _targetColor = new THREE.Color();
const _emissiveColor = new THREE.Color();

function createAnimeEyeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  // Outer iris gradient (anime violet-rose)
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 136, 118);
  grad.addColorStop(0, '#1E1B4B');
  grad.addColorStop(0.32, '#4338CA');
  grad.addColorStop(0.65, '#818CF8');
  grad.addColorStop(0.86, '#FB7185');
  grad.addColorStop(1, '#1E1B4B');

  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Pupil
  ctx.beginPath();
  ctx.arc(128, 132, 40, 0, Math.PI * 2);
  ctx.fillStyle = '#0F0D23';
  ctx.fill();

  // Lower crescent anime glow
  const glowGrad = ctx.createRadialGradient(128, 180, 6, 128, 180, 62);
  glowGrad.addColorStop(0, 'rgba(251, 113, 133, 0.92)');
  glowGrad.addColorStop(1, 'rgba(251, 113, 133, 0)');
  ctx.beginPath();
  ctx.arc(128, 168, 68, 0, Math.PI * 2);
  ctx.fillStyle = glowGrad;
  ctx.fill();

  // Primary anime specular highlight
  ctx.beginPath();
  ctx.ellipse(90, 84, 30, 24, -0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Secondary micro highlight
  ctx.beginPath();
  ctx.arc(166, 168, 13, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBlushTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 32, 4, 64, 32, 58);
  grad.addColorStop(0, 'rgba(251, 113, 133, 0.88)');
  grad.addColorStop(0.5, 'rgba(251, 113, 133, 0.35)');
  grad.addColorStop(1, 'rgba(251, 113, 133, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPedestalGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 122);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.72)');
  grad.addColorStop(0.6, 'rgba(15, 23, 42, 0.35)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const EMOTION_COLORS: Record<CompanionEmotion, { accent: number; blush: number }> = {
  happy: { accent: 0xfb7185, blush: 0.72 },
  caring: { accent: 0xf472b6, blush: 0.55 },
  playful: { accent: 0xf59e0b, blush: 0.65 },
  jealous: { accent: 0xef4444, blush: 0.92 },
  focused: { accent: 0x6366f1, blush: 0.28 },
  thinking: { accent: 0x38bdf8, blush: 0.32 },
  surprised: { accent: 0xf43f5e, blush: 0.82 },
};

export const AnimeCompanion3D: React.FC<AnimeCompanion3DProps> = ({
  emotion,
  isSpeaking,
  isListening,
  audioLevelRef,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState(false);

  const emotionRef = useRef(emotion);
  const isSpeakingRef = useRef(isSpeaking);
  const isListeningRef = useRef(isListening);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: true,
      });
    } catch {
      setWebglError(true);
      return;
    }

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 540;
    renderer.setSize(width, height);
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(true);
    };
    const onContextRestored = () => setWebglError(false);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d12);
    scene.fog = new THREE.FogExp2(0x0b0d12, 0.08);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 40);
    camera.position.set(0, 1.42, 3.25);
    camera.lookAt(0, 1.28, 0);

    // 3-Point Warm/Cool Studio Rig with clear facial key lighting
    const hemiLight = new THREE.HemisphereLight(0xf1f5f9, 0x1e1b2e, 1.05);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5eb, 2.1);
    keyLight.position.set(1.8, 3.2, 3.8);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const frontFill = new THREE.DirectionalLight(0xffe4e6, 0.9);
    frontFill.position.set(-1.4, 1.6, 3.5);
    scene.add(frontFill);

    const rimLight = new THREE.DirectionalLight(0xfb7185, 1.45);
    rimLight.position.set(-2.4, 2.2, -2.2);
    scene.add(rimLight);

    // Textures
    const eyeTex = createAnimeEyeTexture();
    eyeTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const blushTex = createBlushTexture();
    const shadowTex = createPedestalGlowTexture();

    // Materials (luminous warm anime porcelain skin + rich hair)
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xfff0e6,
      emissive: 0xffd5c2,
      emissiveIntensity: 0.22,
      roughness: 0.62,
      metalness: 0.01,
    });
    const hairMainMat = new THREE.MeshStandardMaterial({
      color: 0x2b1e42,
      roughness: 0.36,
      metalness: 0.14,
    });
    const hairHighlightMat = new THREE.MeshStandardMaterial({
      color: 0x5b3d8f,
      roughness: 0.3,
      metalness: 0.2,
    });
    const outfitDarkMat = new THREE.MeshStandardMaterial({
      color: 0x171c2b,
      roughness: 0.58,
      metalness: 0.12,
    });
    const outfitCollarMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.42,
      metalness: 0.05,
    });
    const accentGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfb7185,
      emissive: 0xfb7185,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.45,
    });
    const metallicGoldMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      roughness: 0.18,
      metalness: 0.88,
    });

    // Character Root Group
    const characterRoot = new THREE.Group();
    scene.add(characterRoot);

    // Stage Pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 1.04, 0.08, 48),
      new THREE.MeshStandardMaterial({
        color: 0x161b26,
        roughness: 0.32,
        metalness: 0.65,
      })
    );
    pedestal.position.y = 0.04;
    pedestal.receiveShadow = true;
    characterRoot.add(pedestal);

    const pedestalRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.93, 0.014, 16, 64),
      accentGlowMat
    );
    pedestalRing.rotation.x = Math.PI / 2;
    pedestalRing.position.y = 0.085;
    characterRoot.add(pedestalRing);

    const contactPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.65,
      })
    );
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = 0.09;
    characterRoot.add(contactPlane);

    // Torso & Shoulders Group
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 0.12;
    characterRoot.add(torsoGroup);

    const torsoProfile = [
      new THREE.Vector2(0.01, 0.0),
      new THREE.Vector2(0.36, 0.02),
      new THREE.Vector2(0.31, 0.44),
      new THREE.Vector2(0.24, 0.68),
      new THREE.Vector2(0.34, 0.86),
      new THREE.Vector2(0.14, 0.96),
      new THREE.Vector2(0.01, 0.98),
    ];
    const torsoMesh = new THREE.Mesh(
      new THREE.LatheGeometry(torsoProfile, 32),
      outfitDarkMat
    );
    torsoMesh.scale.set(1.12, 1, 0.68);
    torsoMesh.castShadow = true;
    torsoGroup.add(torsoMesh);

    const collarMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.045, 16, 32),
      outfitCollarMat
    );
    collarMesh.rotation.x = Math.PI / 2 + 0.18;
    collarMesh.position.set(0, 0.92, 0.02);
    torsoGroup.add(collarMesh);

    const ribbonLeft = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.16, 12),
      accentGlowMat
    );
    ribbonLeft.rotation.z = -1.15;
    ribbonLeft.position.set(-0.08, 0.82, 0.19);
    torsoGroup.add(ribbonLeft);

    const ribbonRight = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.16, 12),
      accentGlowMat
    );
    ribbonRight.rotation.z = 1.15;
    ribbonRight.position.set(0.08, 0.82, 0.19);
    torsoGroup.add(ribbonRight);

    const gemMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.045, 0),
      metallicGoldMat
    );
    gemMesh.position.set(0, 0.82, 0.22);
    torsoGroup.add(gemMesh);

    // Neck
    const neckMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.105, 0.24, 24),
      skinMat
    );
    neckMesh.position.set(0, 1.03, 0);
    torsoGroup.add(neckMesh);

    // Choker
    const choker = new THREE.Mesh(
      new THREE.TorusGeometry(0.098, 0.015, 12, 32),
      outfitDarkMat
    );
    choker.rotation.x = Math.PI / 2;
    choker.position.set(0, 1.01, 0);
    torsoGroup.add(choker);

    // Head Group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.12, 0.01);
    torsoGroup.add(headGroup);

    // Sculpted Anime Head (front face surface reaches Z ≈ +0.305)
    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 36, 36),
      skinMat
    );
    headMesh.scale.set(0.95, 1.02, 0.87);
    headMesh.position.set(0, 0.34, 0);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Delicate chin contour
    const chinMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 24, 24),
      skinMat
    );
    chinMesh.scale.set(0.86, 0.7, 0.82);
    chinMesh.position.set(0, 0.15, 0.045);
    headGroup.add(chinMesh);

    // Subtle anime nose tip
    const noseMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.018, 0.045, 10),
      skinMat
    );
    noseMesh.rotation.x = Math.PI / 2.1;
    noseMesh.position.set(0, 0.25, 0.312);
    headGroup.add(noseMesh);

    // Expressive Anime Eyes positioned cleanly on front face (Z = 0.295..0.315)
    const eyeScleraMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeIrisMat = new THREE.MeshBasicMaterial({
      map: eyeTex,
      transparent: true,
    });
    const lashMat = new THREE.MeshStandardMaterial({
      color: 0x161124,
      roughness: 0.35,
    });

    const makeEye = (side: -1 | 1) => {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.128, 0.315, 0.292);
      eyeGroup.rotation.y = side * 0.22;

      const sclera = new THREE.Mesh(
        new THREE.CircleGeometry(0.08, 32),
        eyeScleraMat
      );
      sclera.scale.set(0.98, 1.18, 1);
      eyeGroup.add(sclera);

      const iris = new THREE.Mesh(
        new THREE.CircleGeometry(0.064, 32),
        eyeIrisMat
      );
      iris.position.z = 0.006;
      iris.scale.set(0.92, 1.12, 1);
      eyeGroup.add(iris);

      // Upper Lash Curve
      const lash = new THREE.Mesh(
        new THREE.TorusGeometry(0.078, 0.012, 10, 24, Math.PI * 0.88),
        lashMat
      );
      lash.rotation.z = Math.PI * 0.06;
      lash.position.set(0, 0.014, 0.012);
      eyeGroup.add(lash);

      // Blinking Eyelid
      const eyelid = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.2),
        skinMat
      );
      eyelid.position.set(0, 0.09, 0.015);
      eyelid.scale.y = 0.01;
      eyeGroup.add(eyelid);

      // Expressive Brow
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.115, 0.015, 0.012),
        hairMainMat
      );
      brow.position.set(0, 0.125, 0.016);
      brow.rotation.z = side * -0.08;
      eyeGroup.add(brow);

      headGroup.add(eyeGroup);
      return { eyeGroup, iris, eyelid, brow };
    };

    const leftEye = makeEye(-1);
    const rightEye = makeEye(1);

    // Blush Cheeks (clearly visible outside cheek surface)
    const blushMat = new THREE.MeshBasicMaterial({
      map: blushTex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const leftBlush = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.055), blushMat);
    leftBlush.position.set(-0.185, 0.22, 0.285);
    leftBlush.rotation.y = -0.45;
    headGroup.add(leftBlush);

    const rightBlush = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.055), blushMat);
    rightBlush.position.set(0.185, 0.22, 0.285);
    rightBlush.rotation.y = 0.45;
    headGroup.add(rightBlush);

    // Reactive Lip-Sync Mouth
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 });
    const mouthMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.018, 0.036, 8, 12),
      mouthMat
    );
    mouthMesh.rotation.z = Math.PI / 2;
    mouthMesh.position.set(0, 0.155, 0.298);
    headGroup.add(mouthMesh);

    // Back Hair Hemisphere ONLY (shifted behind face so face is 100% open & bright!)
    const hairBack = new THREE.Mesh(
      new THREE.SphereGeometry(0.39, 32, 32, Math.PI * 0.92, Math.PI * 1.16),
      hairMainMat
    );
    hairBack.position.set(0, 0.37, -0.04);
    hairBack.scale.set(1.02, 1.06, 0.96);
    headGroup.add(hairBack);

    // Top Hair Crown Cap (above forehead)
    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.375, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.46),
      hairMainMat
    );
    hairCrown.position.set(0, 0.395, -0.015);
    hairCrown.scale.set(1.0, 1.02, 0.92);
    headGroup.add(hairCrown);

    // Front Bang Locks (framing forehead above eyes)
    const bangsGroup = new THREE.Group();
    headGroup.add(bangsGroup);
    const bangOffsets = [-0.21, -0.13, -0.05, 0.03, 0.11, 0.19];
    bangOffsets.forEach((xOff, idx) => {
      const len = 0.19 + (idx % 2 === 0 ? 0.04 : -0.02);
      const bang = new THREE.Mesh(
        new THREE.ConeGeometry(0.064, len, 12),
        idx % 2 === 0 ? hairMainMat : hairHighlightMat
      );
      bang.rotation.z = Math.PI + xOff * 0.55;
      bang.rotation.x = -0.25;
      bang.position.set(xOff, 0.55, 0.255 - Math.abs(xOff) * 0.25);
      bangsGroup.add(bang);
    });

    // Side framing locks
    const makeSideLock = (side: -1 | 1) => {
      const lock = new THREE.Mesh(
        new THREE.ConeGeometry(0.082, 0.5, 12),
        hairHighlightMat
      );
      lock.rotation.z = Math.PI + side * 0.16;
      lock.position.set(side * 0.33, 0.26, 0.09);
      headGroup.add(lock);
    };
    makeSideLock(-1);
    makeSideLock(1);

    // Flowing Twin-Tails
    const makeTwinTail = (side: -1 | 1) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.37, 0.48, -0.09);

      const pin = new THREE.Mesh(
        new THREE.TorusGeometry(0.052, 0.015, 12, 24),
        accentGlowMat
      );
      pin.rotation.y = Math.PI / 2;
      pivot.add(pin);

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.16, -0.18, -0.04),
        new THREE.Vector3(side * 0.22, -0.52, -0.08),
        new THREE.Vector3(side * 0.14, -0.82, -0.02),
      ]);
      const tailMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.075, 12, false),
        hairMainMat
      );
      tailMesh.castShadow = true;
      pivot.add(tailMesh);

      const tailTip = new THREE.Mesh(
        new THREE.ConeGeometry(0.072, 0.22, 12),
        hairHighlightMat
      );
      tailTip.rotation.z = Math.PI + side * 0.25;
      tailTip.position.set(side * 0.13, -0.89, -0.01);
      pivot.add(tailTip);

      headGroup.add(pivot);
      return pivot;
    };
    const leftTail = makeTwinTail(-1);
    const rightTail = makeTwinTail(1);

    // Futuristic Anime Headset Halo & Ear Cups
    const headband = new THREE.Mesh(
      new THREE.TorusGeometry(0.405, 0.02, 12, 48, Math.PI * 1.05),
      outfitDarkMat
    );
    headband.position.set(0, 0.41, -0.01);
    headband.rotation.z = -Math.PI * 0.025;
    headGroup.add(headband);

    [-1, 1].forEach((side) => {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.085, 0.045, 24),
        outfitDarkMat
      );
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * 0.39, 0.34, -0.01);
      headGroup.add(cup);

      const cupRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.068, 0.012, 10, 24),
        accentGlowMat
      );
      cupRing.rotation.y = Math.PI / 2;
      cupRing.position.set(side * 0.415, 0.34, -0.01);
      headGroup.add(cupRing);
    });

    // Pointer tracking
    let targetLookX = 0;
    let targetLookY = 0;
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ny = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
      targetLookX = THREE.MathUtils.clamp(nx, -1, 1) * 0.24;
      targetLookY = THREE.MathUtils.clamp(ny, -1, 1) * 0.14;
    };
    window.addEventListener('pointermove', onPointerMove);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 540;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let nextBlinkTime = 2.2;
    let blinkAmount = 0;
    let smoothedMouth = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      const currEmotion = emotionRef.current;
      const speaking = isSpeakingRef.current;
      const listening = isListeningRef.current;
      const audioLevel = audioLevelRef.current;
      const emoCfg = EMOTION_COLORS[currEmotion] || EMOTION_COLORS.happy;

      _targetColor.setHex(emoCfg.accent);
      accentGlowMat.color.lerp(_targetColor, 1 - Math.exp(-5 * delta));
      _emissiveColor.copy(accentGlowMat.color);
      accentGlowMat.emissive.lerp(_emissiveColor, 1 - Math.exp(-5 * delta));
      accentGlowMat.emissiveIntensity = speaking
        ? 0.9 + Math.min(1.1, audioLevel * 3.5)
        : listening
          ? 0.95 + Math.sin(elapsed * 5) * 0.25
          : 0.72;

      blushMat.opacity = THREE.MathUtils.damp(
        blushMat.opacity,
        emoCfg.blush,
        5,
        delta
      );

      torsoGroup.position.y = 0.12 + Math.sin(elapsed * 1.8) * 0.012;
      torsoGroup.rotation.y = THREE.MathUtils.damp(
        torsoGroup.rotation.y,
        targetLookX * 0.35 + Math.sin(elapsed * 0.7) * 0.03,
        4,
        delta
      );

      let emoTiltZ = 0;
      let emoPitchX = 0;
      if (currEmotion === 'playful' || currEmotion === 'caring') emoTiltZ = 0.09;
      if (currEmotion === 'jealous') {
        emoTiltZ = -0.11;
        emoPitchX = 0.08;
      }
      if (currEmotion === 'thinking') {
        emoTiltZ = -0.07;
        emoPitchX = -0.08;
      }
      if (listening) {
        emoTiltZ += 0.05;
      }

      headGroup.rotation.y = THREE.MathUtils.damp(
        headGroup.rotation.y,
        targetLookX,
        6,
        delta
      );
      headGroup.rotation.x = THREE.MathUtils.damp(
        headGroup.rotation.x,
        targetLookY + emoPitchX + (speaking ? Math.sin(elapsed * 7) * 0.03 : 0),
        6,
        delta
      );
      headGroup.rotation.z = THREE.MathUtils.damp(
        headGroup.rotation.z,
        emoTiltZ,
        5,
        delta
      );

      const tailSway = Math.sin(elapsed * 2.1) * 0.06 + (speaking ? 0.04 : 0);
      leftTail.rotation.z = THREE.MathUtils.damp(
        leftTail.rotation.z,
        -0.06 + tailSway - headGroup.rotation.z * 0.4,
        4,
        delta
      );
      rightTail.rotation.z = THREE.MathUtils.damp(
        rightTail.rotation.z,
        0.06 - tailSway - headGroup.rotation.z * 0.4,
        4,
        delta
      );

      if (elapsed > nextBlinkTime) {
        blinkAmount = 1;
        nextBlinkTime = elapsed + 2.6 + Math.random() * 2.5;
      }
      blinkAmount = THREE.MathUtils.damp(blinkAmount, 0, 14, delta);
      const lidScale = THREE.MathUtils.clamp(blinkAmount, 0.01, 1);
      leftEye.eyelid.scale.y = lidScale;
      rightEye.eyelid.scale.y = lidScale;

      const targetBrowTilt =
        currEmotion === 'jealous'
          ? 0.22
          : currEmotion === 'caring'
            ? -0.16
            : -0.06;
      leftEye.brow.rotation.z = THREE.MathUtils.damp(
        leftEye.brow.rotation.z,
        -targetBrowTilt,
        6,
        delta
      );
      rightEye.brow.rotation.z = THREE.MathUtils.damp(
        rightEye.brow.rotation.z,
        targetBrowTilt,
        6,
        delta
      );

      const targetMouth = speaking
        ? 0.28 + Math.min(1.4, audioLevel * 5.2 + Math.abs(Math.sin(elapsed * 16)) * 0.35)
        : currEmotion === 'surprised'
          ? 0.85
          : 0.16;
      smoothedMouth = THREE.MathUtils.damp(smoothedMouth, targetMouth, 18, delta);
      mouthMesh.scale.set(
        speaking ? 1.15 : currEmotion === 'jealous' ? 0.72 : 1.0,
        smoothedMouth * 1.4,
        1
      );

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
      eyeTex.dispose();
      blushTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, [audioLevelRef]);

  if (webglError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#10141F] text-center p-6 rounded-2xl border border-white/10">
        <div className="w-24 h-24 rounded-full bg-rose-500/20 border border-rose-400/40 flex items-center justify-center mb-4">
          <span className="font-display text-3xl font-bold text-rose-300">A</span>
        </div>
        <p className="font-display text-lg font-semibold text-white">Aanya 3D Stage</p>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">
          WebGL rendering is temporarily paused on this device; voice and chat intelligence remain active.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative select-none"
      aria-label="Aanya 3D anime companion viewport"
    />
  );
};
