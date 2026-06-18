const GridBackground = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-0 grid-dot-bg opacity-[0.4]"
        aria-hidden="true"
      />
      <div className="relative">{children}</div>
    </div>
  );
};

export default GridBackground;
