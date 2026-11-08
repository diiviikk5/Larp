import { useEffect, useRef } from 'react';
import './ocean.css';
import { Ocean } from './engine';

/** Decorative ASCII sea; the regular workspace owns all controls and input. */
export function OceanBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ocean = new Ocean(ref.current!);
    return () => ocean.dispose();
  }, []);
  return (
    <div className="ocean-sea" aria-hidden="true">
      <div className="ocean-rays" />
      <canvas ref={ref} className="ocean-canvas" />
      <div className="ocean-glow" />
    </div>
  );
}
