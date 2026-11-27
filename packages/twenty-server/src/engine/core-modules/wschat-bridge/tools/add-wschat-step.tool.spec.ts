import { PermissionFlagType } from 'twenty-shared/constants';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  FieldMetadataType,
  RelationType,
  ViewFilterOperand,
} from 'twenty-shared/types';

import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { DefinedToolRegistryService } from 'src/engine/core-modules/tool-provider/services/defined-tool-registry.service';
import { CoreWorkflowVersionPostCommitError } from 'src/engine/core-modules/workflow/services/core-workflow-version-write.service';
import { AddWschatStepTool } from 'src/engine/core-modules/wschat-bridge/tools/add-wschat-step.tool';
import { AccessPolicyService } from 'src/engine/guards/access-policy/access-policy.service';
import { WorkflowTriggerType } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'tok_secret_42';
const TARGET = { url: 'https://wschat.org/crm-actions/v1', token: TOKEN };

const stepFilter = (fieldName: string, value: string) => ({
  id: fieldName,
  type: 'SELECT',
  stepOutputKey: `{{trigger.properties.after.${fieldName}}}`,
  operand: ViewFilterOperand.IS,
  value,
  stepFilterGroupId: 'group',
});

const clientWroteTrigger = (stepFilters: ReturnType<typeof stepFilter>[]) => ({
  name: 'The client wrote',
  type: WorkflowTriggerType.DATABASE_EVENT,
  nextStepIds: [],
  settings: {
    eventName: 'wschatConversation.updated',
    outputSchema: {},
    fields: ['lastMessageAt'],
    filter: { stepFilterGroups: [], stepFilters },
  },
});

const PERSON = STANDARD_OBJECTS.person;

const FLAT_MAPS = {
  flatObjectMetadataMaps: {
    byUniversalIdentifier: {
      person: {
        id: 'person',
        universalIdentifier: PERSON.universalIdentifier,
        nameSingular: 'person',
      },
      conversation: { id: 'conversation', nameSingular: 'wschatConversation' },
    },
  },
  flatFieldMetadataMaps: {
    byUniversalIdentifier: {
      personId: {
        id: 'person-id',
        universalIdentifier: PERSON.fields.id.universalIdentifier,
        objectMetadataId: 'person',
        objectMetadataUniversalIdentifier: PERSON.universalIdentifier,
        name: 'id',
        type: FieldMetadataType.UUID,
      },
      imported: {
        id: 'imported',
        objectMetadataId: 'conversation',
        name: 'wschatImported',
        type: FieldMetadataType.BOOLEAN,
      },
      person: {
        id: 'person-relation',
        objectMetadataId: 'conversation',
        name: 'person',
        type: FieldMetadataType.RELATION,
        settings: { relationType: RelationType.MANY_TO_ONE },
        relationTargetObjectMetadataId: 'person',
      },
    },
  },
};

describe('AddWschatStepTool', () => {
  let target: typeof TARGET | undefined;
  let trigger: ReturnType<typeof clientWroteTrigger>;
  let draftSteps: unknown[];

  const actionsTargetService = { find: jest.fn(async () => target) };
  const coreWorkflowVersionWriteService = {
    getValidatedDraftCoreWorkflowVersion: jest.fn(async () => ({
      coreWorkflowVersion: { id: VERSION_ID },
      trigger,
      steps: draftSteps,
    })),
    writeContent: jest.fn(async () => ({})),
  };
  const flatEntityMapsCacheService = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest.fn(async () => FLAT_MAPS),
  };
  const tool = new AddWschatStepTool(
    actionsTargetService as never,
    coreWorkflowVersionWriteService as never,
    flatEntityMapsCacheService as never,
  );

  const addReply = () =>
    tool.execute({
      input: tool.inputSchema.parse({
        action: 'message',
        coreWorkflowVersionId: VERSION_ID,
        text: 'Спасибо, {{person.name.firstName}}! Скоро ответим.',
      }),
      context: { workspaceId: WORKSPACE_ID, userWorkspaceId: 'member' },
    });

  const writtenSteps = () =>
    (
      coreWorkflowVersionWriteService.writeContent.mock.calls[0] as unknown as [
        {
          trigger: { nextStepIds: string[] };
          steps: {
            id: string;
            name: string;
            type: string;
            nextStepIds?: string[];
            settings: {
              input: { url?: string; headers?: Record<string, string> };
            };
          }[];
        },
      ]
    )[0];

  beforeEach(() => {
    target = TARGET;
    trigger = clientWroteTrigger([stepFilter('lastMessageFrom', '["CLIENT"]')]);
    draftSteps = [];
    jest.clearAllMocks();
  });

  it('should add "find the client" and the message after the trigger, with the token nowhere in them', async () => {
    const output = await addReply();

    expect(output.success).toBe(true);

    const { trigger: writtenTrigger, steps } = writtenSteps();
    const [findClient, message] = steps;

    expect(JSON.stringify([output, steps])).not.toContain(TOKEN);
    expect(output.result).toEqual({
      coreWorkflowVersionId: VERSION_ID,
      stepIds: [findClient.id, message.id],
    });
    expect(writtenTrigger.nextStepIds).toEqual([findClient.id]);
    expect(findClient).toEqual(
      expect.objectContaining({
        type: 'FIND_RECORDS',
        nextStepIds: [message.id],
      }),
    );
    expect(message.type).toBe('HTTP_REQUEST');
    expect(message.settings.input.headers).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('should refuse a second identical WSChat step', async () => {
    await addReply();
    draftSteps = writtenSteps().steps;
    jest.clearAllMocks();

    const output = await addReply();

    expect(output.success).toBe(false);
    expect(output.message).toContain('already has this WSChat step');
    expect(coreWorkflowVersionWriteService.writeContent).not.toHaveBeenCalled();
  });

  it('should count a save whose cache refresh failed afterwards as done', async () => {
    coreWorkflowVersionWriteService.writeContent.mockRejectedValueOnce(
      new CoreWorkflowVersionPostCommitError(new Error('redis down')),
    );

    expect((await addReply()).success).toBe(true);
  });

  it('should refuse before reading the workflow while WSChat has not passed its address', async () => {
    target = undefined;

    const output = await addReply();

    expect(output).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining(
          'WSChat has not passed its address to this workspace yet',
        ),
      }),
    );
    expect(
      coreWorkflowVersionWriteService.getValidatedDraftCoreWorkflowVersion,
    ).not.toHaveBeenCalled();
  });

  it('should write nothing for a trigger that its own reply would start again', async () => {
    trigger = clientWroteTrigger([
      stepFilter('lastMessageFrom', '["CLIENT","EMPLOYEE"]'),
    ]);

    const output = await addReply();

    expect(output.success).toBe(false);
    expect(output.message).toContain('lastMessageFrom IS ["CLIENT"]');
    expect(coreWorkflowVersionWriteService.writeContent).not.toHaveBeenCalled();
  });

  it('should register at boot and be offered only with the workflows permission, never to application tokens', async () => {
    let grantedFlags: PermissionFlagType[] = [];
    const settingPermissionsService = {
      hasPermissionFlag: jest.fn(
        async ({ permissionFlag }: { permissionFlag: PermissionFlagType }) =>
          grantedFlags.includes(permissionFlag),
      ),
    };
    const registry = new DefinedToolRegistryService(
      {
        getProviders: () => [{ instance: tool, metatype: AddWschatStepTool }],
      } as never,
      new AccessPolicyService(settingPermissionsService as never, {} as never),
      { getWorkspaceFeatureFlagsMap: async () => ({}) } as never,
    );
    const offeredTo = async (authContext: object) =>
      (
        await registry.getAvailableDescriptors(
          { workspaceId: WORKSPACE_ID, authContext: authContext as never },
          { includeSchemas: false },
        )
      ).map(({ name, category }) => `${category}:${name}`);
    const member = { type: 'user', userSessionVariant: 'standard' };

    registry.onModuleInit();

    expect(await offeredTo(member)).toEqual([]);
    expect(
      await registry.execute({
        definedTool: registry.findDefinedTool('add_wschat_step')!,
        args: {},
        context: { workspaceId: WORKSPACE_ID, authContext: member as never },
      }),
    ).toEqual(expect.objectContaining({ success: false }));
    expect(actionsTargetService.find).not.toHaveBeenCalled();

    grantedFlags = [PermissionFlagType.WORKFLOWS];

    expect(await offeredTo(member)).toEqual(['WORKFLOW:add_wschat_step']);
    expect(
      await offeredTo({
        type: 'application',
        application: { sourceType: ApplicationRegistrationSourceType.NPM },
      }),
    ).toEqual([]);
  });
});
