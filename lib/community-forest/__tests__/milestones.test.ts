import { describe, expect, it } from 'vitest';

import {
  buildMilestoneProgress,
  COMMUNITY_FOREST_MILESTONE_THRESHOLDS,
  getNextMilestoneThreshold,
  getReachedMilestoneThresholds,
  getUncelebratedMilestoneThresholds,
  PLANTED_TREE_STATUSES,
} from '@/lib/community-forest/milestones';
import type { CommunityForestMilestoneCelebration } from '@/lib/community-forest/types';

function celebration(thresholdTrees: number, treesAtCelebration = thresholdTrees) {
  return {
    thresholdTrees,
    title: `${thresholdTrees} trees planted`,
    treesAtCelebration,
    celebratedAt: '2026-01-01T00:00:00.000Z',
  } satisfies CommunityForestMilestoneCelebration;
}

describe('community forest milestones', () => {
  it('only counts trees that are in the ground', () => {
    expect(PLANTED_TREE_STATUSES).toContain('planted');
    expect(PLANTED_TREE_STATUSES).toContain('verified');
    expect(PLANTED_TREE_STATUSES).toContain('completed');
    expect(PLANTED_TREE_STATUSES).not.toContain('funded');
    expect(PLANTED_TREE_STATUSES).not.toContain('failed');
  });

  it('returns every threshold the project has reached', () => {
    expect(getReachedMilestoneThresholds(0)).toEqual([]);
    expect(getReachedMilestoneThresholds(99)).toEqual([]);
    expect(getReachedMilestoneThresholds(100)).toEqual([COMMUNITY_FOREST_MILESTONE_THRESHOLDS[0]]);
    expect(getReachedMilestoneThresholds(600)).toHaveLength(2);
  });

  it('excludes thresholds that were already celebrated', () => {
    const pending = getUncelebratedMilestoneThresholds(600, [100, 500]);

    expect(pending).toEqual([]);
  });

  it('returns every threshold crossed at once, lowest first', () => {
    const pending = getUncelebratedMilestoneThresholds(1200, []);

    expect(pending.map((threshold) => threshold.thresholdTrees)).toEqual([100, 500, 1000]);
  });

  it('never skips a threshold that was not celebrated yet', () => {
    // 1,200 trees were planted but only the first milestone was celebrated:
    // the two remaining ones still have to be celebrated.
    const pending = getUncelebratedMilestoneThresholds(1200, [100]);

    expect(pending.map((threshold) => threshold.thresholdTrees)).toEqual([500, 1000]);
  });

  it('finds the next milestone that still has to be celebrated', () => {
    expect(getNextMilestoneThreshold(0, [])).toMatchObject({ thresholdTrees: 100 });
    expect(getNextMilestoneThreshold(120, [100])).toMatchObject({ thresholdTrees: 500 });
    expect(getNextMilestoneThreshold(12000, [])).toBeNull();
  });

  it('builds the dashboard progress towards the next milestone', () => {
    const progress = buildMilestoneProgress(250, []);

    expect(progress.next).toMatchObject({ thresholdTrees: 500 });
    expect(progress.treesToNext).toBe(250);
    // 150 of the 400 trees between the 100 and the 500 milestone.
    expect(progress.progressPercent).toBe(38);
    expect(progress.thresholds).toHaveLength(COMMUNITY_FOREST_MILESTONE_THRESHOLDS.length);
  });

  it('reports a completed ladder when every threshold is celebrated', () => {
    const celebrated = COMMUNITY_FOREST_MILESTONE_THRESHOLDS.map((threshold) =>
      celebration(threshold.thresholdTrees)
    );

    const progress = buildMilestoneProgress(12_000, celebrated);

    expect(progress.next).toBeNull();
    expect(progress.treesToNext).toBe(0);
    expect(progress.progressPercent).toBe(100);
    expect(progress.celebrated).toHaveLength(celebrated.length);
  });

  it('lists the celebrated milestones from the highest threshold down', () => {
    const progress = buildMilestoneProgress(1200, [celebration(100), celebration(500)]);

    expect(progress.celebrated.map((milestone) => milestone.thresholdTrees)).toEqual([500, 100]);
  });
});
