import { useRef, useEffect, useState } from 'react';
import { HandTrackingProvider, useHandTracking } from './context/HandTrackingProvider';
import { Experience } from './components/Experience';
import { HandOverlay } from './components/HandOverlay';
import { TextureMenu } from './components/TextureMenu';
import { IntroModal } from './components/IntroModal';
import type { PotteryWheelHandle } from './components/PotteryWheel';
import Webcam from 'react-webcam';
import { RotateCcw, Sparkles, Grab, Eye, Download, ArrowUp, ArrowDown, Layers } from 'lucide-react';

const Header = () => (
  <div className="header-pill">
    <h1>Ceramic Wheel</h1>
    <p>Shape pottery with your hands</p>
  </div>
);

const ToolPalette = ({ onReset, onExport, onStretch, onCompress }: {
  onReset: () => void;
  onExport: () => void;
  onStretch: () => void;
  onCompress: () => void;
}) => (
  <div className="tool-palette">
    <div className="palette-title">Toolbox</div>

    <div className="tool-item">
      <div className="tool-icon pull">
        <Grab size={20} />
      </div>
      <div className="tool-text">
        <strong>Shape Clay</strong>
        Right hand: pinch & drag
      </div>
    </div>

    <div className="tool-item">
      <div className="tool-icon tilt">
        <Eye size={20} />
      </div>
      <div className="tool-text">
        <strong>Camera</strong>
        Left hand: pinch to orbit
      </div>
    </div>

    <div className="tool-item">
      <div className="tool-icon" style={{ background: 'rgba(255,214,10,0.15)', border: '1px solid rgba(255,214,10,0.3)', color: '#ffd60a' }}>
        <Layers size={20} />
      </div>
      <div className="tool-text">
        <strong>Textures</strong>
        Left open palm — hold 1s
      </div>
    </div>

    <div className="tool-item" style={{ marginTop: '2rem' }}>
      <button className="tool-icon reset" onClick={onReset} title="Reset Clay">
        <RotateCcw size={20} />
      </button>
      <div className="tool-text">
        <strong>Start Over</strong>
        Reset clay shape
      </div>
    </div>

    <div className="tool-item">
      <div className="tool-text" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button className="tool-icon reset" onClick={onStretch} title="Elongate">
          <ArrowUp size={20} />
        </button>
        <button className="tool-icon reset" onClick={onCompress} title="Compress">
          <ArrowDown size={20} />
        </button>
        <div>
          <strong>Height</strong><br />
          Right fist up / down
        </div>
      </div>
    </div>

    <div className="tool-item">
      <button className="tool-icon reset" onClick={onExport} title="Download STL">
        <Download size={20} />
      </button>
      <div className="tool-text">
        <strong>Download STL</strong>
        Save for 3D printing
      </div>
    </div>
  </div>
);

const SmartIsland = () => {
  const { isCameraReady, rightHand, leftHand, isPaused } = useHandTracking();
  const [rightMode, setRightMode] = useState('IDLE');
  const [leftMode, setLeftMode] = useState('IDLE');
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRightMode(rightHand.current && rightHand.current.detected ? rightHand.current.mode : 'NONE');
      setLeftMode(leftHand.current && leftHand.current.detected ? leftHand.current.mode : 'NONE');
      setPaused(!!isPaused.current);
    }, 80);
    return () => clearInterval(interval);
  }, [rightHand, leftHand, isPaused]);

  if (!isCameraReady) {
    return (
      <div className="smart-island">
        <div className="status-pill error">Looking for camera...</div>
      </div>
    );
  }

  if (paused) {
    return (
      <div className="smart-island" style={{ borderColor: 'rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.1)' }}>
        <div className="status-pill" style={{ color: '#ffd60a', textShadow: '0 0 10px rgba(255,214,10,0.5)' }}>
          ⏸ Paused — Texture Menu Open
        </div>
      </div>
    );
  }

  return (
    <div className="smart-island">
      <div className={`status-pill ${rightMode === 'PINCH' ? 'active-pulling' : ''}`}>
        {rightMode === 'PINCH' ? (
          <><Sparkles size={16} /> Shaping</>
        ) : rightMode === 'FIST' ? (
          <>✊ Height</>
        ) : (
          <>✋ Right {rightMode === 'NONE' ? 'undetected' : 'ready'}</>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />

      <div className={`status-pill ${leftMode === 'PINCH' ? 'active-tilting' : leftMode === 'SPREAD' ? 'active-spread' : ''}`}>
        {leftMode === 'PINCH' ? (
          <><Eye size={16} /> Tilting</>
        ) : leftMode === 'SPREAD' ? (
          <>🖐 Charging…</>
        ) : (
          <>🤚 Left {leftMode === 'NONE' ? 'undetected' : 'ready'}</>
        )}
      </div>
    </div>
  );
};

const HandIndicators = () => {
  const { rightHand, leftHand, isPaused } = useHandTracking();
  const [rh, setRh] = useState({ detected: false, mode: 'IDLE' });
  const [lh, setLh] = useState({ detected: false, mode: 'IDLE' });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRh({ detected: !!(rightHand.current?.detected), mode: rightHand.current?.mode ?? 'IDLE' });
      setLh({ detected: !!(leftHand.current?.detected), mode: leftHand.current?.mode ?? 'IDLE' });
      setPaused(!!isPaused.current);
    }, 80);
    return () => clearInterval(interval);
  }, [rightHand, leftHand, isPaused]);

  const leftActive = lh.mode === 'PINCH' || lh.mode === 'SPREAD';
  const rightActive = rh.mode === 'PINCH' || rh.mode === 'FIST';

  return (
    <>
      {/* Left Hand Indicator */}
      <div className={`hand-indicator left ${lh.detected ? 'detected' : ''} ${leftActive ? 'active' : ''} ${lh.mode === 'SPREAD' ? 'spread' : ''}`}>
        <div className="hi-accent-bar" />
        <div className="hi-content">
          <div className="hi-dot" />
          <div className="hi-label">LEFT</div>
          <div className="hi-icon">
            {lh.mode === 'PINCH' ? '👌' : lh.mode === 'SPREAD' ? '🖐' : '🤚'}
          </div>
          <div className="hi-mode">
            {!lh.detected ? 'No Hand'
              : lh.mode === 'SPREAD' ? (paused ? 'Resume…' : 'Pausing…')
              : lh.mode === 'PINCH' ? (paused ? 'Select' : 'Orbiting')
              : (paused ? 'Select' : 'Ready')}
          </div>
          <div className="hi-hint">
            {paused
              ? (lh.mode === 'SPREAD' ? 'Hold flat to resume' : 'Point to select')
              : (lh.mode === 'SPREAD' ? 'Hold to toggle' : 'Pinch to orbit')}
          </div>
        </div>
      </div>

      {/* Right Hand Indicator */}
      <div className={`hand-indicator right ${rh.detected ? 'detected' : ''} ${rightActive ? 'active' : ''}`}>
        <div className="hi-content">
          <div className="hi-dot" />
          <div className="hi-label">RIGHT</div>
          <div className="hi-icon">
            {rh.mode === 'PINCH' ? '🤏' : rh.mode === 'FIST' ? '✊' : '✋'}
          </div>
          <div className="hi-mode">
            {!rh.detected ? 'No Hand'
              : rh.mode === 'PINCH' ? (paused ? 'Ready' : 'Sculpting')
              : rh.mode === 'FIST' ? 'Height'
              : 'Ready'}
          </div>
          <div className="hi-hint">
            {paused ? 'Inactive while paused' : 'Pinch to sculpt'}
          </div>
        </div>
        <div className="hi-accent-bar" />
      </div>
    </>
  );
};

const GlobalUI = ({ onReset, onExport, onStretch, onCompress, onHelp }: {
  onReset: () => void;
  onExport: () => void;
  onStretch: () => void;
  onCompress: () => void;
  onHelp: () => void;
}) => {
  return (
    <div className="ui-overlay">
      <Header />
      <SmartIsland />
      <HandIndicators />
      <ToolPalette onReset={onReset} onExport={onExport} onStretch={onStretch} onCompress={onCompress} />
      <button className="help-button" onClick={onHelp} title="How to play" aria-label="Open tutorial">?</button>
    </div>
  );
};

const AppContent = ({ introActive, setIntroActive }: { introActive: boolean; setIntroActive: (active: boolean) => void }) => {
  const { webcamRef, rightHand, leftHand } = useHandTracking();
  const potteryRef = useRef<PotteryWheelHandle>(null);
  const [handsActive, setHandsActive] = useState(false);

  useEffect(() => {
    if (introActive) return;
    const interval = setInterval(() => {
      setHandsActive(!!(rightHand.current?.detected) || !!(leftHand.current?.detected));
    }, 200);
    return () => clearInterval(interval);
  }, [rightHand, leftHand, introActive]);

  return (
    <>
      {!introActive && (
        <div className="webcam-container">
          <Webcam
            ref={webcamRef}
            audio={false}
            className={`webcam-preview ${handsActive ? 'hands-active' : ''}`}
            videoConstraints={{
              width: 640,
              height: 480,
              facingMode: "user"
            }}
            playsInline
          />
          <HandOverlay />
        </div>
      )}
      <Experience potteryRef={potteryRef} />
      <GlobalUI
        onReset={() => potteryRef.current?.reset()}
        onExport={() => potteryRef.current?.exportSTL()}
        onStretch={() => potteryRef.current?.stretch()}
        onCompress={() => potteryRef.current?.compress()}
        onHelp={() => setIntroActive(true)}
      />
      <TextureMenu />
      {introActive && <IntroModal onDismiss={() => setIntroActive(false)} />}
    </>
  );
};

function App() {
  const [introActive, setIntroActive] = useState(() => {
    return !localStorage.getItem('cw-intro-v1');
  });

  return (
    <HandTrackingProvider enabled={!introActive}>
      <AppContent introActive={introActive} setIntroActive={setIntroActive} />
    </HandTrackingProvider>
  );
}

export default App;
