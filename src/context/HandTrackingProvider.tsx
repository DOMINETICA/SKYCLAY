import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Webcam from 'react-webcam';

declare global {
  interface Window {
    Camera: any;
    Hands: any;
  }
}

export type RightHandMode = 'IDLE' | 'PINCH' | 'FIST';
export type LeftHandMode  = 'IDLE' | 'PINCH' | 'SPREAD';

export interface HandLandmark { x: number; y: number; z: number; }

export interface RightHandState {
  detected: boolean;
  mode: RightHandMode;
  x: number;
  y: number;
  landmarks: HandLandmark[];
}

export interface LeftHandState {
  detected: boolean;
  mode: LeftHandMode;
  x: number;
  y: number;
  landmarks: HandLandmark[];
}

interface HandTrackingContextProps {
  rightHand:      React.RefObject<RightHandState>;
  leftHand:       React.RefObject<LeftHandState>;
  webcamRef:      React.RefObject<Webcam | null>;
  isCameraReady:  boolean;
  isPaused:       React.RefObject<boolean>;
  textureMode:    React.RefObject<string>;
  spreadProgress: React.RefObject<number>;
}

const HandTrackingContext = createContext<HandTrackingContextProps | undefined>(undefined);

export const HandTrackingProvider = ({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) => {
  const webcamRef = useRef<Webcam>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const rightHand     = useRef<RightHandState>({ detected: false, mode: 'IDLE', x: 0.5, y: 0.5, landmarks: [] });
  const leftHand      = useRef<LeftHandState>({ detected: false, mode: 'IDLE', x: 0.5, y: 0.5, landmarks: [] });
  const isPaused      = useRef(false);
  const textureMode   = useRef('none');
  const spreadProgress = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setIsCameraReady(false);
      return;
    }

    let camera: any = null;
    let isActive = true;

    // ── Gesture hysteresis state ──────────────────────────────────────────
    // Mutated directly (no re-render needed), local to this effect instance.
    //
    // PINCH  : hysteresis band — enter at < 0.08, exit at > 0.13
    //          Eliminates mode flickering at the boundary.
    //
    // FIST   : frame counter — increment on raw-fist, decrement×2 on not-fist.
    //          Needs 3 consecutive frames to lock in, exits in ≤2 false frames.
    //
    // SPREAD : same counter pattern but decrement×1 (slower exit — prevents
    //          dropout mid-hold when the user is charging the pause gesture).
    //
    // All curl / extension tests use wrist-to-MCP distance as the reference
    // length, making them robust to horizontal, diagonal, and vertical hand
    // orientations (the old tip.y > pip.y check broke on sideways hands).
    // ─────────────────────────────────────────────────────────────────────
    const rightGesture = { pinchActive: false, fistCounter: 0, fistActive: false };
    const leftGesture  = { pinchActive: false, spreadCounter: 0 };

    const spreadHoldStart  = { current: null as number | null };
    const spreadNeedsReset = { current: false };

    const initializeMediaPipe = async () => {
      if (!window.Hands || !window.Camera) { setTimeout(initializeMediaPipe, 100); return; }

      const hands = new window.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      hands.onResults((results: any) => {
        if (!isActive) return;

        let foundRight   = false;
        let foundLeft    = false;
        let leftIsSpread = false;

        if (results.multiHandLandmarks && results.multiHandedness) {
          for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const lm          = results.multiHandLandmarks[i];
            const isUserRight = results.multiHandedness[i].label === 'Left';
            const thumbTip    = lm[4];
            const indexTip    = lm[8];

            // ── Pinch distance (Isotropic 3D pixel-space) ────────────────
            const pinchDist = Math.hypot(
              (thumbTip.x - indexTip.x) * 320,
              (thumbTip.y - indexTip.y) * 240,
              ((thumbTip.z || 0) - (indexTip.z || 0)) * 320
            );

            // ── 3D Kinematic finger extension helper ──────────────────────
            // Computes the ratio of straight-line MCP-to-TIP distance relative
            // to the total length of the 3 finger segments.
            // This is scale-invariant and robust to hand rotation/tilt.
            const fingerExtension = (mcp: number, pip: number, dip: number, tip: number) => {
              const pMcp = lm[mcp];
              const pPip = lm[pip];
              const pDip = lm[dip];
              const pTip = lm[tip];
              
              const d1 = Math.hypot(pMcp.x - pPip.x, pMcp.y - pPip.y, (pMcp.z || 0) - (pPip.z || 0));
              const d2 = Math.hypot(pPip.x - pDip.x, pPip.y - pDip.y, (pPip.z || 0) - (pDip.z || 0));
              const d3 = Math.hypot(pDip.x - pTip.x, pDip.y - pTip.y, (pDip.z || 0) - (pTip.z || 0));
              const totalLength = d1 + d2 + d3 || 1e-9;
              
              const straightDist = Math.hypot(pMcp.x - pTip.x, pMcp.y - pTip.y, (pMcp.z || 0) - (pTip.z || 0));
              return straightDist / totalLength;
            };

            if (isUserRight) {
              foundRight = true;

              // ── Fist shape (computed BEFORE pinch so it can veto it) ──
              // Inside a fist the thumb tip rests on the curled index tip,
              // which used to falsely trigger PINCH and block FIST entirely.
              // Relaxed thresholds: only 3 of 4 fingers need to read curled
              // (the pinky is often mis-tracked), with shape-level hysteresis
              // so a formed fist is easy to hold but not to enter by accident.
              const extIndex  = fingerExtension(5, 6, 7, 8);
              const extMiddle = fingerExtension(9, 10, 11, 12);
              const extRing   = fingerExtension(13, 14, 15, 16);
              const extPinky  = fingerExtension(17, 18, 19, 20);
              const exts      = [extIndex, extMiddle, extRing, extPinky];
              const avgExt    = (extIndex + extMiddle + extRing + extPinky) / 4;

              const curlThresh  = rightGesture.fistActive ? 0.82 : 0.72;
              const curledCount = exts.filter(e => e < curlThresh).length;
              const fistShape   = rightGesture.fistActive
                ? curledCount >= 2 && avgExt < 0.80
                : curledCount >= 3 && avgExt < 0.68;

              // ── Pinch hysteresis — suppressed while hand is fist-shaped ──
              // 25px (~0.08 normalized) to enter, 40px (~0.125 normalized) to exit
              if (!rightGesture.pinchActive && pinchDist < 25 && !fistShape) rightGesture.pinchActive = true;
              if ( rightGesture.pinchActive && (pinchDist > 40 || fistShape)) rightGesture.pinchActive = false;
              const isPinching = rightGesture.pinchActive;

              // ── Fist debounce (2 frames in, gradual out) ──────────────
              rightGesture.fistCounter = fistShape
                ? Math.min(rightGesture.fistCounter + 1, 6)
                : Math.max(rightGesture.fistCounter - 1, 0);
              const isFist = rightGesture.fistCounter >= 2;
              rightGesture.fistActive = isFist;

              // Palm center (middle-finger MCP) is far steadier than the
              // curled index tip while the hand is a fist
              const palm = lm[9];
              rightHand.current.detected  = true;
              rightHand.current.mode      = isPinching ? 'PINCH' : isFist ? 'FIST' : 'IDLE';
              rightHand.current.x         = isFist ? 1 - palm.x : 1 - indexTip.x;
              rightHand.current.y         = isFist ? palm.y : indexTip.y;
              rightHand.current.landmarks = lm.map((l: any) => ({ x: l.x, y: l.y, z: l.z || 0 }));

            } else {
              foundLeft = true;

              // ── Pinch hysteresis (left hand) ──────────────────────────
              if (!leftGesture.pinchActive && pinchDist < 25) leftGesture.pinchActive = true;
              if ( leftGesture.pinchActive && pinchDist > 40) leftGesture.pinchActive = false;
              const isPinching = leftGesture.pinchActive;

              // ── Spread debounce (3 frames in, 1 frame out) ────────────
              // All four fingers must be extended (extension ratio > 0.80)
              const isIndexExt  = fingerExtension(5, 6, 7, 8) > 0.80;
              const isMiddleExt = fingerExtension(9, 10, 11, 12) > 0.80;
              const isRingExt   = fingerExtension(13, 14, 15, 16) > 0.80;
              const isPinkyExt  = fingerExtension(17, 18, 19, 20) > 0.80;

              const rawSpread = !isPinching && isIndexExt && isMiddleExt && isRingExt && isPinkyExt;
              leftGesture.spreadCounter = rawSpread
                ? Math.min(leftGesture.spreadCounter + 1, 6)
                : Math.max(leftGesture.spreadCounter - 1, 0);
              const isSpread = leftGesture.spreadCounter >= 3;

              leftHand.current.detected  = true;
              leftHand.current.mode      = isPinching ? 'PINCH' : isSpread ? 'SPREAD' : 'IDLE';
              leftHand.current.x         = 1 - indexTip.x;
              leftHand.current.y         = indexTip.y;
              leftHand.current.landmarks = lm.map((l: any) => ({ x: l.x, y: l.y, z: l.z || 0 }));
              leftIsSpread = isSpread && !isPinching;
            }
          }
        }

        // ── SPREAD-to-PAUSE toggle (left hand, 1-second hold) ─────────────
        if (leftIsSpread) {
          if (spreadNeedsReset.current) {
            spreadHoldStart.current = null;
            spreadProgress.current  = 0;
          } else {
            if (spreadHoldStart.current === null) spreadHoldStart.current = Date.now();
            const elapsed = Date.now() - spreadHoldStart.current;
            const threshold = isPaused.current ? 1000 : 3500;
            spreadProgress.current = Math.min(elapsed / threshold, 1);
            if (elapsed >= threshold) {
              isPaused.current         = !isPaused.current;
              spreadHoldStart.current  = null;
              spreadProgress.current   = 0;
              spreadNeedsReset.current = true;
            }
          }
        } else {
          spreadHoldStart.current  = null;
          spreadProgress.current   = 0;
          spreadNeedsReset.current = false;
        }

        // ── Clear lost hands + reset their gesture state ──────────────────
        if (!foundRight) {
          rightHand.current.detected  = false;
          rightHand.current.mode      = 'IDLE';
          rightHand.current.landmarks = [];
          rightGesture.pinchActive    = false;
          rightGesture.fistCounter    = 0;
          rightGesture.fistActive     = false;
        }
        if (!foundLeft) {
          leftHand.current.detected   = false;
          leftHand.current.mode       = 'IDLE';
          leftHand.current.landmarks  = [];
          leftGesture.pinchActive     = false;
          leftGesture.spreadCounter   = 0;
          spreadHoldStart.current     = null;
          spreadProgress.current      = 0;
          spreadNeedsReset.current    = false;
        }
      });

      if (webcamRef.current?.video) {
        camera = new window.Camera(webcamRef.current.video, {
          onFrame: async () => {
            const video = webcamRef.current?.video;
            if (video && video.readyState === 4) {
              try {
                await hands.send({ image: video });
              } catch (err) {
                console.error("MediaPipe send error:", err);
              }
            }
          },
          width: 640,
          height: 480,
        });
        camera.start().then(() => { 
          if (isActive) setIsCameraReady(true); 
        }).catch((err: any) => {
          console.error("Camera start failed:", err);
        });
      }
    };

    const timeout = setTimeout(initializeMediaPipe, 1000);
    return () => {
      isActive = false;
      clearTimeout(timeout);
      if (camera) camera.stop();
    };
  }, [enabled]);

  return (
    <HandTrackingContext.Provider
      value={{ rightHand, leftHand, webcamRef, isCameraReady, isPaused, textureMode, spreadProgress }}
    >
      {children}
    </HandTrackingContext.Provider>
  );
};

export const useHandTracking = () => {
  const ctx = useContext(HandTrackingContext);
  if (!ctx) throw new Error('useHandTracking must be used within HandTrackingProvider');
  return ctx;
};
