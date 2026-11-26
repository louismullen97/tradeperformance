import { Icon } from './primitives';

/** Compact labelled select used in filter bars. Empty value = "All". */
export function FilterSelect({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <label className={`filter ${value ? 'is-set' : ''}`}>
      <span className="filter__label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={12} />
    </label>
  );
}
