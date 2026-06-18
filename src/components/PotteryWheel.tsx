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
  const { rightHand, isPaused, textureMode, glazeMode } = useHandTracking();

  const initialRadius = 2.5;
  const height = 10;
  const radialSegments = 64;
  const heightSegments = 64;

  const radiusProfile = useMemo(() => {
    return new Float32Array(heightSegments + 1).fill(initialRadius);
  }, [heightSegments, initialRadius]);

  // Pre-generate procedural textures for all 6 glazes
  const textures = useMemo(() => {
    const createTexture = (glazeId: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;

      // 1. Base Colors and details
      if (glazeId === 'terracotta') {
        ctx.fillStyle = '#b85c4a';
        ctx.fillRect(0, 0, 512, 512);

        // Vertical streaks (rough clay)
        for (let i = 0; i < 80; i++) {
          const x = Math.random() * 512;
          const w = 3 + Math.random() * 18;
          const light = Math.random() > 0.5;
          ctx.fillStyle = light
            ? `rgba(232, 178, 140, 0.04)`
            : `rgba(90, 38, 24, 0.05)`;
          ctx.fillRect(x, 0, w, 512);
        }
      } else if (glazeId === 'speckled') {
        ctx.fillStyle = '#e6dfd3'; // oatmeal cream
        ctx.fillRect(0, 0, 512, 512);

        // Dark speckles
        for (let i = 0; i < 400; i++) {
          const x = Math.random() * 512;
          const y = Math.random() * 512;
          const r = 0.5 + Math.random() * 1.5;
          ctx.fillStyle = Math.random() > 0.3 ? 'rgba(54, 43, 33, 0.25)' : 'rgba(102, 85, 68, 0.15)';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (glazeId === 'cobalt') {
        ctx.fillStyle = '#1a3375'; // Cobalt Blue
        ctx.fillRect(0, 0, 512, 512);

        // Soft hand-painted radial streaks
        for (let i = 0; i < 60; i++) {
          const x = Math.random() * 512;
          const w = 4 + Math.random() * 20;
          ctx.fillStyle = Math.random() > 0.5
            ? 'rgba(38, 70, 150, 0.08)'
            : 'rgba(8, 20, 60, 0.09)';
          ctx.fillRect(x, 0, w, 512);
        }
      } else if (glazeId === 'celadon') {
        ctx.fillStyle = '#b5cfc0'; // Celadon Jade
        ctx.fillRect(0, 0, 512, 512);

        // Subtle crackle lines
        ctx.strokeStyle = 'rgba(125, 145, 130, 0.12)';
        ctx.lineWidth = 1.0;
        for (let i = 0; i < 15; i++) {
          let cx = Math.random() * 512;
          let cy = 0;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          for (let j = 0; j < 6; j++) {
            cx += (Math.random() - 0.5) * 40;
            cy += 85;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
      } else if (glazeId === 'porcelain') {
        ctx.fillStyle = '#ffffff'; // White porcelain
        ctx.fillRect(0, 0, 512, 512);

        // Soft gray streaks (marbling / throwing lines)
        for (let i = 0; i < 40; i++) {
          const x = Math.random() * 512;
          const w = 2 + Math.random() * 10;
          ctx.fillStyle = `rgba(200, 200, 205, 0.03)`;
          ctx.fillRect(x, 0, w, 512);
        }
      } else if (glazeId === 'bronze') {
        ctx.fillStyle = '#2d2722'; // Deep metallic bronze
        ctx.fillRect(0, 0, 512, 512);

        // Gold/Metallic brushed streaks
        for (let i = 0; i < 80; i++) {
          const x = Math.random() * 512;
          const w = 3 + Math.random() * 15;
          ctx.fillStyle = Math.random() > 0.5
            ? 'rgba(184, 134, 11, 0.06)'
            : 'rgba(15, 12, 10, 0.15)';
          ctx.fillRect(x, 0, w, 512);
        }
      }

      // 2. Common throwing lines (soft ridges left by fingers during spinning)
      for (let y = 8; y < 512; y += 12 + Math.random() * 18) {
        ctx.fillStyle = `rgba(0, 0, 0, ${glazeId === 'porcelain' ? 0.01 : 0.02})`;
        ctx.fillRect(0, y, 512, 1 + Math.random() * 1.5);
        ctx.fillStyle = `rgba(255, 255, 255, ${glazeId === 'porcelain' ? 0.015 : 0.01})`;
        ctx.fillRect(0, y + 2, 512, 1);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };

    return {
      terracotta: createTexture('terracotta'),
      speckled:   createTexture('speckled'),
      cobalt:     createTexture('cobalt'),
      celadon:    createTexture('celadon'),
      porcelain:  createTexture('porcelain'),
      bronze:     createTexture('bronze'),
    };
  }, []);

  const smoothY = useRef(0.5);
  const smoothX = useRef(0.5);
  const dirty = useRef(true);
  const heightTarget = useRef(1.0);
  const heightCurrent = useRef(1.0);
  const prevFistY = useRef<number | null>(null);
  const fistLostFrames = useRef<number>(0);
  const prevTextureMode = useRef('none');
  const prevGlazeMode = useRef('terracotta');
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);

  const updateMaterial = (glazeId: string) => {
    const mat = materialRef.current;
    if (!mat) return;

    const tex = textures[glazeId as keyof typeof textures] || textures.terracotta;

    mat.map = tex;
    mat.bumpMap = tex;
    mat.bumpScale = glazeId === 'bronze' ? 0.02 : glazeId === 'porcelain' ? 0.015 : 0.05;

    // Reset default properties
    mat.clearcoat = 0.0;
    mat.clearcoatRoughness = 0.0;
    mat.transmission = 0.0;
    mat.thickness = 0.0;
    mat.roughness = 0.55;
    mat.metalness = 0.0;
    mat.color.set('#ffffff');

    if (glazeId === 'terracotta') {
      mat.roughness = 0.75;
      mat.metalness = 0.02;
    } else if (glazeId === 'speckled') {
      mat.roughness = 0.6;
      mat.clearcoat = 0.4;
      mat.clearcoatRoughness = 0.2;
    } else if (glazeId === 'cobalt') {
      mat.roughness = 0.15;
      mat.clearcoat = 1.0;
      mat.clearcoatRoughness = 0.05;
    } else if (glazeId === 'celadon') {
      mat.roughness = 0.2;
      mat.clearcoat = 1.0;
      mat.clearcoatRoughness = 0.08;
      mat.transmission = 0.25;
      mat.thickness = 0.8;
    } else if (glazeId === 'porcelain') {
      mat.roughness = 0.1;
      mat.clearcoat = 1.0;
      mat.clearcoatRoughness = 0.02;
      mat.transmission = 0.15;
      mat.thickness = 0.5;
    } else if (glazeId === 'bronze') {
      mat.roughness = 0.35;
      mat.metalness = 0.9;
      mat.clearcoat = 0.1;
    }

    mat.needsUpdate = true;
  };

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
    const currentGlazeMode = glazeMode.current ?? 'terracotta';

    // Update material properties if glaze changes or on first run
    if (currentGlazeMode !== prevGlazeMode.current || !materialRef.current?.map) {
      prevGlazeMode.current = currentGlazeMode;
      updateMaterial(currentGlazeMode);
    }

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

        switch (currentTexMode) {
          case 'ripple':
            texDisp = Math.sin(heightT * Math.PI * 14) * 0.15;
            break;
          case 'spiral':
            texDisp = Math.sin(heightT * Math.PI * 8 + theta * 2) * 0.12;
            break;
          case 'flutes':
            texDisp = Math.sin(theta * 12) * 0.10;
            break;
          case 'knurl':
            texDisp = Math.sin(heightT * Math.PI * 10) * Math.sin(theta * 10) * 0.10;
            break;
          case 'bamboo':
            texDisp = Math.abs(Math.sin(heightT * Math.PI * 8)) * 0.12 - 0.02;
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
          ref={materialRef}
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
