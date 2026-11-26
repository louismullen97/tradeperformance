/**
 * Turns a rendered chart (SVG plus its HTML legend and end labels) into a PNG.
 * No dependencies: the SVG is cloned with its computed styles inlined, the
 * legend/labels are redrawn as SVG text, and the result is rasterised on a canvas.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const STYLE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'font-variant-numeric', 'letter-spacing',
] as const;

export interface ChartImageOptions {
  title?: string;
  subtitle?: string;
  /** Pixel density of the output (2 = retina). */
  scale?: number;
}

const css = (el: Element, prop: string) => getComputedStyle(el).getPropertyValue(prop);

function inlineStyles(source: Element, target: Element) {
  const style = getComputedStyle(source);
  const decl = STYLE_PROPS.map((p) => `${p}:${style.getPropertyValue(p)}`).join(';');
  target.setAttribute('style', decl);
  target.removeAttribute('class');
  // Presentation attributes may hold unresolved CSS variables (e.g. stroke="var(--chart-1)").
  for (const attr of ['fill', 'stroke']) {
    if (target.getAttribute(attr)?.includes('var(')) target.setAttribute(attr, style.getPropertyValue(attr));
  }
  for (let i = 0; i < source.children.length; i++) inlineStyles(source.children[i], target.children[i]);
}

function text(x: number, y: number, value: string, attrs: Record<string, string | number>) {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  for (const [k, v] of Object.entries(attrs)) t.setAttribute(k, String(v));
  t.textContent = value;
  return t;
}

/** Builds a standalone SVG string of the chart inside `container`. */
export function chartToSvg(container: HTMLElement, opts: ChartImageOptions = {}): { svg: string; width: number; height: number } {
  const chart = container.querySelector<SVGSVGElement>('svg[role="img"]') ?? container.querySelector('svg');
  if (!chart) throw new Error('No chart found to export.');
  const box = container.getBoundingClientRect();
  const font = css(document.body, 'font-family') || 'Inter, system-ui, sans-serif';
  const text1 = css(document.documentElement, '--text-1').trim() || '#18181b';
  const text2 = css(document.documentElement, '--text-2').trim() || '#52525b';
  const bg = css(document.documentElement, '--surface').trim() || '#ffffff';

  const pad = 24;
  const header = (opts.title ? 26 : 0) + (opts.subtitle ? 20 : 0) + (opts.title || opts.subtitle ? 12 : 0);
  const width = Math.round(box.width) + pad * 2;
  const height = Math.round(box.height) + pad * 2 + header;

  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.setAttribute('font-family', font);

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('fill', bg);
  root.appendChild(rect);

  let y = pad;
  if (opts.title) {
    root.appendChild(text(pad, y + 16, opts.title, { 'font-size': 16, 'font-weight': 600, fill: text1 }));
    y += 26;
  }
  if (opts.subtitle) {
    root.appendChild(text(pad, y + 13, opts.subtitle, { 'font-size': 13, fill: text2 }));
    y += 20;
  }
  if (header) y += 12;

  const body = document.createElementNS(SVG_NS, 'g');
  body.setAttribute('transform', `translate(${pad},${y})`);
  root.appendChild(body);
  const rel = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
  };

  // Legend entries and end labels are HTML; redraw them as SVG.
  container.querySelectorAll('.legend--chart > span').forEach((item) => {
    const swatch = item.querySelector('i');
    const p = rel(item);
    if (swatch) {
      const s = rel(swatch);
      const line = document.createElementNS(SVG_NS, 'rect');
      line.setAttribute('x', String(s.x));
      line.setAttribute('y', String(s.y));
      line.setAttribute('width', String(s.w));
      line.setAttribute('height', String(Math.max(2, s.h)));
      line.setAttribute('fill', css(swatch, 'background-color'));
      body.appendChild(line);
    }
    const label = item.textContent ?? '';
    const tx = swatch ? rel(swatch).x + rel(swatch).w + 6 : p.x;
    body.appendChild(text(tx, p.y + p.h / 2, label, { 'font-size': css(item, 'font-size'), fill: css(item, 'color'), 'dominant-baseline': 'middle' }));
  });
  container.querySelectorAll<HTMLElement>('.equity__endlabel').forEach((label) => {
    const p = rel(label);
    body.appendChild(
      text(p.x, p.y + p.h / 2, label.textContent ?? '', {
        'font-size': css(label, 'font-size'),
        'font-weight': css(label, 'font-weight'),
        fill: css(label, 'color'),
        'dominant-baseline': 'middle',
      }),
    );
  });

  const clone = chart.cloneNode(true) as SVGSVGElement;
  inlineStyles(chart, clone);
  const c = rel(chart);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${c.x},${c.y})`);
  for (const child of [...clone.childNodes]) g.appendChild(child);
  body.insertBefore(g, body.firstChild);

  return { svg: new XMLSerializer().serializeToString(root), width, height };
}

/** Rasterises the chart to a PNG blob. */
export async function chartToPng(container: HTMLElement, opts: ChartImageOptions = {}): Promise<Blob> {
  const { svg, width, height } = chartToSvg(container, opts);
  const scale = opts.scale ?? 2;
  const img = new Image();
  img.decoding = 'sync';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the chart image.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode PNG.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'chart';
