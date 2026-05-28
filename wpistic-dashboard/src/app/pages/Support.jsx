import { PageWrap } from '../components/widgets.jsx';
import { Card, Btn, SectionLabel } from '../components/atoms.jsx';
import { Icon } from '../components/Icon.jsx';
import { boot } from '../lib/boot.js';

const CHANNELS = [
  { icon: 'help', title: 'Knowledge base', desc: 'Guides, setup docs, and troubleshooting.', cta: 'Browse docs', href: 'docs' },
  { icon: 'inbox', title: 'Submit a ticket', desc: 'Get help from the WPistic support team.', cta: 'New ticket', href: 'contact' },
  { icon: 'calendar', title: 'Book a demo', desc: 'Walk through the platform with us.', cta: 'Book time', href: 'contact' },
];

export default function Support() {
  return (
    <PageWrap>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
        {CHANNELS.map((c) => (
          <Card key={c.title} hoverable>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F3F1FE', color: '#6C5CE7', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
              <Icon name={c.icon} size={20} />
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: '#0D0F1A' }}>{c.title}</div>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, margin: '8px 0 16px' }}>{c.desc}</p>
            <Btn variant="border-card" size="sm" rightIcon="arrow" style={{ width: '100%' }}
              onClick={() => { window.location.href = (boot.homeUrl || '/') + c.href; }}>
              {c.cta}
            </Btn>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 18 }}>
        <SectionLabel>Your open tickets</SectionLabel>
        <div style={{ padding: '28px 0', textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
          You have no open tickets. 🎉
        </div>
      </Card>
    </PageWrap>
  );
}
