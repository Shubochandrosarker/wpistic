import { PageWrap } from '../components/widgets.jsx';
import { EmptyState } from '../components/states.jsx';
import { Btn } from '../components/atoms.jsx';
import { boot, moduleEnabled } from '../lib/boot.js';

// Generic page for modules that depend on a sibling plugin being active.
// Shows a clear "not enabled" state with an upgrade/learn-more path when the
// backing module isn't available, instead of a broken screen.
export default function ModulePage({ module, icon, title, description, learnMore }) {
  const enabled = module ? moduleEnabled(module) : true;

  if (!enabled) {
    return (
      <PageWrap>
        <EmptyState
          icon={icon}
          title={`${title} isn’t enabled yet`}
          message={description}
          action={
            <Btn variant="green" rightIcon="arrow" onClick={() => { window.location.href = (boot.homeUrl || '/') + (learnMore || 'pricing'); }}>
              Learn more
            </Btn>
          }
        />
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <EmptyState
        icon={icon}
        title={title}
        message={`${description} This area is connected and ready — data will appear here as you use ${title.toLowerCase()}.`}
      />
    </PageWrap>
  );
}
