import { TOPIC_GROUPS } from '../content/topics.ts';

/**
 * Multi-select chips for choosing topics (a round's topics, or the topics of a
 * suggestion). Every topic is selectable here, unlike the overview filter,
 * which only enables topics that already have content.
 */
export function TopicPicker({
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
    <fieldset className="topic-picker">
      <legend>{label}</legend>
      {TOPIC_GROUPS.map((group) => (
        <div key={group.id} className="topic-picker-row">
          <span className="topic-picker-label">{group.label}</span>
          <span className="topic-picker-chips">
            {group.topics.map((topic) => {
              const on = value.includes(topic.id);
              return (
                <button
                  key={topic.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  disabled={!on && value.length >= max}
                  onClick={() => toggle(topic.id)}
                >
                  {topic.label}
                </button>
              );
            })}
          </span>
        </div>
      ))}
    </fieldset>
  );
}
