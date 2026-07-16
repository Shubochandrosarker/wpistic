const PATHS: Record<string, string> = {
  chat: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z",
  users:
    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  calendar:
    "M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18",
  chart: "M3 3v18h18M7 14l4-4 4 4 5-5",
  bot: "M12 2v3M6 7h12a3 3 0 013 3v9a3 3 0 01-3 3H6a3 3 0 01-3-3v-9a3 3 0 013-3zM9 13h.01M15 13h.01M9 17h6",
  sparkle: "M12 3l1.9 5.6L19 10l-5.1 1.4L12 17l-1.9-5.6L5 10l5.1-1.4L12 3z",
  crm: "M20 21v-2a4 4 0 00-3-3.87M4 21v-2a4 4 0 013-3.87M14.5 7.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM9 21a4 4 0 018 0",
  key: "M15 7a4 4 0 11-3.9 4.95L8 14H6v2H4v2H2v-2l5.05-5.05A4 4 0 1115 7zm.5-1.5h.01",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  compass:
    "M12 22a10 10 0 100-20 10 10 0 000 20zM16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z",
  "check-shield": "M9 12l2 2 4-4M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  cube: "M21 7.5l-9-5-9 5m18 0l-9 5m9-5v9l-9 5m0-9L3 7.5m9 5v9m0-9V21M3 7.5v9l9 5",
  globe:
    "M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9 9 4 9 9zM3 12h18M12 3a14 14 0 010 18m0-18a14 14 0 000 18",
  arrow: "M5 12h14M13 5l7 7-7 7",
  "arrow-up-right": "M7 17L17 7M7 7h10v10",
  check: "M5 12l5 5L20 7",
  x: "M18 6L6 18M6 6l12 12",
  menu: "M3 12h18M3 6h18M3 18h18",
  quote: "M9 7H5a2 2 0 00-2 2v4a2 2 0 002 2h2v2a4 4 0 01-4 4M19 7h-4a2 2 0 00-2 2v4a2 2 0 002 2h2v2a4 4 0 01-4 4",
  star: "M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z",
  play: "M6 4l14 8-14 8V4z",
  code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
  download: "M12 4v12m0 0l-4-4m4 4l4-4M4 18h16v3H4z",
  card: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 4h18",
  mail: "M4 4h16v16H4V4zm0 0l8 8 8-8",
  layers: "M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5",
  zap: "M13 2L3 14h7l-1 8L19 10h-7l1-8z",
  search: "M21 21l-4.35-4.35M11 17a6 6 0 100-12 6 6 0 000 12z",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  building: "M3 21h18M6 21V7l6-4 6 4v14M9 9h1M9 13h1M14 9h1M14 13h1M9 21v-4h6v4",
  handshake:
    "M11 17l-1.5-1.5a2.12 2.12 0 010-3l3-3a2.12 2.12 0 013 0L17 11m-9 6l1.59 1.59a2 2 0 002.82 0L14 16m-9-4l3-3 3 3-3 3-3-3z",
  map: "M9 20l-5.5 2V6.5L9 4.5l6 2 5.5-2V17.5L15 19.5l-6-2z M9 4.5v15.5M15 6.5v13",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  server: "M4 4h16v6H4V4zm0 10h16v6H4v-6zM8 7h.01M8 17h.01",
  lock: "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4",
  refresh: "M21 12a9 9 0 11-3.3-6.95M21 3v6h-6",
  heart: "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z",
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  className = "",
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const d = PATHS[name] ?? PATHS.cube;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
