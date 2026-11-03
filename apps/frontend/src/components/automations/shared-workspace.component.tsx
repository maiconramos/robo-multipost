'use client';
import { AutomationRequirementsContext } from './shared-requirements.component';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useProfilePermissions } from '@gitroom/frontend/hooks/use-profile-permissions';
import {
  AutomationEditorFeedback,
  AutomationSaveAction,
  type EditorActionProps,
} from './shared-editor-footer.component';
import { AutomationStatusSwitch } from './shared-editor-status.component';
import type {
  WorkspaceNavigation,
  WorkspaceMode,
} from './shared-workspace-navigation';
export function AutomationWorkspace(
  props: EditorActionProps & {
    name: string;
    nameLabel: string;
    onNameChange: (name: string) => void;
    subtitle?: string;
    picture?: string;
    navigation?: WorkspaceNavigation;
    history?: ReactNode;
    onStatusChange: (status: 'ACTIVE' | 'PAUSED') => void;
    children: ReactNode;
  }
) {
  const t = useT();
  const uid = useId();
  const nav = props.navigation;
  const mode = nav?.mode ?? 'quick';
  // Visualizador: so le (salvar/ativar/pausar ficam desligados; o backend
  // tambem recusa com PROFILE_READ_ONLY)
  const { isViewer: viewOnly } = useProfilePermissions();
  const [historyError, setHistoryError] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== 'history') setHistoryError(null);
  }, [mode]);
  useEffect(() => {
    nav?.onEditorState?.({ dirty: props.dirty, busy: props.busy });
  }, [nav?.onEditorState, props.dirty, props.busy]);
  const items: Array<{ mode: WorkspaceMode; key: string; disabled?: boolean }> =
    [
      {
        mode: 'quick',
        key: 'automation_workspace_quick',
        disabled: nav?.quickDisabled,
      },
      {
        mode: 'flow',
        key: 'automation_workspace_flow',
        disabled: !nav || nav.flowDisabled,
      },
      {
        mode: 'history',
        key: 'automation_workspace_history',
        disabled: !nav || nav.historyDisabled,
      },
    ];
  return (
    <AutomationRequirementsContext.Provider
      value={{ valid: props.valid, problems: props.problems }}
    >
      <section className="automation-workspace flex flex-col flex-1 min-w-0 w-full text-newTextColor bg-newBgColorInner lg:h-[calc(100dvh-105px)] lg:min-h-0 lg:overflow-hidden">
        <header className="shrink-0 border-b border-newTableBorder bg-newBgColorInner px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/automations"
              aria-label={t('automacoes')}
              className="shrink-0 p-2 rounded-lg hover:bg-boxHover"
            >
              ←
            </a>
            <div className="flex-1 min-w-[180px]">
              <input
                aria-label={props.nameLabel}
                value={props.name}
                onChange={(e) => props.onNameChange(e.target.value)}
                maxLength={200}
                readOnly={mode === 'history'}
                aria-readonly={mode === 'history'}
                disabled={
                  viewOnly ||
                  props.busy ||
                  nav?.switching ||
                  nav?.readOnly ||
                  props.status === 'ARCHIVED'
                }
                className="w-full bg-transparent border border-transparent hover:border-newTableBorder focus:border-newTableBorder rounded-md px-2 py-1 text-base font-semibold outline-none"
              />
              {props.subtitle && (
                <p className="px-2 flex items-center gap-1.5 text-xs text-newTextColor/60 truncate">
                  {props.picture && (
                    <img
                      src={props.picture}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  )}
                  {props.subtitle}
                </p>
              )}
            </div>
            <AutomationStatusSwitch
              status={props.status}
              busy={props.busy || !!nav?.switching || viewOnly}
              valid={props.valid && !viewOnly}
              pendingAction={nav?.switching ? undefined : props.pendingAction}
              onChange={(next) => {
                if (mode === 'history' && next === 'ACTIVE' && props.dirty) {
                  setHistoryError(t('history_return_editor_activate'));
                  return;
                }
                props.onStatusChange(next);
              }}
            />
            {mode !== 'history' && !viewOnly && (
              <AutomationSaveAction
                {...props}
                valid={props.valid && !nav?.switching && !nav?.readOnly}
              />
            )}
          </div>
          {viewOnly && (
            <p role="status" className="text-xs text-newTextColor/60">
              {t(
                'automation_view_only',
                'Acesso só de visualização: você pode ver esta automação, mas não alterá-la.'
              )}
            </p>
          )}
          <AutomationEditorFeedback {...props} showProblems={false} />
          {mode === 'history' && props.dirty && (
            <p className="text-xs text-newTextColor/60">
              {t('history_draft_preserved')}
            </p>
          )}
          {historyError && (
            <p role="alert" className="text-sm text-btnPrimary">
              {historyError}
            </p>
          )}
          {nav?.error && (
            <p role="alert" className="text-sm text-btnPrimary">
              {nav.error}
            </p>
          )}
        </header>
        <div
          role="tablist"
          aria-label={t('automation_workspace_modes')}
          className="shrink-0 flex gap-1 px-4 py-2 border-b border-newTableBorder overflow-x-auto"
        >
          {items.map((item, index) => (
            <button
              key={item.mode}
              type="button"
              role="tab"
              id={`${uid}-${item.mode}`}
              aria-controls={`${uid}-panel`}
              aria-selected={mode === item.mode}
              disabled={item.disabled || nav?.switching}
              title={
                item.disabled
                  ? t(
                      item.mode === 'quick'
                        ? 'automation_workspace_advanced_only'
                        : 'automation_workspace_save_first'
                    )
                  : undefined
              }
              tabIndex={mode === item.mode ? 0 : -1}
              onClick={() => nav?.onModeChange(item.mode)}
              onKeyDown={(e) => {
                const step =
                  e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                for (let n = 1; n <= items.length; n++) {
                  const next =
                    items[(index + step * n + items.length) % items.length];
                  if (!next.disabled) {
                    document.getElementById(`${uid}-${next.mode}`)?.focus();
                    nav?.onModeChange(next.mode);
                    break;
                  }
                }
              }}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm disabled:opacity-40 ${
                mode === item.mode
                  ? 'bg-boxHover font-semibold'
                  : 'text-newTextColor/65 hover:bg-boxHover'
              }`}
            >
              {t(item.key)}
            </button>
          ))}
        </div>
        {!nav && (
          <p className="px-6 py-2 text-xs text-newTextColor/60">
            {t('automation_workspace_save_first')}
          </p>
        )}
        <div
          id={`${uid}-panel`}
          role="tabpanel"
          aria-labelledby={`${uid}-${mode}`}
          className="flex flex-col flex-1 min-w-0 lg:min-h-0"
        >
          <div
            hidden={mode === 'history'}
            className={
              mode === 'history'
                ? 'hidden'
                : 'flex flex-col flex-1 min-w-0 lg:min-h-0'
            }
          >
            {mode === 'flow' && !props.valid && !!props.problems?.length && (
              <ul
                className="shrink-0 px-6 py-3 text-xs text-newTextColor/70 border-b border-newTableBorder space-y-1"
                aria-live="polite"
              >
                {props.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
            {viewOnly ? (
              // Visualizador: campos travados, nao so o Salvar escondido
              <fieldset disabled className="contents">
                {props.children}
              </fieldset>
            ) : (
              props.children
            )}
          </div>
          {mode === 'history' && (
            <div className="p-4 md:p-6 flex-1 min-w-0 overflow-y-auto">
              {props.history}
            </div>
          )}
        </div>
      </section>
    </AutomationRequirementsContext.Provider>
  );
}
