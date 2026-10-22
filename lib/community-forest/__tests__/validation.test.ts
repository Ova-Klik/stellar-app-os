import { describe, expect, it } from 'vitest';

import {
  CommunityForestError,
  isValidSponsorWallet,
  parseContributeCommunityForestInput,
  parseCreateCommunityForestInput,
  parseJoinCommunityForestInput,
} from '@/lib/community-forest/validation';

const VALID_WALLET = `G${'A'.repeat(55)}`;

describe('community forest validation', () => {
  it('recognises Stellar public keys', () => {
    expect(isValidSponsorWallet(VALID_WALLET)).toBe(true);
    expect(isValidSponsorWallet(` ${VALID_WALLET} `)).toBe(true);
    expect(isValidSponsorWallet('not-a-wallet')).toBe(false);
    expect(isValidSponsorWallet(`G${'A'.repeat(54)}`)).toBe(false);
    expect(isValidSponsorWallet(`G${'0'.repeat(55)}`)).toBe(false);
  });

  describe('parseCreateCommunityForestInput', () => {
    it('normalises a valid payload', () => {
      const input = parseCreateCommunityForestInput({
        name: '  Northern Grove  ',
        description: '  A community grove  ',
        baseProjectId: 'proj-001',
        ownerWallet: VALID_WALLET,
      });

      expect(input).toMatchObject({
        name: 'Northern Grove',
        description: 'A community grove',
        baseProjectId: 'proj-001',
        ownerWallet: VALID_WALLET,
      });
    });

    it('accepts an admin slug as the base project', () => {
      const input = parseCreateCommunityForestInput({
        name: 'Northern Grove',
        baseProjectId: 'amazon-rainforest-reforestation',
      });

      expect(input.baseProjectId).toBe('amazon-rainforest-reforestation');
    });

    it('requires a name', () => {
      expect(() => parseCreateCommunityForestInput({ baseProjectId: 'proj-001' })).toThrow(
        CommunityForestError
      );
    });

    it('rejects a name that is too short', () => {
      expect(() =>
        parseCreateCommunityForestInput({ name: 'a', baseProjectId: 'proj-001' })
      ).toThrow(/at least 2 characters/);
    });

    it('rejects an unknown base project', () => {
      expect(() =>
        parseCreateCommunityForestInput({ name: 'Grove', baseProjectId: 'proj-does-not-exist' })
      ).toThrow(/Unknown base project/);
    });

    it('rejects an invalid owner wallet', () => {
      expect(() =>
        parseCreateCommunityForestInput({
          name: 'Grove',
          baseProjectId: 'proj-001',
          ownerWallet: 'nope',
        })
      ).toThrow(/valid Stellar address/);
    });

    it('rejects a non-string name', () => {
      expect(() =>
        parseCreateCommunityForestInput({ name: 42, baseProjectId: 'proj-001' })
      ).toThrow(/must be a string/);
    });
  });

  describe('parseJoinCommunityForestInput', () => {
    it('requires a sponsor wallet', () => {
      expect(() => parseJoinCommunityForestInput({})).toThrow(/sponsorWallet is required/);
    });

    it('rejects an invalid sponsor wallet', () => {
      expect(() => parseJoinCommunityForestInput({ sponsorWallet: 'GBAD' })).toThrow(
        /valid Stellar address/
      );
    });

    it('keeps the display name when one is given', () => {
      const input = parseJoinCommunityForestInput({
        sponsorWallet: VALID_WALLET,
        displayName: '  Ada  ',
      });

      expect(input).toEqual({ sponsorWallet: VALID_WALLET, displayName: 'Ada' });
    });
  });

  describe('parseContributeCommunityForestInput', () => {
    it('requires a sponsor wallet and a tree reference', () => {
      expect(() => parseContributeCommunityForestInput({ treeRef: 'HRV-1' })).toThrow(
        /sponsorWallet is required/
      );
      expect(() => parseContributeCommunityForestInput({ sponsorWallet: VALID_WALLET })).toThrow(
        /treeRef is required/
      );
    });

    it('returns both values', () => {
      const input = parseContributeCommunityForestInput({
        sponsorWallet: VALID_WALLET,
        treeRef: '  HRV-2024-0001  ',
      });

      expect(input).toEqual({ sponsorWallet: VALID_WALLET, treeRef: 'HRV-2024-0001' });
    });
  });
});
