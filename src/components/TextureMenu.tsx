import { useEffect, useRef, useState } from 'react';
import { useHandTracking } from '../context/HandTrackingProvider';

const TEXTURES = [
  { id: 'none',   name: 'Smooth',  symbol: '◯' },
  { id: 'ripple', name: 'Ripple',  symbol: '〰' },
  { id: 'spiral', name: 'Spiral',  symbol: '◎' },
  { id: 'flutes', name: 'Flutes',  symbol: '⫿' },
  { id: 'knurl',  name: 'Knurl',   symbol: '⬡' },
  { id: 'bamboo', name: 'Bamboo',  symbol: '≡' },
];

const DWELL_MS = 1200;
const CIRC = 2 * Math.PI * 46; // circumference of dwell SVG arc (r=46)

export const TextureMenu = () => {
  const { leftHand, isPaused, textureMode } = useHandTracking();

  const [visible, setVisible] = useState(false);
  const [cursor, setCursor] = useState({ x: -300, y: -300 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [selectedId, setSelectedId] = useState('none');

  const dwellStart    = useRef<number | null>(null);
  const dwellIdxRef   = useRef<number | null>(null);
  const rafRef        = useRef(0);
  const cardRefs      = useRef<(HTMLDivElement | null)[]>([]);
  // EMA-smoothed cursor — damps per-frame jitter without introducing lag
  const smoothX = useRef(-300);
  const smoothY = useRef(-300);
  const CURSOR_ALPHA = 0.4;

  // Poll isPaused ref to drive React visibility state
  useEffect(() => {
    const id = setInterval(() => setVisible(!!isPaused.current), 60);
    return () => clearInterval(id);
  }, [isPaused]);

  // RAF loop: track hand cursor position and dwell progress when menu is open
  useEffect(() => {
    if (!visible) {
      setHoveredIdx(null);
      setDwellProgress(0);
      dwellStart.current = null;
      dwellIdxRef.current = null;
      return;
    }

    const tick = () => {
      const lh = leftHand.current;

      if (lh && lh.detected && lh.landmarks && lh.landmarks.length > 8) {
        // lh.x is already mirrored (1 - raw.x) so it maps correctly to screen left→right.
        // Apply EMA smoothing to damp per-frame jitter before hit-testing.
        const rawSx = (lh.x ?? 0.5) * window.innerWidth;
        const rawSy = (lh.y ?? 0.5) * window.innerHeight;
        smoothX.current = CURSOR_ALPHA * rawSx + (1 - CURSOR_ALPHA) * smoothX.current;
        smoothY.current = CURSOR_ALPHA * rawSy + (1 - CURSOR_ALPHA) * smoothY.current;
        const sx = smoothX.current;
        const sy = smoothY.current;
        setCursor({ x: sx, y: sy });

        // Hit-test each card
        let found = -1;
        cardRefs.current.forEach((el, idx) => {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          if (sx >= rect.left && sx <= rect.right && sy >= rect.top && sy <= rect.bottom) {
            found = idx;
          }
        });

        if (found !== -1) {
          setHoveredIdx(found);
          // Start dwell timer when entering a new card
          if (dwellIdxRef.current !== found) {
            dwellIdxRef.current = found;
            dwellStart.current = performance.now();
          }
          const elapsed = performance.now() - (dwellStart.current ?? performance.now());
          const progress = Math.min(Math.max(elapsed / DWELL_MS, 0), 1);
          setDwellProgress(progress);

          if (elapsed >= DWELL_MS) {
            const newId = TEXTURES[found].id;
            setSelectedId(newId);
            textureMode.current = newId;
            // Reset dwell so user must re-enter the card to trigger again
            dwellIdxRef.current = null;
            dwellStart.current = null;
          }
        } else {
          setHoveredIdx(null);
          dwellIdxRef.current = null;
          dwellStart.current = null;
          setDwellProgress(0);
        }
      } else {
        smoothX.current = -300;
        smoothY.current = -300;
        setCursor({ x: -300, y: -300 });
        setHoveredIdx(null);
        dwellIdxRef.current = null;
        dwellStart.current = null;
        setDwellProgress(0);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, leftHand, textureMode]);

  if (!visible) return null;

  return (
    <>
      <div className="texture-overlay">
        <div className="texture-overlay-badge">⏸ Design Paused</div>

        <p className="texture-overlay-subtitle">
          Point your left index finger at a texture and hold to apply
        </p>

        <div className="texture-cards">
          {TEXTURES.map((tex, idx) => {
            const isHov = hoveredIdx === idx;
            const isSel = selectedId === tex.id;
            const prog = isHov ? dwellProgress : 0;

            return (
              <div
                key={tex.id}
                ref={el => { cardRefs.current[idx] = el; }}
                className={`texture-card${isSel ? ' selected' : ''}${isHov ? ' hovered' : ''}`}
              >
                {/* Dwell progress arc */}
                {isHov && prog > 0 && (
                  <svg className="dwell-ring" viewBox="0 0 100 100" aria-hidden="true">
                    <circle
                      cx="50" cy="50" r="46"
                      fill="none"
                      stroke="#a3c2ff"
                      strokeWidth="3"
                      strokeDasharray={`${prog * CIRC} ${CIRC}`}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                )}
                <div className="texture-card-symbol">{tex.symbol}</div>
                <div className="texture-card-name">{tex.name}</div>
                {isSel && <div className="texture-card-tick">✓</div>}
              </div>
            );
          })}
        </div>

        <p className="texture-overlay-exit">
          Open your left hand flat and hold for 1 second to resume sculpting
        </p>
      </div>

      {/* Hand cursor dot — tracks left index finger */}
      <div className="hand-cursor" style={{ left: cursor.x, top: cursor.y }} />
    </>
  );
};
