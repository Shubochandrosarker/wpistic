// Icon system ported from the approved UI (atoms.jsx).

const ICONS = {
  dashboard: 'M3 13h7V3H3v10zm0 8h7v-6H3v6zm11 0h7V11h-7v10zm0-18v6h7V3h-7z',
  cube: 'M21 7.5l-9-5-9 5m18 0l-9 5m9-5v9l-9 5m0-9L3 7.5m9 5v9m0-9V21M3 7.5v9l9 5',
  key: 'M15 7a4 4 0 11-3.9 4.95L8 14H6v2H4v2H2v-2l5.05-5.05A4 4 0 1115 7zm.5-1.5h.01',
  download: 'M12 4v12m0 0l-4-4m4 4l4-4M4 18h16v3H4z',
  globe: 'M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9 9 4 9 9zM3 12h18M12 3a14 14 0 010 18m0-18a14 14 0 000 18',
  bot: 'M12 2v3M6 7h12a3 3 0 013 3v9a3 3 0 01-3 3H6a3 3 0 01-3-3v-9a3 3 0 013-3zM9 13h.01M15 13h.01M9 17h6',
  zap: 'M13 2L3 14h7l-1 8L19 10h-7l1-8z',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z',
  chart: 'M3 3v18h18M7 14l4-4 4 4 5-5',
  card: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 4h18',
  help: 'M9 9a3 3 0 116 0c0 2-3 2-3 4M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  cog: 'M12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7zm7.4-3.5a7.4 7.4 0 00-.1-1.3l2-1.5-2-3.4-2.3.9a7.5 7.5 0 00-2.2-1.3L14.4 2h-4l-.4 2.4a7.5 7.5 0 00-2.2 1.3l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 000 2.6l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 002.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 002.2-1.3l2.3.9 2-3.4-2-1.5c.07-.43.1-.86.1-1.3z',
  search: 'M21 21l-4.35-4.35M11 17a6 6 0 100-12 6 6 0 000 12z',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  plus: 'M12 5v14m-7-7h14',
  arrow: 'M5 12h14M13 5l7 7-7 7',
  check: 'M5 12l5 5L20 7',
  warn: 'M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01',
  copy: 'M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1',
  dots: 'M12 13a1 1 0 100-2 1 1 0 000 2zm0-7a1 1 0 100-2 1 1 0 000 2zm0 14a1 1 0 100-2 1 1 0 000 2z',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  refresh: 'M21 12a9 9 0 11-3.3-6.95M21 3v6h-6',
  external: 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3',
  spark: 'M12 3l1.9 5.6L19 10l-5.1 1.4L12 17l-1.9-5.6L5 10l5.1-1.4L12 3z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  x: 'M18 6L6 18M6 6l12 12',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  calendar: 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  menu: 'M3 12h18M3 6h18M3 18h18',
};

export const Icon = ({ name, size = 18, color, style, strokeWidth = 1.75 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color || 'currentColor'}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    aria-hidden="true"
  >
    <path d={ICONS[name] || ICONS.cube} />
  </svg>
);

export default Icon;
