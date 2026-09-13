const paths = {
  open: "M3 6.5A1.5 1.5 0 0 1 4.5 5h3.4l1.6 1.6h6A1.5 1.5 0 0 1 17 8.1V14.5A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5z",
  plus: "M10 5v10M5 10h10",
  minus: "M5 10h10",
  "chevron-up": "M6 12l4-4 4 4",
  "chevron-down": "M6 8l4 4 4-4",
  lock: "M6.5 9V7a3.5 3.5 0 0 1 7 0v2M5.5 9h9v7h-9z",
  doc: "M6 3.5h5l3.5 3.5v9.5h-8.5zM11 3.5V7h3.5",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={paths[name]} />
    </svg>
  );
}
