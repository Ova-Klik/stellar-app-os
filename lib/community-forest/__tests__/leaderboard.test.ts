import { describe, expect, it } from 'vitest';

import {
  rankCommunityForestSponsors,
  type CommunityForestSponsorContribution,
} from '@/lib/community-forest/leaderboard';

/** Builds a Stellar-looking public key so wallets sort predictably. */
function wallet(character: string): string {
  return `G${character.repeat(55)}`;
}

const WALLET_A = wallet('A');
const WALLET_B = wallet('B');
const WALLET_C = wallet('C');
const WALLET_D = wallet('D');

function contribution(
  sponsorWallet: string,
  treesPlanted: number,
  treesContributed = treesPlanted
): CommunityForestSponsorContribution {
  return { sponsorWallet, treesPlanted, treesContributed };
}

describe('rankCommunityForestSponsors', () => {
  it('ranks sponsors by trees planted, highest first', () => {
    const ranked = rankCommunityForestSponsors([
      contribution(WALLET_A, 3),
      contribution(WALLET_B, 12),
      contribution(WALLET_C, 7),
    ]);

    expect(ranked.map((entry) => entry.sponsorWallet)).toEqual([WALLET_B, WALLET_C, WALLET_A]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('gives tied sponsors the same rank and skips the next rank', () => {
    const ranked = rankCommunityForestSponsors([
      contribution(WALLET_A, 10),
      contribution(WALLET_B, 10),
      contribution(WALLET_C, 4),
    ]);

    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 3]);
    expect(ranked[2].isTied).toBe(false);
    expect(ranked[0].isTied).toBe(true);
    expect(ranked[1].isTied).toBe(true);
  });

  it('lists sponsors without any contribution', () => {
    const ranked = rankCommunityForestSponsors([
      contribution(WALLET_A, 0),
      contribution(WALLET_B, 5),
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked[1]).toMatchObject({
      sponsorWallet: WALLET_A,
      treesPlanted: 0,
      treesContributed: 0,
      rank: 2,
    });
  });

  it('breaks ties on planted trees by trees contributed, then by wallet', () => {
    const ranked = rankCommunityForestSponsors([
      contribution(WALLET_B, 5, 5),
      contribution(WALLET_A, 5, 9),
      contribution(WALLET_C, 5, 5),
    ]);

    // WALLET_A contributed the most trees overall, so it comes first even
    // though all three planted the same number of trees — they share the rank.
    expect(ranked.map((entry) => entry.sponsorWallet)).toEqual([WALLET_A, WALLET_B, WALLET_C]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 1]);
    expect(ranked.every((entry) => entry.isTied)).toBe(true);
  });

  it('normalises invalid counts and never mutates the input', () => {
    const input: CommunityForestSponsorContribution[] = [
      { sponsorWallet: WALLET_D, treesPlanted: -4, treesContributed: Number.NaN },
    ];
    const snapshot = JSON.stringify(input);

    const ranked = rankCommunityForestSponsors(input);

    expect(ranked[0]).toMatchObject({ treesPlanted: 0, treesContributed: 0 });
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('returns an empty board for a project without sponsors', () => {
    expect(rankCommunityForestSponsors([])).toEqual([]);
  });
});
