import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { useWalletContext } = vi.hoisted(() => ({ useWalletContext: vi.fn() }));

vi.mock('@/contexts/WalletContext', () => ({ useWalletContext }));

import { CommunityForestDashboard } from '@/components/organisms/CommunityForestDashboard';

const SPONSOR_WALLET = `G${'A'.repeat(55)}`;

const DASHBOARD = {
  project: {
    id: '1',
    name: 'Northern Grove',
    description: 'A shared grove',
    baseProjectId: 'proj-001',
    createdByKind: 'organisation',
    createdById: 'partner-acme',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  baseProject: {
    id: 'proj-001',
    name: 'Amazon Rainforest Reforestation',
    description: 'Base project',
    type: 'reforestation',
    location: 'Amazonas, Brazil',
    country: 'BR',
    verificationStatus: 'verified',
  },
  impact: {
    totalTrees: 12,
    plantedTrees: 10,
    fundedTrees: 2,
    co2KgPerYear: 220,
    sponsorCount: 2,
  },
  members: [
    {
      sponsorWallet: SPONSOR_WALLET,
      displayName: 'Ada',
      role: 'sponsor',
      joinedAt: '2026-01-02T00:00:00.000Z',
    },
  ],
  leaderboard: {
    metric: 'trees_planted',
    entries: [
      {
        rank: 1,
        sponsorWallet: SPONSOR_WALLET,
        displayName: 'Ada',
        treesPlanted: 6,
        treesContributed: 8,
        co2KgPerYear: 132,
        isTied: false,
      },
      {
        rank: 2,
        sponsorWallet: `G${'B'.repeat(55)}`,
        displayName: null,
        treesPlanted: 4,
        treesContributed: 4,
        co2KgPerYear: 88,
        isTied: false,
      },
    ],
  },
  milestones: {
    thresholds: [
      { thresholdTrees: 100, title: '100 trees planted' },
      { thresholdTrees: 500, title: '500 trees planted' },
    ],
    celebrated: [],
    next: { thresholdTrees: 100, title: '100 trees planted' },
    treesToNext: 90,
    progressPercent: 10,
  },
  viewer: {
    sponsorWallet: null,
    isMember: false,
  },
};

function mockFetchOnce(payload: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(payload),
    })
  );
}

describe('CommunityForestDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWalletContext.mockReturnValue({ wallet: null });
  });

  it('shows the collective impact of the project', async () => {
    mockFetchOnce(DASHBOARD);

    render(<CommunityForestDashboard projectId="1" />);

    await waitFor(() => {
      expect(screen.getByText('Northern Grove')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Trees planted').length).toBeGreaterThan(0);
    expect(screen.getByText('220.0')).toBeInTheDocument();
    expect(screen.getByText('Amazon Rainforest Reforestation')).toBeInTheDocument();
  });

  it('lists the group leaderboard', async () => {
    mockFetchOnce(DASHBOARD);

    render(<CommunityForestDashboard projectId="1" />);

    await waitFor(() => {
      expect(screen.getByText('Group leaderboard')).toBeInTheDocument();
    });

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getAllByText('Ada').length).toBeGreaterThan(0);
  });

  it('offers to join the project when the wallet is not connected', async () => {
    mockFetchOnce(DASHBOARD);

    render(<CommunityForestDashboard projectId="1" />);

    await waitFor(() => {
      expect(
        screen.getByText(/Connect your wallet to join this community forest/)
      ).toBeInTheDocument();
    });
  });

  it('offers to join the project when the viewer is not a member yet', async () => {
    useWalletContext.mockReturnValue({
      wallet: { publicKey: SPONSOR_WALLET },
    });
    mockFetchOnce(DASHBOARD);

    render(<CommunityForestDashboard projectId="1" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Join community forest/ })).toBeInTheDocument();
    });
  });

  it('shows the milestone progress and the next milestone', async () => {
    mockFetchOnce(DASHBOARD);

    render(<CommunityForestDashboard projectId="1" />);

    await waitFor(() => {
      expect(screen.getByText('Milestones')).toBeInTheDocument();
    });

    expect(screen.getByText(/Next milestone: 100 trees planted/)).toBeInTheDocument();
  });

  it('shows an error when the project cannot be loaded', async () => {
    mockFetchOnce({ error: 'Community forest project not found' }, false);

    render(<CommunityForestDashboard projectId="1" />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Community forest unavailable');
    });
  });
});
