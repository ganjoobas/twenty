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
import { CoreWorkflowVersionWriteService } from 'src/engine/core-modules/workflow/services/core-workflow-version-write.service';
import { ADD_WSCHAT_STEP_TOOL_NAME } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-add-step-tool-name.constant';
import { WschatBridgeActionsTargetService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-actions-target.service';
import { buildWorkflowManifestReferences } from 'src/engine/core-modules/wschat-bridge/utils/build-workflow-manifest-references.util';
import { buildWschatStepManifests } from 'src/engine/core-modules/wschat-bridge/utils/build-wschat-step-manifests.util';
import { planWschatStep } from 'src/engine/core-modules/wschat-bridge/utils/plan-wschat-step.util';
import { type AccessPolicy } from 'src/engine/guards/types/access-policy.type';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { insertStep } from 'src/modules/workflow/workflow-builder/workflow-version-step/utils/insert-step';

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
      'The step the WSChat steps follow: a step id, or "trigger". Default: after the last step',
    ),
};

const addWschatStepInputSchema = z.discriminatedUnion('action', [
  z.object({
    ...stepPlacementFields,
    action: z.literal('message'),
    text: z
      .string()
      .trim()
      .min(1)
      .describe(
        'The message, in the language the client is written to. {{person.<field>}} is the client, e.g. {{person.name.firstName}}',
      ),
  }),
  z.object({
    ...stepPlacementFields,
    action: z.literal('task'),
    title: z
      .string()
      .trim()
      .min(1)
      .describe(
        'The task title; {{person.<field>}} is the client, e.g. {{person.name.firstName}}',
      ),
  }),
]);

@DefineTool({
  name: ADD_WSCHAT_STEP_TOOL_NAME,
  category: ToolCategory.WORKFLOW,
  icon: 'IconSettingsAutomation',
  accessPolicy: ADD_WSCHAT_STEP_ACCESS_POLICY,
  description: `Add to a DRAFT workflow version a step acting in WSChat, the messenger hub this CRM is part of: action "message" writes to the client (WhatsApp, Telegram, Instagram or website chat, through the client's last channel), action "task" creates a task in WSChat. Use it for every workflow that must write to a client or make a WSChat task. NEVER build an HTTP request to WSChat yourself and never ask for its address or token: this tool adds them.

Adds a "find the client" step when the trigger record is not a person, then the WSChat step, after parentStepId. Returns only step ids.

Set the trigger first (create_complete_workflow with steps: [], or update_workflow_version_trigger). The tool refuses a trigger that would loop or fire on history:
- DATABASE_EVENT "created" or "updated" only, on a record leading to a person (person, wschatConversation, wschatCall, an opportunity's point of contact...).
- "updated" MUST list watched fields in settings.fields: WSChat updates its records after every message.
- Objects with wschatImported need the filter wschatImported IS "false": history loaded into the CRM must not reach clients.
- "The client wrote to us": eventName "wschatConversation.updated", fields ["lastMessageAt"], filters lastMessageFrom IS ["CLIENT"] and wschatImported IS "false" (plus channel IS ["WHATSAPP","WHATSAPP_BUSINESS"] for WhatsApp only, etc.). Without the lastMessageFrom filter the reply starts the workflow again.
- "Closed successfully": "wschatConversation.updated", fields ["state","outcomeTone"], state IS ["CLOSED"], outcomeTone IS ["SUCCESS"], wschatImported IS "false".
- Filter shape: settings.filter = {"stepFilterGroups":[{"id":"<uuid G>","logicalOperator":"AND"}],"stepFilters":[{"id":"<uuid>","type":"SELECT","stepOutputKey":"{{trigger.properties.after.lastMessageFrom}}","operand":"IS","value":"[\\"CLIENT\\"]","stepFilterGroupId":"<uuid G>"},{"id":"<uuid>","type":"BOOLEAN","stepOutputKey":"{{trigger.properties.after.wschatImported}}","operand":"IS","value":"false","stepFilterGroupId":"<uuid G>"}]}. Add personId IS_NOT_EMPTY (type UUID, value "") so records without a client do not run.

The CRM never receives what clients write, only when the last message came and from whom: no workflow can react to the content of a message, and no CLASSIFY or AI_AGENT step can read it. Tell the user so plainly when asked for "if the message is about X".

Leave the workflow a draft and do not activate it: a WSChat message reaches a real client. Tell the user to review it and switch it on.`,
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
        steps: steps ?? [],
        parentStepId: input.parentStepId,
        ...flatMaps,
      });

      if ('problem' in plan) {
        return { success: false, message: plan.problem, error: plan.problem };
      }

      const references = buildWorkflowManifestReferences(flatMaps);
      const actions = buildWschatStepManifests({
        request: input,
        target,
        personIdVariable: plan.personIdVariable,
        locale: context.locale === 'ru-RU' ? 'ru' : 'en',
      }).map((step) =>
        fromWorkflowStepManifestToActionOrThrow({
          step: workflowStepManifestSchema.parse(step),
          references,
        }),
      );

      // One after the other, so each new step follows the previous one
      const content = actions.reduce(
        (current, action, index) => {
          const inserted = insertStep({
            existingSteps: current.steps,
            existingTrigger: current.trigger,
            insertedStep: action,
            parentStepId:
              index === 0 ? plan.parentStepId : actions[index - 1].id,
          });

          return {
            steps: inserted.updatedSteps,
            trigger: inserted.updatedTrigger,
          };
        },
        { steps: steps ?? [], trigger },
      );

      await this.coreWorkflowVersionWriteService.writeContent({
        workspaceId,
        coreWorkflowVersionId: input.coreWorkflowVersionId,
        expectedVersion: coreWorkflowVersion,
        ...content,
      });

      return {
        success: true,
        message: `Added ${actions.map(({ name }) => `"${name}"`).join(' and ')} to the draft. Call validate_workflow once the workflow is complete, but do not activate it: tell the user to review and activate it.`,
        result: {
          coreWorkflowVersionId: input.coreWorkflowVersionId,
          stepIds: actions.map(({ id }) => id),
        },
      };
    } catch (error) {
      // The token is inside the steps; never let an error echo it back
      const reason = (error instanceof Error ? error.message : String(error))
        .split(target.token)
        .join('***');

      return {
        success: false,
        message: `Failed to add the WSChat step: ${reason}`,
        error: reason,
      };
    }
  }
}
