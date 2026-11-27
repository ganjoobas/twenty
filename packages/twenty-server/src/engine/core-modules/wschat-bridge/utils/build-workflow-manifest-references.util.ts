import { isDefined } from 'twenty-shared/utils';

import { type WorkflowManifestReferences } from 'src/engine/core-modules/application/application-manifest/types/workflow-manifest-references.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

// As buildGettingStartedWorkflowContent: manifests point at objects and fields by universal identifier
export const buildWorkflowManifestReferences = ({
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
}: {
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
}): WorkflowManifestReferences => ({
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
});
