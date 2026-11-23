import { useId, useState, type FormEvent } from 'react';
import { useContent } from '../../content/index.ts';
import { effectiveFacets, suggestPlanName } from '../../state/plans.ts';
import { PLAN_NAME_LIMIT } from '../../state/progress.ts';
import { PlanPicker } from './PlanPicker.tsx';

export interface PlanDraft {
  name: string;
  facets: string[];
}

/**
 * A plan's name and what it covers. Used by first-run onboarding and by the plan editor.
 * Until you type a name of your own, the name follows the selection ("Frontend + Design").
 */
export function PlanForm({
  initial,
  submitLabel,
  onSubmit,
  children,
}: {
  initial?: PlanDraft;
  submitLabel: string;
  onSubmit: (draft: PlanDraft) => void;
  /** Extra buttons next to the submit button (cancel, delete). */
  children?: React.ReactNode;
}) {
  const { sections } = useContent();
  const id = useId();
  const [facets, setFacets] = useState<string[]>(() => (initial ? effectiveFacets(sections, initial.facets) : []));
  const [typedName, setTypedName] = useState<string | null>(initial ? initial.name : null);
  const name = typedName ?? suggestPlanName(facets);
  const clean = name.replace(/\s+/g, ' ').trim();

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (clean !== '') onSubmit({ name: clean, facets });
  };

  return (
    <form className="console-form plan-form" onSubmit={submit}>
      <label htmlFor={`${id}-name`}>
        Plan name
        <input
          id={`${id}-name`}
          value={name}
          maxLength={PLAN_NAME_LIMIT}
          onChange={(event) => setTypedName(event.target.value)}
          autoComplete="off"
        />
      </label>
      <PlanPicker sections={sections} selected={facets} onChange={setFacets} />
      <div className="button-row plan-actions">
        <button type="submit" className="btn btn-primary" disabled={clean === ''}>
          {submitLabel}
        </button>
        {children}
      </div>
    </form>
  );
}
