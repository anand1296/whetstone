import { useId, useMemo, useState } from 'react';
import { preloadSection, useContent } from '../content/index.ts';
import { Icon, LoopMark } from '../components/Icon.tsx';
import { SYNC_COPY } from '../features/settings/SettingsDialog.tsx';
import { syncStatusStore } from '../state/persistence/cloudSync.ts';
import { platformStore } from '../platform/runtime.ts';
import { isAdminRole, useServer } from '../platform/backend.ts';
import { Avatar, ROLE_LABEL } from '../features/account/Account.tsx';
import { progressStore } from '../state/progressStore.ts';
import { doneCount, dueQuestions } from '../state/selectors.ts';
import { openPlanEditor } from '../features/plans/PlanEditor.tsx';
import { useActivePlan } from '../features/plans/usePlans.ts';
import { navigate, routeStore } from '../state/route.ts';
import { useStore } from '../state/useStore.ts';

interface SidebarProps {
  onSearch: () => void;
  onSettings: () => void;
  onSignIn: () => void;
  /** Called after any navigation (closes the mobile drawer). */
  onNavigate?: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Sidebar({ onSearch, onSettings, onSignIn, onNavigate }: SidebarProps) {
  const { allQuestions, sections } = useContent();
  const route = useStore(routeStore, (r) => r);
  const progress = useStore(progressStore, (s) => s.questions);
  const sync = useStore(syncStatusStore, (s) => s);
  const role = useStore(platformStore, (p) => p.role);
  const server = useServer();
  const { features } = server;
  const isAdmin = server.mode === 'server' ? isAdminRole(server.user?.role) : role === 'owner';
  const adminChip = server.mode === 'server' ? (server.user ? ROLE_LABEL[server.user.role] : '') : 'Super admin';
  const [now] = useState(() => Date.now());
  const activeSection = route.name === 'section' ? route.sectionId : null;
  // The list and the review badge follow the plan you are working in; the topic you're reading always stays visible.
  const { plan, sections: planTopics } = useActivePlan();
  const dueCount = useMemo(() => {
    const scope = planTopics.flatMap((section) => section.questions);
    return dueQuestions(plan ? scope : allQuestions, progress, now).length;
  }, [plan, planTopics, allQuestions, progress, now]);
  const listed = useMemo(() => {
    const keep = new Set(planTopics.map((section) => section.id));
    return sections.filter((section) => keep.has(section.id) || section.id === activeSection);
  }, [sections, planTopics, activeSection]);
  const hidden = sections.length - listed.length;
  const topicsLabelId = useId();
  const behindLabelId = useId();

  const go = (target: Parameters<typeof navigate>[0]): void => {
    navigate(target);
    onNavigate?.();
  };

  return (
    <div className="sidebar-inner">
      <button type="button" className="brand" onClick={() => go({ name: 'overview' })}>
        <LoopMark />
        <span>{server.site.name}</span>
      </button>

      {features.search ? (
        <button type="button" className="search-trigger" onClick={onSearch}>
          <Icon name="search" size={18} />
          <span>Search questions</span>
          <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
      ) : null}

      <nav aria-label="Main">
        <ul className="nav-list">
          <li>
            <button
              type="button"
              className="nav-item"
              aria-current={route.name === 'overview' ? 'page' : undefined}
              onClick={() => go({ name: 'overview' })}
            >
              <Icon name="home" size={18} />
              <span>My plans</span>
            </button>
          </li>
          {features.review ? (
          <li>
            <button
              type="button"
              className="nav-item"
              aria-current={route.name === 'review' ? 'page' : undefined}
              onClick={() => go({ name: 'review' })}
            >
              <Icon name="refresh" size={18} />
              <span>Review</span>
              {dueCount > 0 ? (
                <span className="badge" aria-label={`${dueCount} due`}>
                  {dueCount}
                </span>
              ) : null}
            </button>
          </li>
          ) : null}
          {isAdmin ? (
            <li>
              <button
                type="button"
                className="nav-item"
                aria-current={route.name === 'admin' ? 'page' : undefined}
                onClick={() => go({ name: 'admin' })}
              >
                <Icon name="shield" size={18} />
                <span>Admin</span>
                {server.pendingSubmissions + server.pendingIdeas > 0 ? (
                  <span className="badge" aria-label={`${server.pendingSubmissions + server.pendingIdeas} to review`}>
                    {server.pendingSubmissions + server.pendingIdeas}
                  </span>
                ) : null}
                <span className="role-chip">{adminChip}</span>
              </button>
            </li>
          ) : null}
        </ul>

        {/* The dashboard and a plan's own page already list the topics with their progress, so repeating them beside it is noise. */}
        {route.name === 'overview' || route.name === 'plan' ? null : (
          <>
            <p className="nav-label" id={topicsLabelId}>
              {plan ? `Topics · ${plan.name}` : 'Topics'}
            </p>
            <ol className="nav-list nav-rounds" aria-labelledby={topicsLabelId}>
              {listed.map((section) => {
                const done = doneCount(section.questions, progress);
                const total = section.questions.length;
                const draft = section.published === false;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      className="nav-item nav-round"
                      aria-current={activeSection === section.id ? 'page' : undefined}
                      data-complete={done === total}
                      onPointerEnter={() => preloadSection(section.id)}
                      onClick={() => go({ name: 'section', sectionId: section.id })}
                    >
                      <span className="nav-round-title">
                        {section.title}
                        {draft ? <span className="draft-chip">Draft</span> : null}
                      </span>
                      <span className="nav-round-count tabular" aria-label={`${done} of ${total} done`}>
                        {done}/{total}
                      </span>
                      <span className="nav-round-bar" aria-hidden="true">
                        <span style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {hidden > 0 ? (
              <button
                type="button"
                className="nav-more"
                onClick={() => {
                  if (plan) openPlanEditor(plan.id);
                  onNavigate?.();
                }}
              >
                {hidden} {hidden === 1 ? 'topic is' : 'topics are'} outside this plan · edit plan
              </button>
            ) : null}
          </>
        )}

        {features.howItsBuilt || features.contribute ? (
          <>
            <p className="nav-label nav-label-behind" id={behindLabelId}>
              Behind the scenes
            </p>
            <ul className="nav-list" aria-labelledby={behindLabelId}>
              {features.howItsBuilt ? (
                <li>
                  <button
                    type="button"
                    className="nav-item"
                    aria-current={route.name === 'howItsBuilt' ? 'page' : undefined}
                    onClick={() => go({ name: 'howItsBuilt', walkthroughId: null })}
                  >
                    <Icon name="code" size={18} />
                    <span>How it's built</span>
                  </button>
                </li>
              ) : null}
              {features.contribute ? (
                <li>
                  <button
                    type="button"
                    className="nav-item"
                    aria-current={route.name === 'contribute' ? 'page' : undefined}
                    onClick={() => go({ name: 'contribute' })}
                  >
                    <Icon name="pullRequest" size={18} />
                    <span>Contribute</span>
                  </button>
                </li>
              ) : null}
            </ul>
          </>
        ) : null}
      </nav>

      <div className="sidebar-foot">
        {server.mode === 'server' && server.user ? (
          <button type="button" className="account-chip" onClick={onSettings} title={`Signed in as @${server.user.login}`}>
            <Avatar user={server.user} size={26} />
            <span className="account-chip-text">
              <span>{server.user.login}</span>
              <span className="sync-line">
                <span className="sync-dot" data-status={sync} />
                {SYNC_COPY[sync]}
              </span>
            </span>
          </button>
        ) : (
          <span className="sync-line">
            <span className="sync-dot" data-status={sync} />
            {SYNC_COPY[sync]}
          </span>
        )}
        {server.mode === 'server' && !server.user ? (
          <button type="button" className="btn btn-signin" onClick={onSignIn}>
            Sign in
          </button>
        ) : null}
        <button type="button" className="icon-btn" onClick={onSettings} aria-label="Settings">
          <Icon name="settings" />
        </button>
      </div>
    </div>
  );
}
