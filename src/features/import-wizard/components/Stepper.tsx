import type { WizardStep } from '../useImportWizard';
import { Icon } from '../../../ui/primitives';

const STEPS: { key: Exclude<WizardStep, 'done'>; label: string; hint: string }[] = [
  { key: 'select', label: 'Select database', hint: 'Choose a trade journal' },
  { key: 'map', label: 'Map properties', hint: 'Match columns to fields' },
  { key: 'validate', label: 'Validate & preview', hint: 'Review before import' },
];

export function Stepper({ step }: { step: WizardStep }) {
  const current = step === 'done' ? STEPS.length : STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="stepper" aria-label="Import progress">
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s.key} className={`stepper__item stepper__item--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="stepper__index">{state === 'done' ? <Icon name="check" size={12} /> : `0${i + 1}`}</span>
            <span className="stepper__text">
              <span className="stepper__label">{s.label}</span>
              <span className="stepper__hint">{s.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
