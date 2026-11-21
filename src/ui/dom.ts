/** Tiny DOM helpers. Text always goes in through textContent or .value, never innerHTML. */

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

export function svgEl(
  tag: string,
  attrs: Record<string, string> = {},
  children: SVGElement[] = [],
): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

let counter = 0;
/** A fresh id for pairing a label with its control. */
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

/** Calls `fn` once, `ms` after the last call. */
export function debounce(
  fn: () => void,
  ms: number,
): { run(): void; flush(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    run() {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn();
      }, ms);
    },
    flush() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        fn();
      }
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
