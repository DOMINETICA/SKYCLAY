import { useRef, useEffect } from 'react';
import { useHandTracking } from '../context/HandTrackingProvider';
import type { HandLandmark } from '../context/HandTrackingProvider';

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const TIP_INDICES = new Set([0, 4, 8, 12, 16, 20]);
const RIGHT_COLOR  = '#80ffdb';
const LEFT_COLOR   = '#a3c2ff';
const FIST_COLOR   = '#ffb347';
const SPREAD_COLOR = '#ffd60a';
const W = 320;
const H = 240;

function palmCenter(lm: HandLandmark[], px: (l: HandLandmark) => number, py: (l: HandLandmark) => number) {
  return {
    x: (px(lm[0]) + px(lm[5]) + px(lm[9]) + px(lm[13]) + px(lm[17])) / 5,
    y: (py(lm[0]) + py(lm[5]) + py(lm[9]) + py(lm[13]) + py(lm[17])) / 5,
  };
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  landmarks: HandLandmark[],
  color: string,
  mode: string,
  now: number,
  spreadProg: number
) {
  if (!landmarks.length) return;

  const px = (lm: HandLandmark) => lm.x * W;
  const py = (lm: HandLandmark) => lm.y * H;
  const isPinching = mode === 'PINCH';
  const isFist    = mode === 'FIST';
  const isSpread  = mode === 'SPREAD';
  const drawColor = isFist ? FIST_COLOR : isSpread ? SPREAD_COLOR : color;

  // Skeleton lines
  ctx.strokeStyle = drawColor;
  ctx.lineWidth = (isPinching || isFist || isSpread) ? 2.5 : 2;
  ctx.globalAlpha = (isPinching || isFist || isSpread) ? 1.0 : 0.75;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    ctx.moveTo(px(landmarks[a]), py(landmarks[a]));
    ctx.lineTo(px(landmarks[b]), py(landmarks[b]));
  }
  ctx.stroke();

  // Joint dots
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = drawColor;
  for (let i = 0; i < 21; i++) {
    const isPinchTip = isPinching && (i === 4 || i === 8);
    const r = isPinchTip ? 6 : TIP_INDICES.has(i) ? 5 : 3;

    if (isPinchTip || isFist || isSpread) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = drawColor;
    }
    ctx.beginPath();
    ctx.arc(px(landmarks[i]), py(landmarks[i]), r, 0, Math.PI * 2);
    ctx.fill();
    if (isPinchTip || isFist || isSpread) ctx.shadowBlur = 0;
  }

  // Pinch: marching-ants line between thumb tip and index tip
  if (isPinching) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -(now / 60) % 8;
    ctx.beginPath();
    ctx.moveTo(px(landmarks[4]), py(landmarks[4]));
    ctx.lineTo(px(landmarks[8]), py(landmarks[8]));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Fist: pulsing ring around palm
  if (isFist) {
    const { x: palmX, y: palmY } = palmCenter(landmarks, px, py);
    const pulse = 18 + Math.sin(now / 200) * 4;
    ctx.strokeStyle = FIST_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.shadowBlur = 12;
    ctx.shadowColor = FIST_COLOR;
    ctx.beginPath();
    ctx.arc(palmX, palmY, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Spread: charge arc fills up as the user holds the gesture
  if (isSpread) {
    const { x: palmX, y: palmY } = palmCenter(landmarks, px, py);
    const r = 22;

    // Background ring (dim)
    ctx.strokeStyle = SPREAD_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(palmX, palmY, r, 0, Math.PI * 2);
    ctx.stroke();

    // Progress arc
    if (spreadProg > 0) {
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 16;
      ctx.shadowColor = SPREAD_COLOR;
      ctx.beginPath();
      ctx.arc(palmX, palmY, r, -Math.PI / 2, -Math.PI / 2 + spreadProg * 2 * Math.PI);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  ctx.globalAlpha = 1.0;
}

export const HandOverlay = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { rightHand, leftHand, spreadProgress } = useHandTracking();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const now = performance.now();
      const rh = rightHand.current;
      const lh = leftHand.current;
      const sProg = spreadProgress.current ?? 0;

      if (rh && rh.detected && rh.landmarks.length) {
        drawHand(ctx, rh.landmarks, RIGHT_COLOR, rh.mode, now, 0);
      }
      if (lh && lh.detected && lh.landmarks.length) {
        drawHand(ctx, lh.landmarks, LEFT_COLOR, lh.mode, now, sProg);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [rightHand, leftHand, spreadProgress]);

  return <canvas ref={canvasRef} width={W} height={H} className="hand-overlay-canvas" />;
};
