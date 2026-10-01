// src/config/ranks.js
//
// The rank ladder. "starter" is the floor every student has from day one —
// it needs no configuration and is never sent to the server. The other five
// tiers are earned by meeting admin-configured minimum scores on every
// platform the admin chose to gate that tier on (rankRoutes.js / rank.js).
//
// Ordered lowest to highest — code that walks the ladder (rank.js, the admin
// grid) relies on this order.
import { Shield, Medal, Trophy, Gem, Diamond, Crown } from 'lucide-react';

export const PLATFORMS = [
  { key: 'leetcode', label: 'LeetCode' },
  { key: 'codeforces', label: 'Codeforces' },
  { key: 'atcoder', label: 'AtCoder' },
  { key: 'github', label: 'GitHub' },
  { key: 'hackerrank', label: 'HackerRank' },
  { key: 'hackerearth', label: 'HackerEarth' },
];

export const RANK_TIERS = [
  {
    key: 'starter',
    label: 'Starter',
    symbol: 'Bronze',
    tagline: 'Everyone starts here.',
    icon: Shield,
    configurable: false,
    gradient: 'from-amber-700 via-amber-600 to-amber-800',
    glow: 'rgba(180,83,9,0.45)',
    ring: 'ring-amber-700/40',
    text: 'text-amber-100',
    chip: 'bg-amber-800/20 text-amber-700 border-amber-700/30',
  },
  {
    key: 'contender',
    label: 'Contender',
    symbol: 'Silver',
    tagline: 'Building real momentum.',
    icon: Medal,
    configurable: true,
    gradient: 'from-slate-400 via-slate-300 to-slate-500',
    glow: 'rgba(148,163,184,0.5)',
    ring: 'ring-slate-400/40',
    text: 'text-slate-900',
    chip: 'bg-slate-400/20 text-slate-600 border-slate-400/30',
  },
  {
    key: 'climber',
    label: 'Climber',
    symbol: 'Gold',
    tagline: 'Consistently ahead of the pack.',
    icon: Trophy,
    configurable: true,
    gradient: 'from-yellow-400 via-amber-400 to-yellow-600',
    glow: 'rgba(245,158,11,0.55)',
    ring: 'ring-yellow-500/40',
    text: 'text-yellow-950',
    chip: 'bg-yellow-400/20 text-yellow-700 border-yellow-500/30',
  },
  {
    key: 'challenger',
    label: 'Challenger',
    symbol: 'Platinum',
    tagline: 'Elite, cross-platform strength.',
    icon: Gem,
    configurable: true,
    gradient: 'from-cyan-300 via-teal-300 to-cyan-500',
    glow: 'rgba(45,212,191,0.55)',
    ring: 'ring-cyan-400/40',
    text: 'text-cyan-950',
    chip: 'bg-cyan-400/20 text-cyan-700 border-cyan-500/30',
  },
  {
    key: 'master',
    label: 'Master',
    symbol: 'Diamond',
    tagline: 'A rare, polished competitor.',
    icon: Diamond,
    configurable: true,
    gradient: 'from-blue-400 via-indigo-400 to-blue-600',
    glow: 'rgba(99,102,241,0.6)',
    ring: 'ring-indigo-400/40',
    text: 'text-indigo-50',
    chip: 'bg-indigo-400/20 text-indigo-700 border-indigo-500/30',
  },
  {
    key: 'grandmaster',
    label: 'Grandmaster',
    symbol: 'Apex',
    tagline: 'The summit. Very few reach this.',
    icon: Crown,
    configurable: true,
    gradient: 'from-fuchsia-500 via-rose-500 to-orange-500',
    glow: 'rgba(244,63,94,0.6)',
    ring: 'ring-rose-400/50',
    text: 'text-rose-50',
    chip: 'bg-rose-500/20 text-rose-700 border-rose-500/30',
  },
];

export const CONFIGURABLE_RANKS = RANK_TIERS.filter((r) => r.configurable);

export const rankByKey = (key) => RANK_TIERS.find((r) => r.key === key) || RANK_TIERS[0];
export const rankIndex = (key) => Math.max(0, RANK_TIERS.findIndex((r) => r.key === key));
