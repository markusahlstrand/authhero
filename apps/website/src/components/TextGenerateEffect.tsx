import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface TextGenerateEffectProps {
  words: string;
  className?: string;
}

const TextGenerateEffect = ({ words, className = "" }: TextGenerateEffectProps) => {
  const prefersReduced = useReducedMotion();
  const wordArray = words.split(" ");

  if (prefersReduced) {
    return <span className={className}>{words}</span>;
  }

  return (
    <span className={className}>
      {wordArray.map((word, idx) => (
        <motion.span
          key={idx}
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.4, delay: idx * 0.08 }}
          className="inline-block mr-[0.25em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
};

export default TextGenerateEffect;
