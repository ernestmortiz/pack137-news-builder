import { color, fontStack } from '../config/tokens';
import { packConfig } from '../config/pack.config';
import { mountConverter } from './converter';
import { el } from './dom';
import './styles.css';

type Screen = 'converter' | 'monthly';

const screens: Record<Screen, { tab: string; title: string }> = {
  converter: { tab: 'Weekly announcement', title: 'Announcement Converter' },
  monthly: { tab: 'Monthly letter', title: `${packConfig.monthlyTitle} editor` },
};
const order: Screen[] = ['converter', 'monthly'];

function applyTokens(root: HTMLElement): void {
  const vars: Record<string, string> = {
    '--navy': color.navy,
    '--navy-masthead': color.navyMasthead,
    '--gold': color.gold,
    '--gold-light': color.goldLight,
    '--gold-pale': color.goldPale,
    '--lavender': color.lavender,
    '--grey-page': color.greyPage,
    '--ink': color.ink,
    '--muted': color.muted,
    '--white': color.white,
    '--font': fontStack,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}

function mount(app: HTMLElement): void {
  const tabs = el('div', { className: 'tabs' });
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Choose a tool');

  const panels = {} as Record<Screen, HTMLElement>;
  const buttons = {} as Record<Screen, HTMLButtonElement>;

  const converter = el('div', { className: 'panel', id: 'panel-converter' }, [
    el('h2', { textContent: screens.converter.title }),
  ]);
  mountConverter(converter);
  panels.converter = converter;
  panels.monthly = el('div', { className: 'panel', id: 'panel-monthly' }, [
    el('h2', { textContent: screens.monthly.title }),
    el('p', {
      textContent:
        'Fill in the monthly letter template and copy the finished HTML. Coming in Phase 4.',
    }),
  ]);

  function select(key: Screen, focus = false): void {
    for (const k of order) {
      const on = k === key;
      buttons[k].setAttribute('aria-selected', String(on));
      buttons[k].tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    }
    if (focus) buttons[key].focus();
  }

  for (const key of order) {
    const tab = el('button', {
      className: 'tab',
      type: 'button',
      id: `tab-${key}`,
      textContent: screens[key].tab,
    });
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `panel-${key}`);
    tab.addEventListener('click', () => select(key));
    tab.addEventListener('keydown', (event) => {
      const at = order.indexOf(key);
      let next: Screen | undefined;
      if (event.key === 'ArrowRight') next = order[(at + 1) % order.length];
      else if (event.key === 'ArrowLeft') next = order[(at - 1 + order.length) % order.length];
      else if (event.key === 'Home') next = order[0];
      else if (event.key === 'End') next = order[order.length - 1];
      if (next !== undefined) {
        event.preventDefault();
        select(next, true);
      }
    });
    buttons[key] = tab;
    tabs.append(tab);
    panels[key].setAttribute('role', 'tabpanel');
    panels[key].setAttribute('aria-labelledby', `tab-${key}`);
  }

  app.replaceChildren(
    el('div', { className: 'shell' }, [
      el('header', { className: 'masthead' }, [
        el('small', { textContent: packConfig.eyebrow }),
        el('h1', { textContent: 'Pack 137 News Builder' }),
      ]),
      tabs,
      el('main', {}, [panels.converter, panels.monthly]),
      el('footer', {
        textContent: `Version ${__APP_VERSION__}. Nothing you paste leaves this device.`,
      }),
    ]),
  );
  select('converter');
}

const app = document.getElementById('app');
if (app) {
  applyTokens(document.documentElement);
  mount(app);
}
