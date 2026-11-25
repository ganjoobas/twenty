import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WschatBridgeSecretGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-secret.guard';

const VALID_SECRET = 'a'.repeat(32);

const buildMockContext = (headers: Record<string, unknown>) =>
  new ExecutionContextHost([
    { headers, method: 'POST', path: '/wschat-bridge/login-link' },
  ]);

describe('WschatBridgeSecretGuard.canActivate', () => {
  let guard: WschatBridgeSecretGuard;
  let twentyConfigService: TwentyConfigService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WschatBridgeSecretGuard,
        { provide: TwentyConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    guard = module.get(WschatBridgeSecretGuard);
    twentyConfigService = module.get(TwentyConfigService);
  });

  it('should return true when the header matches the secret', () => {
    jest.spyOn(twentyConfigService, 'get').mockReturnValue(VALID_SECRET);

    const context = buildMockContext({
      'x-wschat-bridge-secret': VALID_SECRET,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw NotFoundException when the secret is not configured', () => {
    jest.spyOn(twentyConfigService, 'get').mockReturnValue('');

    const context = buildMockContext({
      'x-wschat-bridge-secret': VALID_SECRET,
    });

    expect(() => guard.canActivate(context)).toThrow(NotFoundException);
  });

  it('should throw NotFoundException when the secret is too short', () => {
    jest.spyOn(twentyConfigService, 'get').mockReturnValue('short-secret');

    const context = buildMockContext({
      'x-wschat-bridge-secret': 'short-secret',
    });

    expect(() => guard.canActivate(context)).toThrow(NotFoundException);
  });

  it('should throw UnauthorizedException when the header is missing', () => {
    jest.spyOn(twentyConfigService, 'get').mockReturnValue(VALID_SECRET);

    const context = buildMockContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when the header is wrong', () => {
    jest.spyOn(twentyConfigService, 'get').mockReturnValue(VALID_SECRET);

    const context = buildMockContext({
      'x-wschat-bridge-secret': 'b'.repeat(32),
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when the header has another length', () => {
    jest.spyOn(twentyConfigService, 'get').mockReturnValue(VALID_SECRET);

    const context = buildMockContext({
      'x-wschat-bridge-secret': `${VALID_SECRET}x`,
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
