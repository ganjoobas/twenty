import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkflowVersionStatus } from 'src/engine/core-modules/workflow/entities/workflow-version.entity';
import { CoreWorkflowLifecycleWorkspaceService } from 'src/engine/core-modules/workflow/services/core-workflow-lifecycle.workspace-service';
import { getWorkflowPrefillIds } from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflows.util';

export type WschatBridgeSampleWorkflowsResult = {
  // Report names of factory workflows switched off by this call
  deactivated: string[];
  // Factory workflows the company already changed (another version exists), left alone
  skipped: string[];
};

// upstream's prefillWorkflows ids, derived from the workspace id
const factoryWorkflows = (workspaceId: string) => {
  const ids = getWorkflowPrefillIds(workspaceId);

  return [
    {
      reportName: 'workflow.quickLead',
      workflowId: ids.coreQuickLeadWorkflowId,
      versionId: ids.coreQuickLeadWorkflowVersionId,
    },
    {
      reportName: 'workflow.createCompanyFromPerson',
      workflowId: ids.coreCreateCompanyWorkflowId,
      versionId: ids.coreCreateCompanyWorkflowVersionId,
    },
  ];
};

// Upstream ships its sample workflows ACTIVE; "Create company when adding a new person" then runs on every
// person WSChat writes. Switched off with the same service as the Deactivate button, so a company can turn
// them back on; only while still the shipped single version, since editing an active version makes a new one
@Injectable()
export class WschatBridgeSampleWorkflowsService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly coreWorkflowLifecycleService: CoreWorkflowLifecycleWorkspaceService,
  ) {}

  async deactivateFactoryWorkflows(
    workspaceId: string,
  ): Promise<WschatBridgeSampleWorkflowsResult> {
    const result: WschatBridgeSampleWorkflowsResult = {
      deactivated: [],
      skipped: [],
    };

    for (const { reportName, workflowId, versionId } of factoryWorkflows(
      workspaceId,
    )) {
      const versions: { id: string; status: string }[] =
        await this.workspaceRepository.query(
          `SELECT id, status FROM core."workflowVersion" WHERE "workspaceId" = $1 AND "coreWorkflowId" = $2`,
          [workspaceId, workflowId],
        );

      // Deleted by the company, or never prefilled
      if (versions.length === 0) {
        continue;
      }

      if (versions.length !== 1 || versions[0].id !== versionId) {
        result.skipped.push(reportName);
        continue;
      }

      if (versions[0].status !== WorkflowVersionStatus.ACTIVE) {
        continue;
      }

      await this.coreWorkflowLifecycleService.deactivateCoreWorkflowVersion({
        workspaceId,
        userWorkspaceId: undefined,
        coreWorkflowVersionId: versionId,
      });
      result.deactivated.push(reportName);
    }

    return result;
  }
}
