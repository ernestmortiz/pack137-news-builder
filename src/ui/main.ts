import { color, fontStack } from '../config/tokens';
import { packConfig } from '../config/pack.config';
import './styles.css';

type Screen = 'converter' | 'monthly';

const screens: Record<Screen, { tab: string; title: string; body: string }> = {
  converter: {
    tab: 'Weekly announcement',
    title: 'Announcement Converter',
    body: 'Paste the old HTML from TroopTrack and get back HTML in the pack style. Coming in Phase 3.',
  },
  monthly: {
    tab: 'Monthly letter',
    title: `${packConfig.monthlyTitle} editor`,
    body: 'Fill in the monthly letter template and copy the finished HTML. Coming in Phase 4.',
  },
};

function applyTokens(root: HTMLElement): void {
  const vars: Record<string, string> = {
    '--navy': color.navy,
    '--navy-masthead': color.navyMasthead,
    '--gold': color.gold,
    '--gold-light': color.goldLight,
    '--lavender': color.lavender,
    '--grey-page': color.greyPage,
    '--ink': color.ink,
    '--muted': color.muted,
    '--white': color.white,
    '--font': fontStack,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function render(app: HTMLElement, current: Screen): void {
  const tabs = el('div', { className: 'tabs' });
  tabs.setAttribute('role', 'tablist');
  for (const key of Object.keys(screens) as Screen[]) {
    const tab = el('button', { className: 'tab', type: 'button', textContent: screens[key].tab });
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(key === current));
    tab.addEventListener('click', () => render(app, key));
    tabs.append(tab);
  }
  const screen = screens[current];
  app.replaceChildren(
    el('div', { className: 'shell' }, [
      el('header', { className: 'masthead' }, [
        el('small', { textContent: packConfig.eyebrow }),
        el('h1', { textContent: 'Pack 137 News Builder' }),
      ]),
      tabs,
      el('main', { className: 'panel' }, [
        el('h2', { textContent: screen.title }),
        el('p', { textContent: screen.body }),
      ]),
      el('footer', {
        textContent: `Version ${__APP_VERSION__}. Nothing you paste leaves this device.`,
      }),
    ]),
  );
}

const app = document.getElementById('app');
if (app) {
  applyTokens(document.documentElement);
  render(app, 'converter');
}
