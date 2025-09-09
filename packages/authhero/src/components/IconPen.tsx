type Props = {
  width?: number;
  height?: number;
  className?: string;
};

const PenIcon = ({ width = 18, height = 18, className }: Props) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 640 640"
      className={className}
      fill="currentColor"
      role="img"
      focusable="false"
    >
      <path d="M416.9 85.2 372 130.1 509.9 268l44.9-44.9c13.6-13.5 21.2-31.9 21.2-51.1s-7.6-37.6-21.2-51.1l-35.7-35.7C505.6 71.6 487.2 64 468 64s-37.6 7.6-51.1 21.2M338.1 164 122.9 379.1c-10.7 10.7-18.5 24.1-22.6 38.7L64.9 545.6c-2.3 8.3 0 17.3 6.2 23.4s15.1 8.5 23.4 6.2l127.8-35.5c14.6-4.1 27.9-11.8 38.7-22.6l215-215.2z" />
    </svg>
  );
};
export default PenIcon;
