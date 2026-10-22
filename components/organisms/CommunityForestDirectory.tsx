'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusCircle, TreePine, Users, Wind } from 'lucide-react';

import { Button } from '@/components/atoms/Button';
import { Skeleton } from '@/components/atoms/Skeleton';
import { listBaseProjects } from '@/lib/community-forest/project-catalogue';
import type { CommunityForestSummary } from '@/lib/community-forest/types';

interface CommunityForestDirectoryProps {
  /** True when the viewer holds the platform admin role. */
  isAdmin: boolean;
}

function formatCo2(kgPerYear: number): string {
  if (!Number.isFinite(kgPerYear) || kgPerYear <= 0) return '0';
  return kgPerYear.toFixed(1);
}

/**
 * Directory of community forest projects with the creation form for platform
 * admins and certified partner organisations (Issue #1646).
 */
export function CommunityForestDirectory({ isAdmin }: CommunityForestDirectoryProps) {
  const baseProjects = listBaseProjects();

  const [projects, setProjects] = useState<CommunityForestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseProjectId, setBaseProjectId] = useState(baseProjects[0]?.id ?? '');
  const [organisationId, setOrganisationId] = useState('');
  const [organisationContactEmail, setOrganisationContactEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/community-forests');
      const result = (await response.json()) as {
        projects?: CommunityForestSummary[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Unable to load community forests');
      setProjects(result.projects ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load community forests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !baseProjectId) return;

    setCreating(true);
    setCreateError(null);
    setCreateMessage(null);
    try {
      const response = await fetch('/api/community-forests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          baseProjectId,
          organisationId: organisationId.trim() || undefined,
          organisationContactEmail: organisationContactEmail.trim() || undefined,
        }),
      });
      const result = (await response.json()) as { error?: string; project?: { id: string } };
      if (!response.ok) throw new Error(result.error ?? 'Unable to create community forest');

      setName('');
      setDescription('');
      setOrganisationId('');
      setOrganisationContactEmail('');
      setCreateMessage('Community forest project created.');
      await load();
    } catch (caught) {
      setCreateError(
        caught instanceof Error ? caught.message : 'Unable to create community forest'
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="community-forest-create-heading"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h2
          id="community-forest-create-heading"
          className="flex items-center gap-2 text-xl font-black text-foreground"
        >
          <PlusCircle className="h-5 w-5 text-stellar-purple" aria-hidden />
          Create a community forest
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? 'Platform admins can create a community forest project directly.'
            : 'Certified partner organisations can create a community forest project by proving their certification.'}
        </p>

        <form onSubmit={createProject} className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="community-forest-name" className="text-sm font-semibold">
              Project name
            </label>
            <input
              id="community-forest-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="Northern Grove"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="community-forest-base-project" className="text-sm font-semibold">
              Platform project
            </label>
            <select
              id="community-forest-base-project"
              value={baseProjectId}
              onChange={(event) => setBaseProjectId(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {baseProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <label htmlFor="community-forest-description" className="text-sm font-semibold">
              Description
            </label>
            <textarea
              id="community-forest-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What is this community forest about?"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {!isAdmin && (
            <>
              <div className="space-y-1">
                <label htmlFor="community-forest-organisation" className="text-sm font-semibold">
                  Partner organisation id
                </label>
                <input
                  id="community-forest-organisation"
                  value={organisationId}
                  onChange={(event) => setOrganisationId(event.target.value)}
                  placeholder="partner-acme"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="community-forest-organisation-email"
                  className="text-sm font-semibold"
                >
                  Partner organisation contact email
                </label>
                <input
                  id="community-forest-organisation-email"
                  type="email"
                  value={organisationContactEmail}
                  onChange={(event) => setOrganisationContactEmail(event.target.value)}
                  placeholder="contact@organisation.org"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

          <div className="md:col-span-2">
            <Button
              type="submit"
              disabled={creating || !name.trim() || !baseProjectId}
              stellar="accent"
            >
              {creating ? 'Creating…' : 'Create community forest'}
            </Button>
          </div>
        </form>

        {createMessage && (
          <p className="mt-4 text-sm text-stellar-green" role="status">
            {createMessage}
          </p>
        )}
        {createError && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {createError}
          </p>
        )}
      </section>

      <section aria-labelledby="community-forest-list-heading">
        <h2 id="community-forest-list-heading" className="text-xl font-black text-foreground">
          Community forests
        </h2>

        {loading ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {error}
          </p>
        ) : projects.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No community forest projects yet. Create the first one to let sponsors pool their
            sponsorship.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <article
                key={project.id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <h3 className="flex items-center gap-2 text-lg font-black text-foreground">
                  <TreePine className="h-5 w-5 text-stellar-green" aria-hidden />
                  {project.name}
                </h3>
                {project.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>
                )}
                {project.baseProject && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Growing from{' '}
                    <Link
                      href={`/projects/${project.baseProject.id}`}
                      className="font-semibold text-stellar-blue underline"
                    >
                      {project.baseProject.name}
                    </Link>
                  </p>
                )}

                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-stellar-green/10 p-3">
                    <dt className="text-xs text-muted-foreground">Trees planted</dt>
                    <dd className="text-xl font-black text-foreground">
                      {project.plantedTrees.toLocaleString()}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-stellar-cyan/10 p-3">
                    <dt className="text-xs text-muted-foreground">kg CO₂/yr</dt>
                    <dd className="text-xl font-black text-foreground">
                      {formatCo2(project.co2KgPerYear)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-stellar-purple/10 p-3">
                    <dt className="text-xs text-muted-foreground">Sponsors</dt>
                    <dd className="text-xl font-black text-foreground">
                      <Users className="mr-1 inline h-4 w-4" aria-hidden />
                      {project.sponsorCount}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {project.milestones.next
                        ? `Next: ${project.milestones.next.title}`
                        : 'All milestones celebrated'}
                    </span>
                    <span>{project.milestones.progressPercent}%</span>
                  </div>
                  <div
                    className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={project.milestones.progressPercent}
                    aria-label={`Progress towards the next milestone for ${project.name}`}
                  >
                    <div
                      className="h-full rounded-full bg-stellar-purple"
                      style={{ width: `${project.milestones.progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-sm">
                  <Link
                    href={`/community-forests/${project.id}`}
                    className="font-semibold text-stellar-blue underline"
                  >
                    Open community forest
                  </Link>
                  <span className="text-muted-foreground">
                    <Wind className="mr-1 inline h-4 w-4" aria-hidden />
                    {project.totalTrees} contributed
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
