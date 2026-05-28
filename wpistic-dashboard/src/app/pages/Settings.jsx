import { boot } from '../lib/boot.js';
import { PageWrap } from '../components/widgets.jsx';
import { Card, Btn, Badge, SectionLabel } from '../components/atoms.jsx';

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #F0F2FF' }}>
      <span style={{ fontSize: 13, color: '#6B7280' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0D0F1A' }}>{value || '—'}</span>
    </div>
  );
}

export default function Settings() {
  const u = boot.currentUser;
  const ws = boot.workspace;
  return (
    <PageWrap>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <Card>
          <SectionLabel>Profile</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #00C04B, #6C5CE7)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800, overflow: 'hidden' }}>
              {u.avatar ? <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.initials}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0D0F1A' }}>{u.name}</div>
              <div style={{ fontSize: 12.5, color: '#9499BA' }}>{u.email}</div>
            </div>
          </div>
          <Row label="Roles" value={(u.roles || []).join(', ')} />
        </Card>

        <Card>
          <SectionLabel>Workspace</SectionLabel>
          <Row label="Name" value={ws?.name} />
          <Row label="Plan" value={boot.plan?.name} />
          <Row label="Your role" value={ws?.role} />
          <Row label="Status" value={<Badge tone="green" dot>{ws?.plan_status || 'active'}</Badge>} />
        </Card>

        <Card>
          <SectionLabel>Security</SectionLabel>
          <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
            Password and two-factor authentication are managed in your account profile.
          </p>
          <Btn variant="border-card" size="sm" style={{ marginTop: 8 }} onClick={() => window.open(boot.homeUrl + 'wp-admin/profile.php', '_blank', 'noopener')}>
            Manage account
          </Btn>
        </Card>

        <Card>
          <SectionLabel>Session</SectionLabel>
          <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>Sign out of the WPistic dashboard.</p>
          <Btn variant="danger" size="sm" leftIcon="logout" style={{ marginTop: 8 }} onClick={() => { window.location.href = boot.logoutUrl; }}>
            Sign out
          </Btn>
        </Card>
      </div>
    </PageWrap>
  );
}
