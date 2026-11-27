import { ToolCategory } from 'twenty-shared/ai';
import { workflowStepManifestSchema } from 'twenty-shared/application';
import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';
import { z } from 'zod';

import { fromWorkflowStepManifestToActionOrThrow } from 'src/engine/core-modules/application/application-manifest/converters/from-workflow-step-manifest-to-action-or-throw.util';
import { DefineTool } from 'src/engine/core-modules/tool-provider/decorators/define-tool.decorator';
import { BaseTool } from 'src/engine/core-modules/tool-provider/interfaces/base-tool.interface';
import { type ToolExecuteArgs } from 'src/engine/core-modules/tool-provider/types/tool-execute-args.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import {
  CoreWorkflowVersionPostCommitError,
  CoreWorkflowVersionWriteService,
} from 'src/engine/core-modules/workflow/services/core-workflow-version-write.service';
import { ADD_WSCHAT_STEP_TOOL_NAME } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-add-step-tool-name.constant';
import { WschatBridgeActionsTargetService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-actions-target.service';
import { buildWorkflowManifestReferences } from 'src/engine/core-modules/wschat-bridge/utils/build-workflow-manifest-references.util';
import {
  buildWschatStepManifests,
  findSameWschatStep,
} from 'src/engine/core-modules/wschat-bridge/utils/build-wschat-step-manifests.util';
import { insertWschatSteps } from 'src/engine/core-modules/wschat-bridge/utils/insert-wschat-steps.util';
import { planWschatStep } from 'src/engine/core-modules/wschat-bridge/utils/plan-wschat-step.util';
import { type AccessPolicy } from 'src/engine/guards/types/access-policy.type';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';

// As the workflow tools (WORKFLOWS flag); application tokens are refused outright, a stricter form of their reachability gate
const ADD_WSCHAT_STEP_ACCESS_POLICY: AccessPolicy = {
  authPrincipals: {
    userSession: {
      standard: true,
      impersonated: true,
      playground: true,
      workspaceAgnostic: false,
    },
    apiKey: true,
    oauthClient: true,
    application: false,
  },
  requiredPermissionFlags: [PermissionFlagType.WORKFLOWS],
};

const NO_TARGET_MESSAGE =
  'WSChat has not passed its address to this workspace yet, so no WSChat step can be added. Tell the user it comes with the hourly sync: try again within an hour, or contact WSChat support.';

const stepPlacementFields = {
  coreWorkflowVersionId: z
    .uuid()
    .describe(
      'The DRAFT core workflow version, e.g. from create_complete_workflow',
    ),
  parentStepId: z
    .string()
    .optional()
    .describe(
      'The step the new steps follow (a step id or "trigger"), before its only next step. Default: after the last step, or after forEachRecordOf',
    ),
  branchId: z
    .string()
    .optional()
    .describe('When parentStepId is an IF_ELSE step: the branch to add to'),
  forEachRecordOf: z
    .string()
    .optional()
    .describe(
      'Id of a FIND_RECORDS step: act once per record it finds (needed for CRON and other triggers without a record)',
    ),
};

const TEXT_HINT =
  '{{person.<field>}} is the client, e.g. {{person.name.firstName}}';

const addWschatStepInputSchema = z.discriminatedUnion('action', [
  z.object({
    ...stepPlacementFields,
    action: z.literal('message'),
    text: z
      .string()
      .trim()
      .min(1)
      .describe(`The message, in the client's language. ${TEXT_HINT}`),
  }),
  z.object({
    ...stepPlacementFields,
    action: z.literal('task'),
    title: z.string().trim().min(1).describe(`The task title. ${TEXT_HINT}`),
  }),
]);

// Preloaded on every chat turn: only what the model needs (README, "AI chat: WSChat steps")
@DefineTool({
  name: ADD_WSCHAT_STEP_TOOL_NAME,
  category: ToolCategory.WORKFLOW,
  icon: 'IconSettingsAutomation',
  accessPolicy: ADD_WSCHAT_STEP_ACCESS_POLICY,
  description: `Add a WSChat step to a DRAFT workflow: "message" writes to the client (WhatsApp, Telegram, Instagram or website chat, on the client's last channel), "task" creates a WSChat task. Use it whenever a workflow must write to a client or make a WSChat task; never build an HTTP request to WSChat or ask for its address or token.

Set the trigger first: a record "created"/"updated" event, a MANUAL trigger on one record, or any trigger plus a FIND_RECORDS step passed as forEachRecordOf. Loops and history are refused:
- "updated" must list settings.fields; do not add wschatImported there.
- "created" on an object with wschatImported: filter wschatImported IS "false".
- Client wrote: wschatConversation.updated, fields ["lastMessageAt"], filter lastMessageFrom IS ["CLIENT"] (same filter for wschatConversation.created). Closed successfully: fields ["state","outcomeTone"], state IS ["CLOSED"], outcomeTone IS ["SUCCESS"].
- Guard filters sit in AND groups: {"stepFilterGroups":[{"id":"<G>","logicalOperator":"AND"}],"stepFilters":[{"id":"<uuid>","type":"SELECT","stepOutputKey":"{{trigger.properties.after.lastMessageFrom}}","operand":"IS","value":"[\"CLIENT\"]","stepFilterGroupId":"<G>"}]}

The CRM never gets message text: no step (CLASSIFY, AI_AGENT) can react to what a client wrote; say so. Leave the workflow a draft for the user to activate.`,
})
export class AddWschatStepTool extends BaseTool<
  typeof addWschatStepInputSchema
> {
  readonly inputSchema = addWschatStepInputSchema;

  constructor(
    private readonly actionsTargetService: WschatBridgeActionsTargetService,
    private readonly coreWorkflowVersionWriteService: CoreWorkflowVersionWriteService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {
    super();
  }

  async execute({
    input,
    context,
  }: ToolExecuteArgs<typeof addWschatStepInputSchema>): Promise<ToolOutput> {
    const { workspaceId, userWorkspaceId } = context;
    const target = await this.actionsTargetService.find(workspaceId);

    if (!isDefined(target)) {
      return {
        success: false,
        message: NO_TARGET_MESSAGE,
        error: NO_TARGET_MESSAGE,
      };
    }

    try {
      const { coreWorkflowVersion, trigger, steps } =
        await this.coreWorkflowVersionWriteService.getValidatedDraftCoreWorkflowVersion(
          {
            workspaceId,
            userWorkspaceId,
            coreWorkflowVersionId: input.coreWorkflowVersionId,
          },
        );
      const existingSteps = steps ?? [];
      const sameStep = findSameWschatStep({
        steps: existingSteps,
        actionsUrl: target.url,
        request: input,
      });

      if (isDefined(sameStep)) {
        const problem = `The draft already has this WSChat step ("${sameStep.name}", ${sameStep.id}); nothing was added.`;

        return { success: false, message: problem, error: problem };
      }

      const flatMaps =
        await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
          {
            workspaceId,
            flatMapsKeys: ['flatObjectMetadataMaps', 'flatFieldMetadataMaps'],
          },
        );
      const plan = planWschatStep({
        action: input.action,
        trigger,
        steps: existingSteps,
        parentStepId: input.parentStepId,
        branchId: input.branchId,
        forEachRecordOf: input.forEachRecordOf,
        ...flatMaps,
      });

      if ('problem' in plan) {
        return { success: false, message: plan.problem, error: plan.problem };
      }

      const references = buildWorkflowManifestReferences(flatMaps);
      const { steps: manifests, isLoop } = buildWschatStepManifests({
        request: input,
        actionsUrl: target.url,
        source: plan.source,
        personJoinColumn: plan.personJoinColumn,
        locale: context.locale === 'ru-RU' ? 'ru' : 'en',
      });
      const actions = manifests.map((step) =>
        fromWorkflowStepManifestToActionOrThrow({
          step: workflowStepManifestSchema.parse(step),
          references,
        }),
      );
      const content = insertWschatSteps({
        steps: existingSteps,
        trigger,
        actions,
        isLoop,
        placement: plan.placement,
      });

      try {
        await this.coreWorkflowVersionWriteService.writeContent({
          workspaceId,
          coreWorkflowVersionId: input.coreWorkflowVersionId,
          expectedVersion: coreWorkflowVersion,
          ...content,
        });
      } catch (error) {
        // Saved; only the cache refresh after the commit failed
        if (!(error instanceof CoreWorkflowVersionPostCommitError)) {
          throw error;
        }
      }

      return {
        success: true,
        message: `Added ${actions.map(({ name }) => `"${name}"`).join(', ')}. Call validate_workflow once the workflow is complete, do not activate it: the user reviews and activates it.`,
        result: {
          coreWorkflowVersionId: input.coreWorkflowVersionId,
          stepIds: actions.map(({ id }) => id),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to add the WSChat step: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
