import { FACET_GROUPS } from '../content/facets.ts';

/**
 * Multi-select chips for choosing facets (a topic's facets, or the facets of a
 * suggestion). Every facet is selectable here, unlike the overview filter,
 * which only enables facets that already have content.
 */
export function FacetPicker({
  value,
  onChange,
  max = 12,
  label = 'Topics',
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  max?: number;
  label?: string;
}) {
  const toggle = (id: string): void => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < max) onChange([...value, id]);
  };
  return (
    <fieldset className="facet-picker">
      <legend>{label}</legend>
      {FACET_GROUPS.map((group) => (
        <div key={group.id} className="facet-picker-row">
          <span className="facet-picker-label">{group.label}</span>
          <span className="facet-picker-chips">
            {group.facets.map((facet) => {
              const on = value.includes(facet.id);
              return (
                <button
                  key={facet.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  disabled={!on && value.length >= max}
                  onClick={() => toggle(facet.id)}
                >
                  {facet.label}
                </button>
              );
            })}
          </span>
        </div>
      ))}
    </fieldset>
  );
}
