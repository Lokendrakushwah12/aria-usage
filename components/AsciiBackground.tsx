"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

// ASCII character sets
const ASCII_SETS = {
  detailed: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  standard: "@%#*+=-:. ",
  blocks: "█▓▒░ ",
  binary: "01",
  hex: "0123456789ABCDEF",
};

type AsciiCharSet = keyof typeof ASCII_SETS;

interface AsciiBackgroundProps {
  cursor?: boolean;
  image: string;
  color1?: string;
  color2?: string;
  threshold?: number;
  glow?: boolean;
  glowSize?: number;
  glowOpacity?: number;
  static?: boolean;
  animationInterval?: number;
  width?: number;
  asciiSet?: AsciiCharSet;
  invert?: boolean;
  brightness?: number;
  contrast?: number;
  blur?: number;
  cursorRadius?: number;
  cursorSmoothness?: number;
  cursorIntensity?: number;
  className?: string;
}

export function AsciiBackground({
  cursor = true,
  image,
  color1 = "#fff",
  color2 = "#78BBFF",
  threshold = 0.26,
  glow = true,
  glowSize = 12,
  glowOpacity = 1,
  static: isStatic = false,
  animationInterval = 0.15,
  width = 160,
  asciiSet = "detailed",
  invert = true,
  brightness = 40,
  contrast = -50,
  blur = 0,
  cursorRadius = 45,
  cursorSmoothness = 40,
  cursorIntensity = 40,
  className = "",
}: AsciiBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const animationFrameRef = useRef<number>(0);
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
  const [asciiData, setAsciiData] = useState<{
    chars: string[][];
    brightnesses: number[][];
  }>({ chars: [], brightnesses: [] });
  const [resolvedColors, setResolvedColors] = useState<{
    color1: { r: number; g: number; b: number };
    color2: { r: number; g: number; b: number };
  }>({
    color1: { r: 0, g: 0, b: 0 },
    color2: { r: 0, g: 0, b: 0 },
  });

  const chars = ASCII_SETS[asciiSet];

  // Resolve colors from CSS variables/HSL/OKLCH on mount and when they change
  useEffect(() => {
    if (typeof window === "undefined") return;

    const resolveColor = (colorInput: string): { r: number; g: number; b: number } => {
      // Create a temporary element to get computed color
      const tempEl = document.createElement("div");
      tempEl.style.color = colorInput;
      document.body.appendChild(tempEl);
      
      const computedColor = getComputedStyle(tempEl).color;
      document.body.removeChild(tempEl);

      // Parse rgb/rgba format
      const rgbMatch = computedColor.match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)/);
      if (rgbMatch) {
        return {
          r: parseInt(rgbMatch[1], 10),
          g: parseInt(rgbMatch[2], 10),
          b: parseInt(rgbMatch[3], 10),
        };
      }

      // Parse lab format and convert to RGB
      const labMatch = computedColor.match(/lab\(([\d.]+)\s+([-\d.]+)\s+([-\d.]+)\)/);
      if (labMatch) {
        const L = parseFloat(labMatch[1]);
        const a = parseFloat(labMatch[2]);
        const b = parseFloat(labMatch[3]);
        
        // Convert LAB to XYZ
        let y = (L + 16) / 116;
        let x = a / 500 + y;
        let z = y - b / 200;
        
        const lab_to_xyz = (t: number) => {
          return t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787;
        };
        
        x = 95.047 * lab_to_xyz(x);
        y = 100.000 * lab_to_xyz(y);
        z = 108.883 * lab_to_xyz(z);
        
        // Convert XYZ to RGB
        x = x / 100;
        y = y / 100;
        z = z / 100;
        
        let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
        let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
        let bl = x * 0.0557 + y * -0.2040 + z * 1.0570;
        
        const xyz_to_rgb = (t: number) => {
          return t > 0.0031308 ? 1.055 * Math.pow(t, 1 / 2.4) - 0.055 : 12.92 * t;
        };
        
        r = Math.max(0, Math.min(1, xyz_to_rgb(r)));
        g = Math.max(0, Math.min(1, xyz_to_rgb(g)));
        bl = Math.max(0, Math.min(1, xyz_to_rgb(bl)));
        
        return {
          r: Math.round(r * 255),
          g: Math.round(g * 255),
          b: Math.round(bl * 255),
        };
      }

      // Fallback: try hex format
      const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(computedColor);
      if (hexMatch) {
        return {
          r: parseInt(hexMatch[1], 16),
          g: parseInt(hexMatch[2], 16),
          b: parseInt(hexMatch[3], 16),
        };
      }

      return { r: 0, g: 0, b: 0 };
    };

    const updateColors = () => {
      setResolvedColors({
        color1: resolveColor(color1),
        color2: resolveColor(color2),
      });
    };

    // Initial color resolution
    updateColors();

    // Watch for theme changes (class changes on html/body element)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "class") {
          updateColors();
          break;
        }
      }
    });

    // Observe both html and body for class changes
    observer.observe(document.documentElement, { attributes: true });
    if (document.body) {
      observer.observe(document.body, { attributes: true });
    }

    return () => {
      observer.disconnect();
    };
  }, [color1, color2]);

  // Handle mouse movement
  useEffect(() => {
    if (!cursor) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    const handleMouseLeave = () => {
      setMousePos({ x: -1000, y: -1000 });
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, [cursor]);

  // Process image to ASCII
  useEffect(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const processImage = () => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      // Calculate dimensions based on width prop
      const charWidth = 8;
      const charHeight = 16;
      const cols = width;
      const aspectRatio = img.naturalHeight / img.naturalWidth;
      const rows = Math.floor(cols * aspectRatio * (charWidth / charHeight));

      canvas.width = cols;
      canvas.height = rows;

      // Apply blur filter only
      ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
      ctx.drawImage(img, 0, 0, cols, rows);

      const imageData = ctx.getImageData(0, 0, cols, rows);
      const pixels = imageData.data;

      const newChars: string[][] = [];
      const newBrightnesses: number[][] = [];

      // Apply brightness and contrast manually to each pixel
      const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      const brightnessFactor = brightness / 100;

      for (let y = 0; y < rows; y++) {
        const row: string[] = [];
        const brightnessRow: number[] = [];

        for (let x = 0; x < cols; x++) {
          const idx = (y * cols + x) * 4;
          let r = pixels[idx];
          let g = pixels[idx + 1];
          let b = pixels[idx + 2];

          // Apply contrast
          r = contrastFactor * (r - 128) + 128;
          g = contrastFactor * (g - 128) + 128;
          b = contrastFactor * (b - 128) + 128;

          // Apply brightness
          r = r + brightnessFactor * 255;
          g = g + brightnessFactor * 255;
          b = b + brightnessFactor * 255;

          // Clamp values
          r = Math.max(0, Math.min(255, r));
          g = Math.max(0, Math.min(255, g));
          b = Math.max(0, Math.min(255, b));

          // Calculate brightness (0-1)
          let pixelBrightness = (r + g + b) / (3 * 255);

          // Apply invert
          if (invert) {
            pixelBrightness = 1 - pixelBrightness;
          }

          brightnessRow.push(pixelBrightness);

          // Map brightness to ASCII character
          const charIndex = Math.floor(pixelBrightness * (chars.length - 1));
          row.push(chars[charIndex]);
        }

        newChars.push(row);
        newBrightnesses.push(brightnessRow);
      }

      setAsciiData({ chars: newChars, brightnesses: newBrightnesses });
    };

    img.onload = processImage;
    if (img.complete) processImage();
  }, [image, width, brightness, contrast, blur, invert, chars]);

  // Animation loop for non-static mode
  useEffect(() => {
    if (isStatic || asciiData.chars.length === 0) return;

    const intervalMs = animationInterval * 1000;
    let lastTime = 0;

    const animate = (currentTime: number) => {
      if (currentTime - lastTime >= intervalMs) {
        setAsciiData((prev) => {
          const newChars = prev.chars.map((row, y) =>
            row.map((_, x) => {
              const brightness = prev.brightnesses[y][x];
              const baseIndex = Math.floor(brightness * (chars.length - 1));
              // Add some randomness around the base character
              const variation = Math.floor(Math.random() * 3) - 1;
              const charIndex = Math.max(
                0,
                Math.min(chars.length - 1, baseIndex + variation)
              );
              return chars[charIndex];
            })
          );
          return { ...prev, chars: newChars };
        });
        lastTime = currentTime;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isStatic, animationInterval, chars, asciiData.brightnesses]);

  // Calculate color for each character
  const getCharColor = (x: number, y: number, brightness: number) => {
    // Base color interpolation using resolved colors
    const color1Rgb = resolvedColors.color1;
    const color2Rgb = resolvedColors.color2;

    let r = color2Rgb.r + (color1Rgb.r - color2Rgb.r) * brightness;
    let g = color2Rgb.g + (color1Rgb.g - color2Rgb.g) * brightness;
    let b = color2Rgb.b + (color1Rgb.b - color2Rgb.b) * brightness;

    // Apply cursor effect
    if (cursor) {
      const charWidth = 8;
      const charHeight = 16;
      const charX = x * charWidth;
      const charY = y * charHeight;

      const dx = mousePos.x - charX;
      const dy = mousePos.y - charY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < cursorRadius) {
        const influence = Math.pow(
          1 - distance / cursorRadius,
          cursorSmoothness / 10
        );
        const boost = influence * (cursorIntensity / 100);

        r = Math.min(255, r + (255 - r) * boost);
        g = Math.min(255, g + (255 - g) * boost);
        b = Math.min(255, b + (255 - b) * boost);
      }
    }

    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  };

  return (
    <div
      ref={containerRef}
      className={cn("pointer-events-none fixed inset-0 z-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="hidden" />
      <img
        ref={imageRef}
        src={image}
        alt=""
        className="hidden"
        crossOrigin="anonymous"
      />

      <div
        className="font-mono whitespace-pre leading-none select-none"
        style={{
          fontSize: "8px",
          lineHeight: "16px",
          textShadow: glow
            ? `0 0 ${glowSize}px currentColor`
            : "none",
          opacity: glow ? glowOpacity : 1,
        }}
      >
        {asciiData.chars.map((row, y) => (
          <div key={y} className="flex scale-y-[-1]">
            {row.map((char, x) => (
              <span
                key={`${x}-${y}`}
                style={{
                  color: getCharColor(
                    x,
                    y,
                    asciiData.brightnesses[y]?.[x] || 0
                  ),
                  width: "8px",
                  height: "16px",
                  display: "inline-block",
                }}
              >
                {char}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

