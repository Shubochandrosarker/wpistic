// Reusable presentational widgets shared across dashboard pages.

import { Card } from './atoms.jsx';
import { Icon } from './Icon.jsx';

export const PageWrap = ({ children, style = {} }) => (
  <div className="wpistic-page" style={{ maxWidth: 1280, margin: '0 auto', ...style }}>{children}</div>
);

export const StatCard = ({ label, value, delta, deltaTone, icon, iconBg = 'var(--app-accent-soft)', iconColor = '#6C5CE7' }) => (
  <Card padding={22} hoverable style={{ position: 'relative', overflow: 'hidden' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, color: iconColor, display: 'grid', placeItems: 'center' }}>
        <Icon name={icon} size={17} />
      </div>
      {delta != null && (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: deltaTone === 'down' ? '#EF4444' : '#00C04B', background: deltaTone === 'down' ? '#FEE2E2' : '#E8FAF0', padding: '3px 9px', borderRadius: 9999 }}>
          {deltaTone === 'down' ? '↓' : '↑'} {delta}
        </span>
      )}
    </div>
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--app-text-3)' }}>{label}</div>
    <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--app-text)', letterSpacing: '-0.025em', marginTop: 6, lineHeight: 1 }}>{value}</div>
  </Card>
);

// Lightweight table matching the table.wpt styling from the approved UI.
export const DataTable = ({ columns, rows, renderCell, empty }) => {
  if (!rows || rows.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--app-text-3)', fontSize: 13.5 }}>{empty || 'Nothing here yet.'}</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="wpistic-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.id ?? ri}>
              {columns.map((c) => <td key={c.key}>{renderCell ? renderCell(c.key, row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PRODUCT_GLYPHS = {
  'AI & Automation': { bg: '#E9E6FD', color: '#5649CC', icon: 'bot' },
  'Business Tools': { bg: '#E8FAF0', color: '#007C2F', icon: 'cube' },
  Analytics: { bg: '#DBEAFE', color: '#1E40AF', icon: 'chart' },
  'WordPress Plugins': { bg: '#FEF3C7', color: '#92400E', icon: 'cube' },
};

export const ProductGlyph = ({ category, size = 44 }) => {
  const g = PRODUCT_GLYPHS[category] || PRODUCT_GLYPHS['Business Tools'];
  return (
    <div style={{ width: size, height: size, borderRadius: 13, background: g.bg, color: g.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon name={g.icon} size={size * 0.5} />
    </div>
  );
};
