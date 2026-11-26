import { useState, type RefObject } from 'react';
import { chartToPng, slugify } from './charts/exportChart';
import { Icon } from './primitives';

/**
 * "Copy image" / "Download PNG" for a chart, so it can be pasted into Notion
 * (or anywhere else). `target` wraps the chart; title/subtitle are drawn on the image.
 */
export function ChartExport({ target, title, subtitle }: { target: RefObject<HTMLElement | null>; title: string; subtitle?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const canCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

  const flash = (s: 'copied' | 'error') => {
    setState(s);
    window.setTimeout(() => setState('idle'), 1800);
  };
  const render = () => {
    if (!target.current) throw new Error('Chart not ready');
    return chartToPng(target.current, { title, subtitle });
  };

  const copy = async () => {
    try {
      // Safari needs the ClipboardItem created synchronously with a promise.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': render() })]);
      flash('copied');
    } catch {
      flash('error');
    }
  };
  const download = async () => {
    try {
      const blob = await render();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slugify([title, subtitle].filter(Boolean).join(' '))}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      flash('error');
    }
  };

  return (
    <div className="chart-export">
      {state !== 'idle' && (
        <span className={`chart-export__status ${state === 'error' ? 'num-loss' : ''}`} role="status">
          {state === 'copied' ? 'Copied — paste into Notion' : "Couldn't export"}
        </span>
      )}
      {canCopy && (
        <button className="icon-btn" onClick={() => void copy()} aria-label={`Copy ${title} as image`} title="Copy image">
          <Icon name={state === 'copied' ? 'check' : 'copy'} size={14} />
        </button>
      )}
      <button className="icon-btn" onClick={() => void download()} aria-label={`Download ${title} as PNG`} title="Download PNG">
        <Icon name="download" size={14} />
      </button>
    </div>
  );
}
