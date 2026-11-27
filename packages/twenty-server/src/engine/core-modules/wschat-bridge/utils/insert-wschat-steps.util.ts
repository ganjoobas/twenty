import { type WschatStepPlacement } from 'src/engine/core-modules/wschat-bridge/utils/plan-wschat-step-placement.util';
import { insertStep } from 'src/modules/workflow/workflow-builder/workflow-version-step/utils/insert-step';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import { type WorkflowTrigger } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

type WorkflowContent = {
  steps: WorkflowAction[];
  trigger: WorkflowTrigger | null;
};

// Upstream's insertStep for each new step, chained before the parent's former next step;
// a loop goes in as its iterator, the body linked through initialLoopStepIds
export const insertWschatSteps = ({
  steps,
  trigger,
  actions,
  isLoop,
  placement: { parentStepId, nextStepId, parentStepConnectionOptions },
}: WorkflowContent & {
  actions: WorkflowAction[];
  isLoop: boolean;
  placement: WschatStepPlacement;
}): WorkflowContent => {
  const insert = (
    content: WorkflowContent,
    insertedStep: WorkflowAction,
    parent: Pick<
      WschatStepPlacement,
      'parentStepId' | 'parentStepConnectionOptions'
    >,
    additionalCreatedSteps?: WorkflowAction[],
  ): WorkflowContent => {
    const { updatedSteps, updatedTrigger } = insertStep({
      existingSteps: content.steps,
      existingTrigger: content.trigger,
      insertedStep,
      additionalCreatedSteps,
      nextStepId,
      ...parent,
    });

    return { steps: updatedSteps, trigger: updatedTrigger };
  };
  const firstParent = { parentStepId, parentStepConnectionOptions };

  if (isLoop) {
    const [iterator, ...body] = actions;

    return insert({ steps, trigger }, iterator, firstParent, body);
  }

  return actions.reduce<WorkflowContent>(
    (content, action, index) =>
      insert(
        content,
        action,
        index === 0 ? firstParent : { parentStepId: actions[index - 1].id },
      ),
    { steps, trigger },
  );
};
