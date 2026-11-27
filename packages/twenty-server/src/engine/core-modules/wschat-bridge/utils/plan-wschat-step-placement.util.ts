import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { TRIGGER_STEP_ID, WorkflowActionType } from 'twenty-shared/workflow';

import { type WorkflowStepConnectionOptions } from 'src/modules/workflow/workflow-builder/workflow-version-step/types/workflow-step-connection-options.type';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import { type WorkflowTrigger } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

export type WschatStepPlacement = {
  parentStepId: string;
  nextStepId?: string;
  parentStepConnectionOptions?: WorkflowStepConnectionOptions;
};

// After the parent, before its only next step if it has one, so a chain or a loop body stays one line
export const planWschatStepPlacement = ({
  trigger,
  steps,
  parentStepId,
  branchId,
}: {
  trigger: WorkflowTrigger;
  steps: WorkflowAction[];
  parentStepId: string | undefined;
  branchId: string | undefined;
}): WschatStepPlacement | { problem: string } => {
  const leafSteps = steps.filter(
    ({ nextStepIds }) => !isNonEmptyArray(nextStepIds),
  );
  const resolvedParentStepId =
    parentStepId ??
    (steps.length === 0
      ? TRIGGER_STEP_ID
      : leafSteps.length === 1
        ? leafSteps[0].id
        : undefined);

  if (!isDefined(resolvedParentStepId)) {
    return {
      problem:
        'The workflow has several last steps: pass parentStepId (a step id, or "trigger").',
    };
  }

  const parent = steps.find(({ id }) => id === resolvedParentStepId);

  if (resolvedParentStepId !== TRIGGER_STEP_ID && !isDefined(parent)) {
    return {
      problem: `Step "${resolvedParentStepId}" is not in this workflow version.`,
    };
  }

  if (parent?.type === WorkflowActionType.IF_ELSE) {
    const branch = parent.settings.input.branches.find(
      ({ id }) => id === branchId,
    );

    if (!isDefined(branch)) {
      return {
        problem: `Step "${parent.id}" is an If/Else: pass branchId, one of ${parent.settings.input.branches.map(({ id }) => `"${id}"`).join(', ')}.`,
      };
    }

    return {
      parentStepId: parent.id,
      nextStepId:
        branch.nextStepIds.length === 1 ? branch.nextStepIds[0] : undefined,
      parentStepConnectionOptions: {
        connectedStepType: WorkflowActionType.IF_ELSE,
        settings: { branchId: branch.id },
      },
    };
  }

  if (isDefined(branchId)) {
    return { problem: 'branchId applies only to an If/Else parent step.' };
  }

  const nextStepIds = (parent ?? trigger).nextStepIds ?? [];

  return {
    parentStepId: resolvedParentStepId,
    nextStepId: nextStepIds.length === 1 ? nextStepIds[0] : undefined,
  };
};
