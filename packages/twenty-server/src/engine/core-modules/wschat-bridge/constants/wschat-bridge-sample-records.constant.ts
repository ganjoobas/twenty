import {
  AIRBNB_ID,
  ANTHROPIC_ID,
  FIGMA_ID,
  NOTION_ID,
  STRIPE_ID,
} from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-companies.util';
import {
  OPPORTUNITY_AIRBNB_ENTERPRISE_ID,
  OPPORTUNITY_ANTHROPIC_AI_MODEL_ID,
  OPPORTUNITY_FIGMA_DESIGN_ID,
  OPPORTUNITY_NOTION_WORKSPACE_ID,
  OPPORTUNITY_STRIPE_API_INTEGRATION_ID,
  OPPORTUNITY_STRIPE_PLATFORM_MIGRATION_ID,
} from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-opportunities.util';
import {
  BRIAN_CHESKY_ID,
  DARIO_AMODEI_ID,
  DYLAN_FIELD_ID,
  IVAN_ZHAO_ID,
  PATRICK_COLLISON_ID,
} from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-people.util';

// The sample records activateWorkspace inserts (prefillCreatedWorkspaceRecords), by upstream's own fixed ids.
// Dependants first: opportunities point at people and companies, people at companies
export const WSCHAT_BRIDGE_SAMPLE_RECORDS: { table: string; ids: string[] }[] =
  [
    {
      table: 'opportunity',
      ids: [
        OPPORTUNITY_STRIPE_PLATFORM_MIGRATION_ID,
        OPPORTUNITY_ANTHROPIC_AI_MODEL_ID,
        OPPORTUNITY_NOTION_WORKSPACE_ID,
        OPPORTUNITY_STRIPE_API_INTEGRATION_ID,
        OPPORTUNITY_AIRBNB_ENTERPRISE_ID,
        OPPORTUNITY_FIGMA_DESIGN_ID,
      ],
    },
    {
      table: 'person',
      ids: [
        BRIAN_CHESKY_ID,
        DARIO_AMODEI_ID,
        PATRICK_COLLISON_ID,
        DYLAN_FIELD_ID,
        IVAN_ZHAO_ID,
      ],
    },
    {
      table: 'company',
      ids: [AIRBNB_ID, ANTHROPIC_ID, STRIPE_ID, FIGMA_ID, NOTION_ID],
    },
  ];
