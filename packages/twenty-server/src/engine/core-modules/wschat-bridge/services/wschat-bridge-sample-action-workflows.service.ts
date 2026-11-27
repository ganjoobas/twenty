import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { workflowManifestSchema } from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { fromWorkflowStepManifestToActionOrThrow } from 'src/engine/core-modules/application/application-manifest/converters/from-workflow-step-manifest-to-action-or-throw.util';
import { fromWorkflowTriggerManifestToTriggerOrThrow } from 'src/engine/core-modules/application/application-manifest/converters/from-workflow-trigger-manifest-to-trigger-or-throw.util';
import { type WorkflowManifestReferences } from 'src/engine/core-modules/application/application-manifest/types/workflow-manifest-references.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { CoreWorkflowMutationWorkspaceService } from 'src/engine/core-modules/workflow/services/core-workflow-mutation.workspace-service';
import { type WschatBridgeLocale } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import {
  buildSampleActionWorkflows,
  type WschatBridgeActionsTarget,
} from 'src/engine/core-modules/wschat-bridge/utils/build-sample-action-workflows.util';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';

// Created as drafts through upstream's createWorkflowWithContent (the AI tool's and getting-started's path):
// a draft has no subscribed trigger until the company activates it. Never rewritten afterwards
@Injectable()
export class WschatBridgeSampleActionWorkflowsService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly coreWorkflowMutationService: CoreWorkflowMutationWorkspaceService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {}

  // Report names of the samples created; one already there by name (a run that stopped part-way) is skipped
  async createSamples({
    workspaceId,
    target,
    locale,
  }: {
    workspaceId: string;
    target: WschatBridgeActionsTarget;
    locale: WschatBridgeLocale;
  }): Promise<string[]> {
    const samples = buildSampleActionWorkflows({ target, locale });
    const existingNames = new Set(
      (
        (await this.workspaceRepository.query(
          `SELECT name FROM core."workflow" WHERE "workspaceId" = $1 AND name = ANY($2)`,
          [workspaceId, samples.map(({ name }) => name)],
        )) as { name: string }[]
      ).map(({ name }) => name),
    );
    const references = await this.buildReferences(workspaceId);
    const created: string[] = [];

    for (const sample of samples.filter(
      ({ name }) => !existingNames.has(name),
    )) {
      const { version } = workflowManifestSchema.parse(sample.manifest);

      await this.coreWorkflowMutationService.createWorkflowWithContent({
        workspaceId,
        userWorkspaceId: undefined,
        name: sample.name,
        trigger: {
          ...fromWorkflowTriggerManifestToTriggerOrThrow({
            trigger: version.trigger,
            references,
          }),
          name: version.trigger.name ?? sample.name,
        },
        steps: version.steps.map((step) =>
          fromWorkflowStepManifestToActionOrThrow({ step, references }),
        ),
        edges: [],
      });
      created.push(sample.reportName);
    }

    return created;
  }

  // As buildGettingStartedWorkflowContent: manifests point at objects and fields by universal identifier
  private async buildReferences(
    workspaceId: string,
  ): Promise<WorkflowManifestReferences> {
    const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        {
          workspaceId,
          flatMapsKeys: ['flatObjectMetadataMaps', 'flatFieldMetadataMaps'],
        },
      );

    return {
      logicFunctionIdByUniversalIdentifier: new Map(),
      objectByUniversalIdentifier: new Map(
        Object.values(flatObjectMetadataMaps.byUniversalIdentifier)
          .filter(isDefined)
          .map((flatObjectMetadata) => [
            flatObjectMetadata.universalIdentifier,
            flatObjectMetadata,
          ]),
      ),
      fieldByUniversalIdentifier: new Map(
        Object.values(flatFieldMetadataMaps.byUniversalIdentifier)
          .filter(isDefined)
          .map((flatFieldMetadata) => [
            flatFieldMetadata.universalIdentifier,
            {
              ...flatFieldMetadata,
              objectUniversalIdentifier:
                flatFieldMetadata.objectMetadataUniversalIdentifier,
            },
          ]),
      ),
    };
  }
}
