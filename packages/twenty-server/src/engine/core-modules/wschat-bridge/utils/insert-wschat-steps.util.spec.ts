import { WorkflowActionType } from 'twenty-shared/workflow';

import { insertWschatSteps } from 'src/engine/core-modules/wschat-bridge/utils/insert-wschat-steps.util';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import {
  type WorkflowTrigger,
  WorkflowTriggerType,
} from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

const step = (id: string, overrides: Record<string, unknown> = {}) =>
  ({ id, name: id, type: 'CODE', ...overrides }) as unknown as WorkflowAction;

const trigger = (nextStepIds: string[]) =>
  ({
    name: 'Trigger',
    type: WorkflowTriggerType.DATABASE_EVENT,
    nextStepIds,
    settings: { eventName: 'person.created', outputSchema: {} },
  }) as WorkflowTrigger;

const nextOf = (steps: WorkflowAction[], id: string) =>
  steps.find((candidate) => candidate.id === id)?.nextStepIds;

describe('insertWschatSteps', () => {
  it('should chain the new steps between the parent and its next step', () => {
    const { steps, trigger: updatedTrigger } = insertWschatSteps({
      steps: [step('later')],
      trigger: trigger(['later']),
      actions: [step('find'), step('send')],
      isLoop: false,
      placement: { parentStepId: 'trigger', nextStepId: 'later' },
    });

    expect(updatedTrigger?.nextStepIds).toEqual(['find']);
    expect(nextOf(steps, 'find')).toEqual(['send']);
    expect(nextOf(steps, 'send')).toEqual(['later']);
  });

  it('should insert a loop as its iterator, keeping the body as built', () => {
    const { steps } = insertWschatSteps({
      steps: [step('find-people')],
      trigger: trigger(['find-people']),
      actions: [
        step('loop', {
          type: 'ITERATOR',
          settings: { input: { initialLoopStepIds: ['send'] } },
        }),
        step('send', { nextStepIds: ['loop'] }),
      ],
      isLoop: true,
      placement: { parentStepId: 'find-people' },
    });

    expect(nextOf(steps, 'find-people')).toEqual(['loop']);
    expect(nextOf(steps, 'loop')).toBeUndefined();
    expect(nextOf(steps, 'send')).toEqual(['loop']);
  });

  it('should go into one branch of an If/Else', () => {
    const { steps } = insertWschatSteps({
      steps: [
        step('if', {
          type: 'IF_ELSE',
          settings: {
            input: {
              branches: [
                { id: 'yes', nextStepIds: [] },
                { id: 'no', nextStepIds: [] },
              ],
            },
          },
        }),
      ],
      trigger: trigger(['if']),
      actions: [step('send')],
      isLoop: false,
      placement: {
        parentStepId: 'if',
        parentStepConnectionOptions: {
          connectedStepType: WorkflowActionType.IF_ELSE,
          settings: { branchId: 'yes' },
        },
      },
    });
    const ifElse = steps.find(({ id }) => id === 'if') as unknown as {
      nextStepIds?: string[];
      settings: {
        input: { branches: { id: string; nextStepIds: string[] }[] };
      };
    };

    expect(ifElse.nextStepIds).toBeUndefined();
    expect(ifElse.settings.input.branches).toEqual([
      { id: 'yes', nextStepIds: ['send'] },
      { id: 'no', nextStepIds: [] },
    ]);
  });
});
