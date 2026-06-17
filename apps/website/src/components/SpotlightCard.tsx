import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
}

const SpotlightCard = ({ children, className = "" }: SpotlightCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const prefersReduced = useReducedMotion();

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current || prefersReduced) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden hairline bg-background p-6 rounded-lg ${className}`}
    >
      {isHovered && !prefersReduced && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(300px circle at ${position.x}px ${position.y}px, hsl(var(--accent) / 0.06), transparent 60%)`,
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default SpotlightCard;
