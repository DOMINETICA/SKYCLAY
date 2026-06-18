import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { useHandTracking } from '../context/HandTrackingProvider';

export interface PotteryWheelHandle {
  reset: () => void;
  exportSTL: () => void;
  stretch: () => void;
  compress: () => void;
}

export const PotteryWheel = forwardRef<PotteryWheelHandle>((_props, ref) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const cursorRef = useRef<THREE.Mesh>(null);
  const { rightHand, isPaused, textureMode } = useHandTracking();

  const initialRadius = 2.5;
  const height = 10;
  const radialSegments = 64;
  const heightSegments = 64;

  const radiusProfile = useMemo(() => {
    return new Float32Array(heightSegments + 1).fill(initialRadius);
  }, [heightSegments, initialRadius]);

  // Procedural terracotta texture — rich organic details
  const clayTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base Terracotta orange
    ctx.fillStyle = '#b85c4a';
    ctx.fillRect(0, 0, 512, 512);

    // Warm gradients (simulating natural clay variation)
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, 'rgba(235, 185, 150, 0.08)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');
    grad.addColorStop(1, 'rgba(90, 38, 24, 0.12)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Vertical grain / streaks
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 512;
      const w = 2 + Math.random() * 15;
      const light = Math.random() > 0.5;
      ctx.fillStyle = light
        ? `rgba(232, 178, 140, 0.05)`
        : `rgba(90, 38, 24, 0.06)`;
      ctx.fillRect(x, 0, w, 512);
    }

    // Wet clay irregular blotches
    for (let i = 0; i < 180; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 6 + Math.random() * 26;
      const rGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const light = Math.random() > 0.45;
      rGrad.addColorStop(0, light ? 'rgba(226, 162, 122, 0.06)' : 'rgba(98, 44, 30, 0.06)');
      rGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rGrad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Dark iron speckles (stoneware grain)
    for (let i = 0; i < 350; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 0.4 + Math.random() * 1.2;
      ctx.fillStyle = Math.random() > 0.3 ? 'rgba(54, 43, 33, 0.22)' : 'rgba(102, 85, 68, 0.12)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine concentric throwing lines (ridges left while spinning)
    for (let y = 8; y < 512; y += 10 + Math.random() * 16) {
      ctx.fillStyle = 'rgba(70, 28, 18, 0.03)';
      ctx.fillRect(0, y, 512, 1 + Math.random() * 1.5);
      ctx.fillStyle = 'rgba(235, 185, 150, 0.02)';
      ctx.fillRect(0, y + 1.5, 512, 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);

  const smoothY = useRef(0.5);
  const smoothX = useRef(0.5);
  const dirty = useRef(true);
  const heightTarget = useRef(1.0);
  const heightCurrent = useRef(1.0);
  const prevFistY = useRef<number | null>(null);
  const fistLostFrames = useRef<number>(0);
  const prevTextureMode = useRef('none');

  useImperativeHandle(ref, () => ({
    reset: () => { radiusProfile.fill(initialRadius); dirty.current = true; heightTarget.current = 1.0; },
    stretch: () => { heightTarget.current = Math.min(2.5, heightTarget.current + 0.1); },
    compress: () => { heightTarget.current = Math.max(0.3, heightTarget.current - 0.1); },
    exportSTL: () => {
      if (!meshRef.current) return;

      const geo = meshRef.current.geometry.clone();
      const group = new THREE.Group();
      const bodyMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      bodyMesh.rotation.copy(meshRef.current.rotation);
      group.add(bodyMesh);

      // Top cap
      const topVerts: number[] = [];
      const topR = radiusProfile[0];
      const scaledHalfH = (height / 2) * heightCurrent.current;
      for (let i = 0; i <= radialSegments; i++) {
        const angle = (i / radialSegments) * Math.PI * 2;
        topVerts.push(Math.cos(angle) * topR, scaledHalfH, Math.sin(angle) * topR);
      }
      topVerts.push(0, scaledHalfH, 0);
      const topGeo = new THREE.BufferGeometry();
      const topIndices: number[] = [];
      const center = radialSegments + 1;
      for (let i = 0; i < radialSegments; i++) {
        topIndices.push(center, i, (i + 1) % (radialSegments + 1));
      }
      topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topVerts, 3));
      topGeo.setIndex(topIndices);
      topGeo.computeVertexNormals();
      const topMesh = new THREE.Mesh(topGeo, new THREE.MeshBasicMaterial());
      topMesh.rotation.copy(meshRef.current.rotation);
      group.add(topMesh);

      // Bottom cap
      const botVerts: number[] = [];
      const botR = radiusProfile[heightSegments];
      for (let i = 0; i <= radialSegments; i++) {
        const angle = (i / radialSegments) * Math.PI * 2;
        botVerts.push(Math.cos(angle) * botR, -scaledHalfH, Math.sin(angle) * botR);
      }
      botVerts.push(0, -scaledHalfH, 0);
      const botGeo = new THREE.BufferGeometry();
      const botIndices: number[] = [];
      for (let i = 0; i < radialSegments; i++) {
        botIndices.push(center, (i + 1) % (radialSegments + 1), i);
      }
      botGeo.setAttribute('position', new THREE.Float32BufferAttribute(botVerts, 3));
      botGeo.setIndex(botIndices);
      botGeo.computeVertexNormals();
      const botMesh = new THREE.Mesh(botGeo, new THREE.MeshBasicMaterial());
      botMesh.rotation.copy(meshRef.current.rotation);
      group.add(botMesh);

      const exporter = new STLExporter();
      const stlData = exporter.parse(group, { binary: true });
      const blob = new Blob([stlData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pottery.stl';
      link.click();
      URL.revokeObjectURL(url);
    },
  }));

  useFrame((_state, delta) => {
    if (!meshRef.current) return;

    meshRef.current.rotation.y += delta * 2.6;

    heightCurrent.current = THREE.MathUtils.lerp(heightCurrent.current, heightTarget.current, 0.12);
    meshRef.current.scale.y = heightCurrent.current;
    meshRef.current.position.y = (height / 2) * (heightCurrent.current - 1);

    const rh = rightHand.current;
    const paused = !!isPaused.current;
    const currentTexMode = textureMode.current ?? 'none';

    // Mark dirty when texture mode changes so geometry re-bakes the pattern
    if (currentTexMode !== prevTextureMode.current) {
      prevTextureMode.current = currentTexMode;
      dirty.current = true;
    }

    // ── SCULPTING (right hand pinch — disabled while paused) ──
    if (!paused && rh && rh.detected && rh.mode === 'PINCH') {
      smoothY.current = THREE.MathUtils.lerp(smoothY.current, rh.y, 0.1);
      smoothX.current = THREE.MathUtils.lerp(smoothX.current, rh.x, 0.25);
      const interactionY = smoothY.current * heightSegments;
      const influence = 6.0;
      const lerpSpeed = 0.4 * (delta * 60);

      for (let y = 0; y <= heightSegments; y++) {
        const dist = Math.abs(y - interactionY);
        if (dist < influence) {
          const t = 1.0 - dist / influence;
          const falloff = t * t * (3 - 2 * t);
          const currentR = radiusProfile[y];
          const mapX = THREE.MathUtils.clamp((smoothX.current - 0.3) / 0.6, 0, 1);
          const targetR = THREE.MathUtils.lerp(0.5, 6.0, mapX);
          radiusProfile[y] = THREE.MathUtils.lerp(currentR, targetR, lerpSpeed * falloff);
          dirty.current = true;
        }
      }
    }

    // ── HEIGHT CONTROL (right hand fist — disabled while paused) ──
    if (!paused && rh && rh.detected) {
      if (rh.mode === 'FIST') {
        fistLostFrames.current = 0;
        if (prevFistY.current !== null) {
          const dy = rh.y - prevFistY.current;
          if (Math.abs(dy) > 0.002) {
            const unclamped = heightTarget.current - dy * 2.0;
            heightTarget.current = THREE.MathUtils.clamp(unclamped, 0.3, 2.5);
            if (unclamped > 0.3 && unclamped < 2.5) {
              prevFistY.current = rh.y;
            }
          }
        } else {
          prevFistY.current = rh.y;
        }
      } else {
        // Hand is detected, but not in FIST mode (e.g. IDLE/PINCH).
        // Allow up to 20 frames (~330ms) of dropout before clearing baseline.
        fistLostFrames.current++;
        if (fistLostFrames.current > 20) {
          prevFistY.current = null;
        }
      }
    } else {
      // Hand is not detected at all
      prevFistY.current = null;
      fistLostFrames.current = 0;
    }

    // ── SIGNIFIERS (ring + cursor — pinch only) ──
    if (ringRef.current && cursorRef.current) {
      if (!paused && rh && rh.detected && rh.mode === 'PINCH') {
        const mappedY = (0.5 - smoothY.current) * height;
        const interactionIdx = Math.min(heightSegments, Math.max(0, Math.round(smoothY.current * heightSegments)));
        const currentRadius = radiusProfile[interactionIdx];

        ringRef.current.position.y = mappedY;
        ringRef.current.scale.setScalar((currentRadius + 0.1) / 3.5);
        cursorRef.current.position.set(currentRadius + 0.1, mappedY, 0);

        const rMat = ringRef.current.material as THREE.MeshStandardMaterial;
        const cMat = cursorRef.current.material as THREE.MeshStandardMaterial;
        rMat.color.set('#80ffdb'); rMat.emissive.set('#80ffdb'); rMat.opacity = 0.6;
        cMat.color.set('#80ffdb'); cMat.emissive.set('#80ffdb'); cMat.opacity = 1.0;
      } else {
        (ringRef.current.material as THREE.MeshStandardMaterial).opacity = 0;
        (cursorRef.current.material as THREE.MeshStandardMaterial).opacity = 0;
      }
    }

    // ── UPDATE GEOMETRY ──
    if (!dirty.current) return;
    dirty.current = false;

    const geo = meshRef.current.geometry as THREE.CylinderGeometry;
    const pos = geo.attributes.position;
    const stride = radialSegments + 1;

    for (let i = 0; i < pos.count; i++) {
      const yStr = pos.getY(i);
      const normalizedY = (height / 2 - yStr) / height;
      const yIdx = Math.round(normalizedY * heightSegments);
      const r = radiusProfile[THREE.MathUtils.clamp(yIdx, 0, heightSegments)];

      const currentX = pos.getX(i);
      const currentZ = pos.getZ(i);
      const len = Math.sqrt(currentX * currentX + currentZ * currentZ);

      if (len > 0.0001) {
        // Texture displacement — applied radially on top of base profile radius
        const heightT = THREE.MathUtils.clamp((height / 2 - yStr) / height, 0, 1);
        const theta = Math.atan2(currentZ, currentX);
        let texDisp = 0;

        // Envelope so displacement fades smoothly to 0 at the extreme top/bottom
        const envelope = Math.sin(heightT * Math.PI);

        switch (currentTexMode) {
          case 'ripple':
            // Rounded concentric grooves with fading envelope
            texDisp = Math.sin(heightT * Math.PI * 16) * 0.15 * envelope;
            break;
          case 'flutes': {
            // Flat-bottomed vertical ribbed grooves using power scale
            const wave = Math.sin(theta * 8);
            texDisp = Math.sign(wave) * Math.pow(Math.abs(wave), 0.5) * 0.12 * envelope;
            break;
          }
          case 'spiral':
            // Twisting spiral helical thread climbing up the vase
            texDisp = Math.sin(heightT * Math.PI * 6 - theta * 2) * 0.12 * envelope;
            break;
        }

        const finalR = r + texDisp;
        pos.setX(i, (currentX / len) * finalR);
        pos.setZ(i, (currentZ / len) * finalR);
      }
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const normals = geo.attributes.normal;
    for (let y = 0; y <= heightSegments; y++) {
      const idxStart = y * stride;
      const idxEnd = y * stride + radialSegments;
      const nx1 = normals.getX(idxStart); const ny1 = normals.getY(idxStart); const nz1 = normals.getZ(idxStart);
      const nx2 = normals.getX(idxEnd); const ny2 = normals.getY(idxEnd); const nz2 = normals.getZ(idxEnd);
      const avgX = nx1 + nx2; const avgY = ny1 + ny2; const avgZ = nz1 + nz2;
      const len = Math.sqrt(avgX * avgX + avgY * avgY + avgZ * avgZ) || 1;
      normals.setXYZ(idxStart, avgX / len, avgY / len, avgZ / len);
      normals.setXYZ(idxEnd, avgX / len, avgY / len, avgZ / len);
    }
    normals.needsUpdate = true;
  });

  return (
    <group position={[0, 0.2, 0]}>
      {/* Clay */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <cylinderGeometry args={[initialRadius, initialRadius, height, radialSegments, heightSegments, true]} />
        <meshPhysicalMaterial
          map={clayTexture}
          bumpMap={clayTexture}
          bumpScale={0.04}
          roughness={0.55}
          metalness={0.02}
          clearcoat={0.28}
          clearcoatRoughness={0.45}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Hugging Ring Signifier */}
      <mesh ref={ringRef} rotation-x={Math.PI / 2}>
        <torusGeometry args={[3.5, 0.1, 16, 64]} />
        <meshStandardMaterial transparent opacity={0} color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
      </mesh>

      {/* Surface Cursor Dot */}
      <mesh ref={cursorRef}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial transparent opacity={0} color="#ffffff" emissive="#ffffff" emissiveIntensity={1.0} />
      </mesh>
    </group>
  );
});

PotteryWheel.displayName = 'PotteryWheel';
