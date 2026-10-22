'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, Sparkles, TreePine, Trophy, UserPlus, Users, Wind } from 'lucide-react';

import { Button } from '@/components/atoms/Button';
import { ImpactStatCard } from '@/components/atoms/ImpactStatCard';
import { Skeleton } from '@/components/atoms/Skeleton';
import { useWalletContext } from '@/contexts/WalletContext';
import type {
  CommunityForestDashboard as CommunityForestDashboardData,
  CommunityForestMilestoneCelebration,
} from '@/lib/community-forest/types';

interface CommunityForestDashboardProps {
  projectId: string;
}

function formatCo2(kgPerYear: number): string {
  if (!Number.isFinite(kgPerYear) || kgPerYear <= 0) return '0';
  return kgPerYear.toFixed(1);
}

function shortWallet(wallet: string): string {
  if (wallet.length <= 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/**
 * Collective impact dashboard of a community forest project (Issue #1646).
 *
 * Everything shown here comes from the API, which derives it from the
 * persisted contributions of the project — there are no hard coded totals.
 */
export function CommunityForestDashboard({ projectId }: CommunityForestDashboardProps) {
  const { wallet } = useWalletContext();
  const walletAddress = wallet?.publicKey;

  const [data, setData] = useState<CommunityForestDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [celebrations, setCelebrations] = useState<CommunityForestMilestoneCelebration[]>([]);
  const [treeRef, setTreeRef] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const query = walletAddress ? `?wallet=${encodeURIComponent(walletAddress)}` : '';
      const response = await fetch(
        `/api/community-forests/${encodeURIComponent(projectId)}${query}`
      );
      const result = (await response.json()) as CommunityForestDashboardData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Unable to load community forest');
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load community forest');
    } finally {
      setLoading(false);
    }
  }, [projectId, walletAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  async function joinProject() {
    if (!walletAddress || !data) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/community-forests/${encodeURIComponent(projectId)}/members`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sponsorWallet: walletAddress }),
        }
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Unable to join community forest');
      setMessage('You joined the community forest. Welcome aboard!');
      await load();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to join community forest');
    } finally {
      setBusy(false);
    }
  }

  async function contributeTree(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress || !treeRef.trim()) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/community-forests/${encodeURIComponent(projectId)}/contributions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sponsorWallet: walletAddress, treeRef: treeRef.trim() }),
        }
      );
      const result = (await response.json()) as {
        error?: string;
        celebrated?: CommunityForestMilestoneCelebration[];
      };
      if (!response.ok) throw new Error(result.error ?? 'Unable to contribute tree');

      setTreeRef('');
      setCelebrations(result.celebrated ?? []);
      setMessage(
        result.celebrated?.length
          ? `Tree contributed — ${result.celebrated.map((m) => m.title).join(', ')} celebrated!`
          : 'Tree contributed to the community forest.'
      );
      await load();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to contribute tree');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section
        aria-label="Community forest loading"
        className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section
        role="alert"
        className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      >
        <h2 className="text-lg font-bold">Community forest unavailable</h2>
        <p className="mt-1">{error ?? 'This community forest project could not be loaded.'}</p>
        <Button className="mt-4" variant="outline" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </section>
    );
  }

  const { project, baseProject, impact, members, leaderboard, milestones, viewer } = data;
  const isMember = viewer.isMember;

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="community-forest-heading"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1
              id="community-forest-heading"
              className="flex items-center gap-2 text-2xl font-black text-foreground"
            >
              <TreePine className="h-6 w-6 text-stellar-green" aria-hidden />
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.description}</p>
            )}
            {baseProject && (
              <p className="mt-2 text-xs text-muted-foreground">
                Growing from{' '}
                <Link
                  href={`/projects/${baseProject.id}`}
                  className="font-semibold text-stellar-blue underline"
                >
                  {baseProject.name}
                </Link>{' '}
                · {baseProject.location}
              </p>
            )}
          </div>
          <span className="w-fit rounded-full bg-stellar-green/10 px-3 py-1 text-xs font-semibold capitalize text-stellar-green">
            {project.status}
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ImpactStatCard
            label="Trees planted"
            value={impact.plantedTrees.toLocaleString()}
            icon={<TreePine className="h-5 w-5 text-stellar-green" aria-hidden />}
          />
          <ImpactStatCard
            label="CO₂ sequestered per year (kg)"
            value={formatCo2(impact.co2KgPerYear)}
            icon={<Wind className="h-5 w-5 text-stellar-cyan" aria-hidden />}
          />
          <ImpactStatCard
            label="Sponsors taking part"
            value={impact.sponsorCount.toLocaleString()}
            icon={<Users className="h-5 w-5 text-stellar-purple" aria-hidden />}
          />
          <ImpactStatCard
            label="Trees contributed"
            value={impact.totalTrees.toLocaleString()}
            icon={<Award className="h-5 w-5 text-stellar-blue" aria-hidden />}
          />
        </div>
      </section>

      <section
        aria-labelledby="community-forest-milestones"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h2
          id="community-forest-milestones"
          className="flex items-center gap-2 text-lg font-black text-foreground"
        >
          <Sparkles className="h-5 w-5 text-stellar-purple" aria-hidden />
          Milestones
        </h2>

        {milestones.next ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-foreground">
                Next milestone: {milestones.next.title}
              </span>
              <span className="text-muted-foreground">
                {milestones.treesToNext.toLocaleString()} trees to go · {milestones.progressPercent}
                %
              </span>
            </div>
            <div
              className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={milestones.progressPercent}
              aria-label={`Progress towards ${milestones.next.title}`}
            >
              <div
                className="h-full rounded-full bg-stellar-purple"
                style={{ width: `${milestones.progressPercent}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Every configured milestone has been celebrated — the project has planted{' '}
            {impact.plantedTrees.toLocaleString()} trees.
          </p>
        )}

        {celebrations.length > 0 && (
          <ul className="mt-4 space-y-2" role="status" aria-live="polite">
            {celebrations.map((milestone) => (
              <li
                key={milestone.thresholdTrees}
                className="rounded-xl bg-stellar-purple/10 px-4 py-3 text-sm text-stellar-purple"
              >
                🎉 {milestone.title} — celebrated with{' '}
                {milestone.treesAtCelebration.toLocaleString()} trees planted.
              </li>
            ))}
          </ul>
        )}

        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {milestones.thresholds.map((threshold) => {
            const celebrated = milestones.celebrated.some(
              (milestone) => milestone.thresholdTrees === threshold.thresholdTrees
            );
            return (
              <li key={threshold.thresholdTrees} className="flex items-center gap-2">
                <span aria-hidden>{celebrated ? '✅' : '⬜'}</span>
                <span className={celebrated ? 'font-semibold text-foreground' : undefined}>
                  {threshold.title}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="community-forest-leaderboard"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h2
          id="community-forest-leaderboard"
          className="flex items-center gap-2 text-lg font-black text-foreground"
        >
          <Trophy className="h-5 w-5 text-stellar-blue" aria-hidden />
          Group leaderboard
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ranked by trees planted in this community forest. Sponsors with the same number of planted
          trees share a rank.
        </p>

        {leaderboard.entries.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No sponsors have joined this community forest yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3">
                    Rank
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Sponsor
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Trees planted
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Trees contributed
                  </th>
                  <th scope="col" className="py-2">
                    CO₂ kg/yr
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.entries.map((entry) => (
                  <tr
                    key={entry.sponsorWallet}
                    className="border-t border-border/60 text-foreground"
                  >
                    <td className="py-2 pr-3 font-bold">
                      #{entry.rank}
                      {entry.isTied && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">tied</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-semibold">
                        {entry.displayName ?? shortWallet(entry.sponsorWallet)}
                      </span>
                      {entry.displayName && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {shortWallet(entry.sponsorWallet)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{entry.treesPlanted}</td>
                    <td className="py-2 pr-3">{entry.treesContributed}</td>
                    <td className="py-2">{formatCo2(entry.co2KgPerYear)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        aria-labelledby="community-forest-sponsors"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h2
          id="community-forest-sponsors"
          className="flex items-center gap-2 text-lg font-black text-foreground"
        >
          <Users className="h-5 w-5 text-stellar-purple" aria-hidden />
          Participating sponsors
        </h2>

        {members.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No sponsors have joined this community forest yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {members.map((member) => (
              <li
                key={member.sponsorWallet}
                className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-foreground">
                  {member.displayName ?? shortWallet(member.sponsorWallet)}
                </span>
                <span className="text-xs text-muted-foreground">{member.role}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 space-y-3 border-t border-border/60 pt-4">
          {!walletAddress ? (
            <p className="text-sm text-muted-foreground">
              Connect your wallet to join this community forest and contribute trees.
            </p>
          ) : isMember ? (
            <>
              <p className="text-sm text-muted-foreground">
                You are taking part in this community forest. Contribute a tree you funded to add it
                to the collective impact.
              </p>
              <form onSubmit={contributeTree} className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="community-forest-tree-ref" className="sr-only">
                  Tree reference
                </label>
                <input
                  id="community-forest-tree-ref"
                  value={treeRef}
                  onChange={(event) => setTreeRef(event.target.value)}
                  placeholder="Tree reference, e.g. HRV-2024-0001"
                  className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <Button type="submit" disabled={busy || !treeRef.trim()} stellar="success">
                  Contribute tree
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Join this community forest to pool your sponsorship with the other sponsors.
              </p>
              <Button
                type="button"
                onClick={() => void joinProject()}
                disabled={busy}
                stellar="accent"
              >
                <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                Join community forest
              </Button>
            </>
          )}
        </div>

        {message && (
          <p className="mt-4 text-sm text-stellar-green" role="status">
            {message}
          </p>
        )}
        {actionError && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {actionError}
          </p>
        )}
      </section>
    </div>
  );
}
