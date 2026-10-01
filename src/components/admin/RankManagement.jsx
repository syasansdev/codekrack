// src/components/admin/RankManagement.jsx
//
// Admin screen for configuring the rank ladder (Contender -> Grandmaster).
// For each tier, the admin sets a minimum score per platform; a student only
// earns that tier once every platform the admin gave a non-zero minimum to
// is met (rank.js computeRank — the exact mirror of this grid). "Starter" is
// the floor everyone has and isn't editable here.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Save, RotateCcw, Sparkles } from 'lucide-react';
import { CONFIGURABLE_RANKS, RANK_TIERS, PLATFORMS } from '../../config/ranks';
import { useAdminScope } from '../../hooks/useAdminScope';
import { useInstitutions } from '../../hooks/queries/useInstitutions';
import { useRankThresholds, useUpdateRankThresholds } from '../../hooks/queries/useRanks';

const emptyGrid = () => {
  const grid = {};
  for (const rank of CONFIGURABLE_RANKS) {
    grid[rank.key] = {};
    for (const platform of PLATFORMS) grid[rank.key][platform.key] = 0;
  }
  return grid;
};

const gridFromThresholds = (thresholds = []) => {
  const grid = emptyGrid();
  for (const t of thresholds) {
    if (grid[t.rankKey] && t.platform in grid[t.rankKey]) {
      grid[t.rankKey][t.platform] = t.minScore;
    }
  }
  return grid;
};

const flattenGrid = (grid) => {
  const out = [];
  for (const rank of CONFIGURABLE_RANKS) {
    for (const platform of PLATFORMS) {
      out.push({ rankKey: rank.key, platform: platform.key, minScore: Number(grid[rank.key][platform.key]) || 0 });
    }
  }
  return out;
};

const RankManagement = () => {
  const { isSuperAdmin, institutionId: scopedInstitutionId } = useAdminScope();
  const { data: institutions = [] } = useInstitutions({ enabled: isSuperAdmin });
  const [pickedInstitutionId, setPickedInstitutionId] = useState('');

  useEffect(() => {
    if (isSuperAdmin && !pickedInstitutionId && institutions.length > 0) {
      setPickedInstitutionId(institutions[0].id);
    }
  }, [isSuperAdmin, institutions, pickedInstitutionId]);

  const institutionId = isSuperAdmin ? pickedInstitutionId : scopedInstitutionId;

  const { data: thresholds, isLoading } = useRankThresholds({
    institutionId,
    enabled: Boolean(institutionId),
  });
  const updateMutation = useUpdateRankThresholds();

  const [grid, setGrid] = useState(emptyGrid());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (thresholds) {
      setGrid(gridFromThresholds(thresholds));
      setDirty(false);
    }
  }, [thresholds, institutionId]);

  const setCell = (rankKey, platformKey, value) => {
    const numeric = value === '' ? 0 : Math.max(0, Math.floor(Number(value) || 0));
    setGrid((prev) => ({ ...prev, [rankKey]: { ...prev[rankKey], [platformKey]: numeric } }));
    setDirty(true);
  };

  const handleReset = () => {
    setGrid(gridFromThresholds(thresholds || []));
    setDirty(false);
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ institutionId, thresholds: flattenGrid(grid) });
      toast.success('Rank thresholds saved');
      setDirty(false);
    } catch (e) {
      toast.error(e.message || 'Could not save rank thresholds');
    }
  };

  const StarterIcon = RANK_TIERS[0].icon;

  const configuredCount = useMemo(
    () =>
      CONFIGURABLE_RANKS.reduce(
        (acc, rank) => acc + (Object.values(grid[rank.key] || {}).some((v) => v > 0) ? 1 : 0),
        0
      ),
    [grid]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-fg flex items-center gap-2">
            <Sparkles size={20} className="text-brand-500" />
            Rank Tiers
          </h2>
          <p className="mt-1 text-sm text-fg-subtle max-w-2xl">
            Set the minimum score a student needs on each platform to earn a tier. A tier is
            awarded once every platform you give a value above zero is met. Leave a platform at 0
            to ignore it for that tier. Every student starts at <strong>Starter</strong> — nothing
            to configure there.
          </p>
        </div>

        {isSuperAdmin && (
          <select
            value={pickedInstitutionId}
            onChange={(e) => setPickedInstitutionId(e.target.value)}
            className="rounded-xl border border-edge bg-surface px-3 py-2 text-sm font-medium text-fg shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!institutionId ? (
        <div className="rounded-2xl border border-edge bg-surface p-8 text-center text-sm text-fg-subtle">
          {isSuperAdmin ? 'Pick an institution to configure its rank tiers.' : 'No institution found.'}
        </div>
      ) : isLoading ? (
        <div className="rounded-2xl border border-edge bg-surface p-8 text-center text-sm text-fg-subtle">
          Loading rank thresholds...
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-edge bg-surface shadow-sm">
            <table className="min-w-full divide-y divide-edge text-sm">
              <thead className="bg-surface-2">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-fg-subtle uppercase tracking-wide text-xs">
                    Rank
                  </th>
                  {PLATFORMS.map((p) => (
                    <th key={p.key} className="px-4 py-3 text-left font-semibold text-fg-subtle uppercase tracking-wide text-xs">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                <tr className="bg-surface-2/40">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-fg">
                      <StarterIcon size={16} className="text-amber-700" />
                      Starter
                    </span>
                  </td>
                  <td colSpan={PLATFORMS.length} className="px-4 py-3 text-xs text-fg-subtle italic">
                    Default for every student — no minimums required.
                  </td>
                </tr>
                {CONFIGURABLE_RANKS.map((rank) => {
                  const Icon = rank.icon;
                  return (
                    <tr key={rank.key} className="hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${rank.chip}`}>
                          <Icon size={14} />
                          {rank.label}
                          <span className="opacity-70">· {rank.symbol}</span>
                        </span>
                      </td>
                      {PLATFORMS.map((platform) => (
                        <td key={platform.key} className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            value={grid[rank.key]?.[platform.key] ?? 0}
                            onChange={(e) => setCell(rank.key, platform.key, e.target.value)}
                            className="w-24 rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-fg-subtle">
              {configuredCount} of {CONFIGURABLE_RANKS.length} tiers have at least one threshold set.
              An unconfigured tier can't be earned yet.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={!dirty || updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl border border-edge bg-surface px-4 py-2 text-sm font-medium text-fg-muted hover:bg-surface-3 disabled:opacity-40"
              >
                <RotateCcw size={15} />
                Reset
              </button>
              <motion.button
                type="button"
                onClick={handleSave}
                disabled={!dirty || updateMutation.isPending}
                whileHover={{ scale: dirty ? 1.02 : 1 }}
                whileTap={{ scale: dirty ? 0.98 : 1 }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                <Save size={15} />
                {updateMutation.isPending ? 'Saving...' : 'Save thresholds'}
              </motion.button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default RankManagement;
