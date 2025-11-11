'use client';

import { useEffect, useMemo, useState } from 'react';

const FRAME_INTERVAL = 80; // ms
const FALLBACK_FRAME = `*************************+;************************.;+*****************************.+*****************************+++++;.+++++*****************************************++***+*********************++*******+++++++++++++++++++.                        `;

export const AsciiAnimation = () => {
  const [frames, setFrames] = useState<string[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadFrames() {
      try {
        const response = await fetch('/frames.js');
        if (!response.ok) {
          console.warn('frames.js not found, falling back to static ASCII frame');
          if (!cancelled) {
            setFrames([FALLBACK_FRAME]);
          }
          return;
        }
        const source = await response.text();
        const parsed = parseFrames(source);
        if (!cancelled) {
          setFrames(parsed.length > 0 ? parsed : [FALLBACK_FRAME]);
          setFrameIndex(0);
        }
      } catch (error) {
        console.error('Unable to load frames.js', error);
        if (!cancelled) {
          setFrames([FALLBACK_FRAME]);
        }
      }
    }

    loadFrames();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (frames.length === 0) {
      return;
    }

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, FRAME_INTERVAL);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [frames]);

  const frame = useMemo(() => (frames.length > 0 ? frames[frameIndex] : ''), [frames, frameIndex]);

  if (!frame) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="ascii-gradient-mask" aria-hidden />
      <pre className="ascii-frame" aria-hidden>
        {frame}
      </pre>
    </div>
  );
};

function parseFrames(source: string): string[] {
  try {
    // Evaluate the frames.js file in an isolated function scope.
    // The file is expected to define `const frames = [...]`.
    const factory = new Function(`${source}; return typeof frames !== 'undefined' ? frames : [];`);
    const result = factory();
    if (Array.isArray(result)) {
      return result.map((entry) => String(entry));
    }
  } catch (error) {
    console.error('Failed to parse frames.js content', error);
  }
  return [];
}
