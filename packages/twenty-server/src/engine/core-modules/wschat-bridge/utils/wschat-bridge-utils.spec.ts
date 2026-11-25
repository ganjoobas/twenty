import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';

import {
  WorkspaceException,
  WorkspaceExceptionCode,
} from 'src/engine/core-modules/workspace/workspace.exception';
import { classifyBridgeSubdomain } from 'src/engine/core-modules/wschat-bridge/utils/classify-bridge-subdomain.util';
import { mapUpstreamErrorToBridgeError } from 'src/engine/core-modules/wschat-bridge/utils/map-upstream-error-to-bridge-error.util';
import { maskEmail } from 'src/engine/core-modules/wschat-bridge/utils/mask-email.util';
import { normalizeBridgeEmbeddingOrigins } from 'src/engine/core-modules/wschat-bridge/utils/normalize-bridge-embedding-origins.util';
import { toBridgeRoleName } from 'src/engine/core-modules/wschat-bridge/utils/to-bridge-role-name.util';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

describe('classifyBridgeSubdomain', () => {
  it('should accept a well-formed free subdomain', () => {
    expect(
      classifyBridgeSubdomain({ subdomain: 'taxi555', reservedByConfig: [] }),
    ).toBe('valid');
  });

  it('should reject a malformed subdomain', () => {
    expect(
      classifyBridgeSubdomain({ subdomain: 'Taxi_555', reservedByConfig: [] }),
    ).toBe('invalid');
  });

  it('should report a subdomain from the shared reserved list', () => {
    expect(
      classifyBridgeSubdomain({ subdomain: 'admin', reservedByConfig: [] }),
    ).toBe('reserved');
  });

  it('should report a subdomain reserved by config, case-insensitively', () => {
    expect(
      classifyBridgeSubdomain({
        subdomain: 'crm',
        reservedByConfig: ['app', 'CRM'],
      }),
    ).toBe('reserved');
  });
});

describe('normalizeBridgeEmbeddingOrigins', () => {
  it('should normalize and deduplicate origins', () => {
    expect(
      normalizeBridgeEmbeddingOrigins([
        'https://wschat.org',
        'https://wschat.org/',
      ]),
    ).toEqual({ kind: 'valid', origins: ['https://wschat.org'] });
  });

  it('should reject an origin with a path', () => {
    expect(normalizeBridgeEmbeddingOrigins(['https://wschat.org/app'])).toEqual(
      { kind: 'invalid', origin: 'https://wschat.org/app' },
    );
  });

  it('should reject more than 20 distinct origins', () => {
    const origins = Array.from(
      { length: 21 },
      (_, index) => `https://site${index}.example.com`,
    );

    expect(normalizeBridgeEmbeddingOrigins(origins)).toEqual({
      kind: 'tooMany',
      count: 21,
    });
  });
});

describe('toBridgeRoleName', () => {
  it('should name the standard roles by universal identifier', () => {
    expect(
      toBridgeRoleName({
        universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
        label: 'Administrateur',
      }),
    ).toBe('admin');
    expect(
      toBridgeRoleName({
        universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
        label: 'Member',
      }),
    ).toBe('member');
  });

  it('should use the label of a custom role and null for no role', () => {
    expect(
      toBridgeRoleName({ universalIdentifier: 'custom', label: 'Sales' }),
    ).toBe('Sales');
    expect(toBridgeRoleName(undefined)).toBeNull();
  });
});

describe('maskEmail', () => {
  it('should keep only the first character and the domain', () => {
    expect(maskEmail('roman@wschat.org')).toBe('r***@wschat.org');
  });
});

describe('mapUpstreamErrorToBridgeError', () => {
  it('should map a taken subdomain to SUBDOMAIN_TAKEN', () => {
    expect(
      mapUpstreamErrorToBridgeError(
        new WorkspaceException(
          'Subdomain already taken',
          WorkspaceExceptionCode.SUBDOMAIN_ALREADY_TAKEN,
        ),
      ),
    ).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Subdomain already taken',
      code: 'SUBDOMAIN_TAKEN',
    });
  });

  it('should return null for an unknown error', () => {
    expect(mapUpstreamErrorToBridgeError(new Error('boom'))).toBeNull();
  });
});
