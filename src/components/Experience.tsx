import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, Environment, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { PotteryWheel } from './PotteryWheel';
import type { PotteryWheelHandle } from './PotteryWheel';
import { useHandTracking } from '../context/HandTrackingProvider';
import * as THREE from 'three';

/* ─── Left Hand → Rotate Model (camera stays fixed) ─── */
const ModelControl = ({ modelGroupRef }: { modelGroupRef: React.RefObject<THREE.Group | null> }) => {
  const { leftHand, isPaused } = useHandTracking();
  const currentRotY = useRef(0);  // horizontal rotation
  const currentTiltX = useRef(0); // forward/back tilt
  const prevX = useRef<number | null>(null);
  const prevY = useRef<number | null>(null);

  useFrame(() => {
    const lh = leftHand.current;

    if (!isPaused.current && lh && lh.detected && lh.mode === 'PINCH') {
      if (prevX.current !== null && prevY.current !== null) {
        // Delta-based: rotate relative to hand movement, not absolute position
        const dx = lh.x - prevX.current;
        const dy = lh.y - prevY.current;

        // Horizontal orbit: left/right hand movement spins the model
        currentRotY.current += dx * 5.0;

        // Vertical tilt: up/down hand movement tilts the model
        const unclampedTilt = currentTiltX.current + dy * 3.0;
        currentTiltX.current = THREE.MathUtils.clamp(unclampedTilt, -0.8, 0.3);

        // Only advance prevY when not clamped — prevents overshoot accumulation at boundaries
        if (unclampedTilt > -0.8 && unclampedTilt < 0.3) {
          prevY.current = lh.y;
        }
      }
      prevX.current = lh.x;
      if (prevY.current === null) prevY.current = lh.y;
    } else {
      // Reset previous position when not pinching so next pinch starts fresh
      prevX.current = null;
      prevY.current = null;
    }

    if (modelGroupRef.current) {
      modelGroupRef.current.rotation.y = currentRotY.current;
      modelGroupRef.current.rotation.x = currentTiltX.current;
    }
  });

  return null;
};

/* ─── Moving Clouds (billboard — always face camera) ─── */
const Clouds = () => {
  const cloudTex1 = useTexture('/ffdf.png');
  const c1Ref = useRef<THREE.Group>(null);
  const c4Ref = useRef<THREE.Group>(null);
  const c5Ref = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (c1Ref.current) {
      c1Ref.current.position.x += delta * 0.8;
      if (c1Ref.current.position.x > 50) c1Ref.current.position.x = -50;
    }
    if (c4Ref.current) {
      c4Ref.current.position.x -= delta * 0.8;
      if (c4Ref.current.position.x < -45) c4Ref.current.position.x = 45;
    }
    if (c5Ref.current) {
      c5Ref.current.position.x += delta * 0.8;
      if (c5Ref.current.position.x > 50) c5Ref.current.position.x = -50;
    }
  });

  return (
    <group>
      {/* Upper-left cloud, behind clay */}
      <group ref={c1Ref} position={[-20, -4, -22]}>
        <Billboard>
          <mesh>
            <planeGeometry args={[18, 8]} />
            <meshBasicMaterial map={cloudTex1} transparent opacity={0.7} depthWrite={false} color="#ffb4a2" />
          </mesh>
        </Billboard>
      </group>

      {/* High distant cloud */}
      <group ref={c4Ref} position={[8, 18, -25]}>
        <Billboard>
          <mesh>
            <planeGeometry args={[25, 11]} />
            <meshBasicMaterial map={cloudTex1} transparent opacity={0.55} depthWrite={false} color="#ffcdb2" />
          </mesh>
        </Billboard>
      </group>
      {/* Low background cloud */}
      <group ref={c5Ref} position={[20, -4, -22]}>
        <Billboard>
          <mesh>
            <planeGeometry args={[30, 12]} />
            <meshBasicMaterial map={cloudTex1} transparent opacity={0.45} depthWrite={false} color="#ffc8a0" />
          </mesh>
        </Billboard>
      </group>
    </group>
  );
};

/* ─── Wheel Base (spinning wheel head + static splash pan) ─── */
const WheelBase = () => {
  const baseRef = useRef<THREE.Group>(null);

  // Wheel-head texture — concentric grooves + radial score marks so the
  // spin is actually visible (a flat gray disc looks static while rotating)
  const headTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256;

    ctx.fillStyle = '#6b7677';
    ctx.fillRect(0, 0, 512, 512);

    // Concentric grooves (bat rings on a real wheel head)
    for (let r = 24; r < 256; r += 22) {
      ctx.strokeStyle = `rgba(20, 26, 28, ${0.25 + Math.random() * 0.15})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cx, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220, 230, 232, 0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cx, r + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Radial score marks + clay smears — the main rotation cue
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r1 = 30 + Math.random() * 80;
      const r2 = r1 + 60 + Math.random() * 130;
      const smear = Math.random() > 0.6;
      ctx.strokeStyle = smear
        ? `rgba(150, 100, 80, ${0.08 + Math.random() * 0.12})`
        : `rgba(25, 32, 34, ${0.10 + Math.random() * 0.15})`;
      ctx.lineWidth = smear ? 4 + Math.random() * 6 : 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cx + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cx + Math.sin(angle) * r2);
      ctx.stroke();
    }

    // Center hub
    ctx.fillStyle = '#4d5859';
    ctx.beginPath();
    ctx.arc(cx, cx, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 230, 232, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);

  useFrame((_state, delta) => {
    if (baseRef.current) {
      baseRef.current.rotation.y += delta * 2.6;
    }
  });

  return (
    <group>
      {/* Spinning wheel head — same angular speed as the clay */}
      <group ref={baseRef} position={[0, -5.15, 0]}>
        <mesh receiveShadow>
          <cylinderGeometry args={[4, 4.2, 0.6, 64]} />
          <meshStandardMaterial color="#7f8c8d" roughness={0.6} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.31, 0]} rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[4, 64]} />
          <meshStandardMaterial map={headTexture} roughness={0.55} metalness={0.3} />
        </mesh>
      </group>

      {/* Static splash pan around the wheel head */}
      <mesh position={[0, -5.45, 0]} receiveShadow>
        <cylinderGeometry args={[5.4, 5.6, 0.5, 64]} />
        <meshStandardMaterial color="#5a4438" roughness={0.85} metalness={0.05} />
      </mesh>
    </group>
  );
};

/* ─── Main Experience ─── */
interface ExperienceProps {
  potteryRef: React.RefObject<PotteryWheelHandle | null>;
}

export const Experience = ({ potteryRef }: ExperienceProps) => {
  const modelGroupRef = useRef<THREE.Group>(null);

  return (
    <Canvas shadows camera={{ position: [0, 12, 18], fov: 55 }} gl={{ alpha: true }}>

      <ambientLight intensity={0.4} color="#fff1e6" />
      <directionalLight
        position={[8, 12, 8]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        color="#ffeedd"
      />
      <pointLight position={[-8, 6, -4]} color="#ffaa44" intensity={0.8} />
      <pointLight position={[0, -4, -12]} color="#8899cc" intensity={0.3} />

      <group ref={modelGroupRef} position={[0, -2, 0]} scale={1.15}>
        <PotteryWheel ref={potteryRef} />
        <WheelBase />
      </group>

      <Suspense fallback={null}>
        <Clouds />
      </Suspense>

      {/* Left hand rotates the model, camera stays fixed */}
      <ModelControl modelGroupRef={modelGroupRef} />

      <EffectComposer>
        <Bloom luminanceThreshold={0.4} mipmapBlur intensity={1.2} radius={0.7} />
        <Vignette eskil={false} offset={0.15} darkness={0.8} />
      </EffectComposer>

      <Environment preset="sunset" />
    </Canvas>
  );
};
