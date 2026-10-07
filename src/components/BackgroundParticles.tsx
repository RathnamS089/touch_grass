import React, { useEffect, useRef, useState } from "react";

interface BackgroundParticlesProps {
  particleCount?: number;
}

export function BackgroundParticles({ particleCount = 50 }: BackgroundParticlesProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; opacity: number }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const createParticles = () => {
      const newParticles: Array<{ id: number; x: number; y: number; size: number; opacity: number }> = [];
      for (let i = 0; i < particleCount; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: Math.random() * 2 + 1, // 1-3px
          opacity: Math.random() * 0.3 + 0.1, // 0.1-0.4
        });
      }
      setParticles(newParticles);
    };

    createParticles();

    // Handle resize
    const handleResize = () => {
      createParticles();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [particleCount]);

  return (
    <div className="background-particles" ref={containerRef} aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: `rgba(76, 175, 80, ${p.opacity})`,
          }}
        />
      ))}
    </div>
  );
}