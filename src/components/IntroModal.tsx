import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cw-intro-v2';

const SLIDES = [
  {
    id: 'welcome',
    title: 'Ceramic Wheel',
    subtitle: 'Shape real pottery with your bare hands',
    body: 'Your webcam tracks hand gestures in real time — no controller, no touchscreen. Just move your hands in front of your camera. Tip: face a light source and keep your whole hand inside the frame for the most reliable tracking.',
    gestures: null,
  },
  {
    id: 'right-hand',
    title: 'Right Hand',
    subtitle: 'Sculpt the clay',
    body: null,
    gestures: [
      {
        emoji: '🤏',
        anim: 'pinch',
        color: '#80ffdb',
        label: 'Pinch + drag',
        hint: 'Move right hand left or right to push and pull the clay surface at any height',
      },
      {
        emoji: '✊',
        anim: 'fist',
        color: '#ffb347',
        label: 'Fist + move',
        hint: 'Curl all fingers into a tight fist with your palm facing the camera, then move up to raise the clay or down to compress it',
      },
    ],
  },
  {
    id: 'left-hand',
    title: 'Left Hand',
    subtitle: 'Navigate & pause',
    body: null,
    gestures: [
      {
        emoji: '👌',
        anim: 'orbit',
        color: '#a3c2ff',
        label: 'Pinch + drag',
        hint: 'Orbit the camera around your creation to view it from any angle',
      },
      {
        emoji: '🖐',
        anim: 'spread',
        color: '#ffd60a',
        label: 'Open palm — hold 3.5s',
        hint: 'Freezes the design and opens the texture picker menu',
      },
    ],
  },
  {
    id: 'finish',
    title: 'Textures & Export',
    subtitle: 'Finish your piece',
    body: null,
    gestures: [
      {
        emoji: '☝️',
        anim: 'dwell',
        color: '#a3c2ff',
        label: 'Point & hover',
        hint: 'While paused, hover your left index finger over a texture for 1 second to apply it',
      },
      {
        emoji: '📥',
        anim: 'none',
        color: '#8899cc',
        label: 'Download STL',
        hint: 'Save your pottery as an STL file for 3D printing at any time',
      },
    ],
  },
] as const;

type Slide = typeof SLIDES[number];

export const IntroModal = ({ onDismiss }: { onDismiss: () => void }) => {
  const [step, setStep]           = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1');
    onDismiss();
  }, [onDismiss]);

  const next = useCallback(() => {
    if (step < SLIDES.length - 1) {
      setDirection('next');
      setStep(s => s + 1);
    } else {
      dismiss();
    }
  }, [step, dismiss]);

  const back = useCallback(() => {
    if (step > 0) {
      setDirection('prev');
      setStep(s => s - 1);
    }
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')                    dismiss();
      if (e.key === 'ArrowRight')                next();
      if (e.key === 'ArrowLeft')                 back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, dismiss]);

  const slide: Slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="intro-overlay" role="dialog" aria-modal="true" aria-label="Welcome guide">
      <div className="intro-card">

        {/* Step dots */}
        <div className="intro-progress">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              className={`intro-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
              onClick={() => {
                if (i !== step) {
                  setDirection(i > step ? 'next' : 'prev');
                  setStep(i);
                }
              }}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Slide body — key forces re-mount so CSS slide-in fires each step */}
        <div className={`intro-slide slide-${direction}`} key={`${slide.id}-${direction}`}>
          <div className="intro-slide-header">
            <h2 className="intro-title">{slide.title}</h2>
            <p className="intro-subtitle">{slide.subtitle}</p>
          </div>

          {slide.id === 'welcome' && (
            <>
              <div className="intro-hero">
                <div className="intro-hero-icon">🏺</div>
              </div>
              <p className="intro-body">{slide.body}</p>
            </>
          )}

          {slide.gestures && (
            <div className="intro-gestures">
              {slide.gestures.map((g) => (
                <div key={g.label} className="intro-gesture-card">
                  <div
                    className={`intro-gesture-icon anim-${g.anim}`}
                    style={{ '--g-color': g.color } as React.CSSProperties}
                  >
                    <span className="ig-emoji">{g.emoji}</span>
                    {g.anim === 'orbit'  && <div className="ig-orbit-ring" />}
                    {g.anim === 'spread' && <div className="ig-spread-ring" />}
                    {g.anim === 'dwell'  && <div className="ig-dwell-ring" />}
                  </div>
                  <div className="intro-gesture-text">
                    <strong className="ig-label" style={{ color: g.color }}>{g.label}</strong>
                    <span className="ig-hint">{g.hint}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="intro-nav">
          <button className="intro-skip" onClick={dismiss}>Skip</button>
          <div className="intro-nav-right">
            {step > 0 && (
              <button className="intro-back" onClick={back}>← Back</button>
            )}
            <button className="intro-next" onClick={next}>
              {isLast ? 'Start Creating 🎨' : 'Next →'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
