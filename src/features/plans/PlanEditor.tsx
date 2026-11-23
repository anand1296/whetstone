import { useState } from 'react';
import { Dialog } from '../../components/primitives.tsx';
import { Icon } from '../../components/Icon.tsx';
import { createStore } from '../../state/createStore.ts';
import { newPlanId } from '../../state/plans.ts';
import { updatePrefs } from '../../state/prefs.ts';
import { MAX_LIVE_PLANS } from '../../state/progress.ts';
import { progressActions, progressStore } from '../../state/progressStore.ts';
import { navigate, routeStore } from '../../state/route.ts';
import { useStore } from '../../state/useStore.ts';
import { PlanForm, type PlanDraft } from './PlanForm.tsx';

/** Which plan the editor dialog is open on: an id to edit one, 'new' to make one, null when closed. */
const editorStore = createStore<string | null>(null);

export function openPlanEditor(planId: string | null): void {
  editorStore.setState(() => planId ?? 'new');
}

function closeEditor(): void {
  editorStore.setState(() => null);
}

/** Create, rename, re-scope or delete a plan. Mounted once in the app shell; open it with openPlanEditor. */
export function PlanEditorDialog() {
  const target = useStore(editorStore, (s) => s);
  const plans = useStore(progressStore, (s) => s.plans);
  const liveCount = Object.values(plans).filter((plan) => !plan.deleted).length;
  const editing = target && target !== 'new' ? plans[target] : undefined;
  const open = target !== null;
  const creating = target === 'new';
  const atLimit = creating && liveCount >= MAX_LIVE_PLANS;

  const save = (draft: PlanDraft): void => {
    const id = editing && !editing.deleted ? editing.id : newPlanId();
    if (!progressActions.savePlan({ id, ...draft })) return;
    updatePrefs({ activePlanId: id });
    closeEditor();
    if (creating) navigate({ name: 'plan', planId: id });
  };

  return (
    <Dialog open={open} onClose={closeEditor} label={creating ? 'New plan' : 'Edit plan'} className="dialog dialog-plan">
      <div className="dialog-body">
        <div className="dialog-head">
          <h2>{creating ? 'New plan' : 'Edit plan'}</h2>
          <button type="button" className="icon-btn" onClick={closeEditor} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {atLimit ? (
          <p className="admin-note">
            You have {MAX_LIVE_PLANS} plans, which is the most we keep. Delete one you no longer need to make another.
          </p>
        ) : (
          <>
            <p className="admin-note">
              A plan is the set of topics you want to get through. Its progress, &ldquo;up next&rdquo; and review follow only these topics. A
              question you finish counts in every plan that includes it.
            </p>
            {/* Remount per target so the form starts from that plan, not the last one. */}
            <PlanForm
              key={target ?? 'closed'}
              initial={editing && !editing.deleted ? { name: editing.name, facets: editing.facets } : undefined}
              submitLabel={creating ? 'Create plan' : 'Save changes'}
              onSubmit={save}
            >
              <button type="button" className="btn btn-quiet" onClick={closeEditor}>
                Cancel
              </button>
              {editing && !editing.deleted ? <DeletePlan id={editing.id} name={editing.name} /> : null}
            </PlanForm>
          </>
        )}
      </div>
    </Dialog>
  );
}

function DeletePlan({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const route = useStore(routeStore, (r) => r);
  if (!confirming) {
    return (
      <button type="button" className="btn btn-quiet btn-danger plan-delete" onClick={() => setConfirming(true)}>
        Delete plan
      </button>
    );
  }
  return (
    <span className="plan-delete plan-delete-confirm" role="group" aria-label={`Delete ${name}?`}>
      <span className="admin-note">Your progress on the questions is kept.</span>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          progressActions.deletePlan(id);
          closeEditor();
          if (route.name === 'plan' && route.planId === id) navigate({ name: 'overview' });
        }}
      >
        Yes, delete
      </button>
      <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>
        Keep it
      </button>
    </span>
  );
}
