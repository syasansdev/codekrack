import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMyProfile } from '../hooks/queries/useStudents';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { 
  Award, 
  Lock, 
  CheckCircle2, 
  Share2, 
  Download, 
  Layers,
  Flame
} from 'lucide-react';

// Platform series badge definitions
const BADGES_CONFIG = [
  // LeetCode Series
  {
    id: 'lc_novice',
    series: 'leetcode',
    title: 'LeetCode Novice',
    threshold: 10,
    platform: 'LeetCode',
    description: 'Began the journey on LeetCode. Solved the first 10 foundational coding problems.',
    congrats: 'Congratulations! You have taken your first steps into algorithmic mastery on LeetCode. Keep building the momentum!',
    color: 'from-amber-400 to-amber-600',
    iconBg: '#FFFBEB',
    textColor: 'text-amber-600'
  },
  {
    id: 'lc_specialist',
    series: 'leetcode',
    title: 'LeetCode Specialist',
    threshold: 100,
    platform: 'LeetCode',
    description: 'Consistent problem solving on LeetCode. Solved 100 problems, demonstrating capability in basic patterns.',
    congrats: 'Incredible consistency! Solving 100 problems on LeetCode places you well ahead in pattern recognition and complexity awareness. Outstanding job!',
    color: 'from-orange-400 to-orange-600',
    iconBg: '#FFF7ED',
    textColor: 'text-orange-600'
  },
  {
    id: 'lc_master',
    series: 'leetcode',
    title: 'LeetCode Master',
    threshold: 250,
    platform: 'LeetCode',
    description: 'Expert algorithm design on LeetCode. Solved 250 problems across easy, medium, and hard difficulty tiers.',
    congrats: 'Superb achievement! 250 LeetCode problems solved shows advanced programming proficiency, standard technical interview readiness, and core algorithm design fluency.',
    color: 'from-yellow-400 via-orange-500 to-red-600',
    iconBg: '#FEF3C7',
    textColor: 'text-yellow-600'
  },

  // Codeforces Series
  {
    id: 'cf_challenger',
    series: 'codeforces',
    title: 'Codeforces Challenger',
    threshold: 10,
    platform: 'Codeforces',
    description: 'Dived into competitive programming on Codeforces. Solved 10 contest problems.',
    congrats: 'Welcome to the arena! You solved your first 10 competitive coding problems under strict Codeforces contest parameters. A great start!',
    color: 'from-blue-400 to-blue-600',
    iconBg: '#EFF6FF',
    textColor: 'text-blue-600'
  },
  {
    id: 'cf_expert',
    series: 'codeforces',
    title: 'Codeforces Expert',
    threshold: 50,
    platform: 'Codeforces',
    description: 'Strong performance on Codeforces. Solved 50 competitive programming problems.',
    congrats: 'Superb progress! Solving 50 problems on Codeforces is a testament to your capability in dynamic programming, greedy strategies, and number theory.',
    color: 'from-indigo-500 to-purple-600',
    iconBg: '#EEF2FF',
    textColor: 'text-indigo-600'
  },
  {
    id: 'cf_grandmaster',
    series: 'codeforces',
    title: 'CF Grandmaster Rank',
    threshold: 150,
    platform: 'Codeforces',
    description: 'Elite competitive programming rank. Solved 150 strict competitive programming problems.',
    congrats: 'Sensational milestone! Solving 150 problems on Codeforces is a rare feat, demonstrating highly refined algorithmic speed, system design thinking, and mathematical precision.',
    color: 'from-red-500 via-pink-500 to-purple-700',
    iconBg: '#FCE7F3',
    textColor: 'text-red-600'
  },

  // AtCoder Series
  {
    id: 'ac_beginner',
    series: 'atcoder',
    title: 'AtCoder Beginner',
    threshold: 10,
    platform: 'AtCoder',
    description: 'Initiated Japanese programming contest challenges. Solved 10 AtCoder tasks.',
    congrats: 'Well done! Solving 10 AtCoder tasks is the first milestone in conquering highly mathematical and conceptual competitive programming sets.',
    color: 'from-teal-400 to-emerald-600',
    iconBg: '#F0FDF4',
    textColor: 'text-teal-600'
  },
  {
    id: 'ac_samurai',
    series: 'atcoder',
    title: 'AtCoder Samurai',
    threshold: 50,
    platform: 'AtCoder',
    description: 'Mastered mathematical programming challenges. Solved 50 AtCoder tasks.',
    congrats: 'Outstanding achievement! Solved 50 tasks on AtCoder, confirming your strong grip on graph theory, prefix sums, and coordinate compression algorithms.',
    color: 'from-cyan-400 to-blue-600',
    iconBg: '#ECFEFF',
    textColor: 'text-cyan-600'
  },

  // General & GitHub Series
  {
    id: 'ck_pioneer',
    series: 'general',
    title: 'CodeKrack Pioneer',
    threshold: 100,
    platform: 'Combined Platforms',
    description: 'Accumulated 100 total solved problems across LeetCode, Codeforces, and AtCoder.',
    congrats: 'A centurion coder! You have solved 100 coding problems across your unified competitive profiles. You are a true CodeKrack pioneer!',
    color: 'from-blue-600 via-indigo-600 to-orange-500',
    iconBg: '#F3E8FF',
    textColor: 'text-indigo-700'
  },
  {
    id: 'gh_contributor',
    series: 'github',
    title: 'Open Source Contributor',
    threshold: 5,
    platform: 'GitHub',
    description: 'Connected and published active software repositories on GitHub. Has at least 5 repositories.',
    congrats: 'Excellent work! By maintaining 5+ active repositories on GitHub, you show project-building commitment and open-source contribution readiness.',
    color: 'from-slate-700 to-slate-900',
    iconBg: '#F1F5F9',
    textColor: 'text-slate-700'
  }
];

const AchievementsPage = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const { data: profile, isLoading: queryLoading } = useMyProfile();
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [posterGenerating, setPosterGenerating] = useState(false);
  const [posterUrl, setPosterUrl] = useState('');

  // Derived student data
  const studentStats = useMemo(() => {
    if (!profile) return { leetcode: 0, codeforces: 0, atcoder: 0, github: 0, combined: 0 };
    const p = profile.platformData || {};
    const lc = p.leetcode?.totalSolved || 0;
    const cf = p.codeforces?.problemsSolved || 0;
    const ac = p.atcoder?.problemsSolved || 0;
    const gh = p.github?.repositories || 0;
    return {
      leetcode: lc,
      codeforces: cf,
      atcoder: ac,
      github: gh,
      combined: lc + cf + ac
    };
  }, [profile]);

  // Compute status and progress for all badges
  const badgesList = useMemo(() => {
    // Group configs by series to calculate sequence unlocks
    const seriesGroups = {};
    BADGES_CONFIG.forEach(b => {
      if (!seriesGroups[b.series]) seriesGroups[b.series] = [];
      seriesGroups[b.series].push(b);
    });

    const calculatedBadges = [];

    Object.keys(seriesGroups).forEach(seriesKey => {
      // Sort by threshold to ensure sequence
      const group = seriesGroups[seriesKey].sort((a, b) => a.threshold - b.threshold);
      let precedingUnlocked = true;

      group.forEach((badge, index) => {
        // Resolve metric value
        let currentVal = 0;
        if (badge.series === 'leetcode') currentVal = studentStats.leetcode;
        else if (badge.series === 'codeforces') currentVal = studentStats.codeforces;
        else if (badge.series === 'atcoder') currentVal = studentStats.atcoder;
        else if (badge.series === 'github') currentVal = studentStats.github;
        else if (badge.series === 'general') currentVal = studentStats.combined;

        const isUnlocked = currentVal >= badge.threshold;
        let badgeStatus = 'locked';

        if (isUnlocked) {
          badgeStatus = 'unlocked';
        } else if (precedingUnlocked) {
          // If preceding badges are unlocked but this isn't, it is currently "In Progress"
          badgeStatus = 'in-progress';
          precedingUnlocked = false; // subsequent ones are locked
        } else {
          badgeStatus = 'locked';
        }

        calculatedBadges.push({
          ...badge,
          status: badgeStatus,
          currentValue: currentVal,
          progressPercent: Math.min(Math.round((currentVal / badge.threshold) * 100), 100)
        });

        // Set preceding status for next iteration
        if (!isUnlocked) precedingUnlocked = false;
      });
    });

    return calculatedBadges;
  }, [studentStats]);

  // Handle poster generation using HTML5 canvas
  const generatePoster = async (badge) => {
    if (!badge) return;
    setPosterGenerating(true);
    setPosterUrl('');
    setShowPosterModal(true);

    // Give state time to render canvas element
    setTimeout(async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // 1. Setup Canvas Dimensions (1080x1080 Social Poster Ratio)
        canvas.width = 1080;
        canvas.height = 1080;

        // 2. Draw Premium Deep Navy and Royal Blue Gradient Background
        const bgGrad = ctx.createRadialGradient(540, 540, 100, 540, 540, 700);
        bgGrad.addColorStop(0, '#0f172a'); // slate-900
        bgGrad.addColorStop(1, '#020617'); // slate-950
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1080, 1080);

        // Decorative Brand Mesh Overlay (Soft Cyan & Orange Globs)
        ctx.save();
        ctx.globalAlpha = 0.15;
        const orangeGrad = ctx.createRadialGradient(1000, 100, 50, 1000, 100, 400);
        orangeGrad.addColorStop(0, '#ff6a13');
        orangeGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = orangeGrad;
        ctx.beginPath();
        ctx.arc(1000, 100, 400, 0, Math.PI * 2);
        ctx.fill();

        const blueGrad = ctx.createRadialGradient(100, 900, 50, 100, 900, 550);
        blueGrad.addColorStop(0, '#2547eb');
        blueGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = blueGrad;
        ctx.beginPath();
        ctx.arc(100, 900, 550, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 3. Draw Outer Gold Border Frame
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.lineWidth = 8;
        ctx.strokeRect(30, 30, 1020, 1020);

        ctx.strokeStyle = 'rgba(251, 191, 36, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(45, 45, 990, 990);

        // 4. Load & Draw CodeKrack Official Logo Image
        const logoImg = new Image();
        logoImg.src = '/Codekrack - Big.jpg';
        await new Promise((resolve) => {
          logoImg.onload = resolve;
          logoImg.onerror = resolve; // Continue even if logo fails
        });

        if (logoImg.complete && logoImg.width > 0) {
          // Draw CodeKrack logo centered in top section
          const logoHeight = 70;
          const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
          ctx.drawImage(logoImg, 540 - logoWidth / 2, 85, logoWidth, logoHeight);
        } else {
          // Fallback Brand text if image loads error
          ctx.font = 'bold 36px sans-serif';
          ctx.fillStyle = '#2547eb';
          ctx.textAlign = 'center';
          ctx.fillText('CodeKrack', 540, 120);
        }

        // Draw "A product of SYASAN'S CAREER ANALYTICS"
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('A PRODUCT OF SYASAN\'S CAREER ANALYTICS', 540, 185);

        // 5. Draw Decorative Banner / Badge Header
        ctx.font = '900 16px sans-serif';
        ctx.fillStyle = '#fbbf24'; // Amber
        ctx.textAlign = 'center';
        ctx.fillText('OFFICIAL CERTIFICATE OF ACHIEVEMENT', 540, 235);

        // 6. Draw Student Profile Image (Avatar)
        let avatarDrawn = false;
        if (profile?.photoURL) {
          try {
            const avatarImg = new Image();
            avatarImg.crossOrigin = 'anonymous'; // Avoid canvas pollution
            avatarImg.src = profile.photoURL;
            await new Promise((resolve, reject) => {
              avatarImg.onload = resolve;
              avatarImg.onerror = reject;
            });

            ctx.save();
            ctx.beginPath();
            ctx.arc(540, 320, 50, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatarImg, 490, 270, 100, 100);
            ctx.restore();

            // Avatar ring
            ctx.strokeStyle = '#2547eb';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(540, 320, 51, 0, Math.PI * 2);
            ctx.stroke();
            avatarDrawn = true;
          } catch (e) {
            console.log('Could not load profile picture for canvas: ', e);
          }
        }

        if (!avatarDrawn) {
          // Render monogram avatar fallback
          ctx.fillStyle = '#2547eb';
          ctx.beginPath();
          ctx.arc(540, 320, 50, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const initials = (profile?.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
          ctx.fillText(initials, 540, 320);
          ctx.textBaseline = 'alphabetic'; // reset
        }

        // 7. Draw Student Name
        ctx.font = 'bold 38px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(profile?.name || 'CodeKracker Student', 540, 420);

        // 8. Draw Achievement Badge Icon Graphics
        // We will draw a beautiful glowing award badge directly using canvas lines
        ctx.save();
        // Shift context center to badge spot
        ctx.translate(540, 560);

        // Glow background
        const badgeGlow = ctx.createRadialGradient(0, 0, 10, 0, 0, 90);
        badgeGlow.addColorStop(0, 'rgba(251, 191, 36, 0.25)');
        badgeGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = badgeGlow;
        ctx.beginPath();
        ctx.arc(0, 0, 90, 0, Math.PI * 2);
        ctx.fill();

        // Ribbons
        ctx.fillStyle = '#ef4444'; // Red ribbons
        ctx.beginPath();
        ctx.moveTo(-25, 0);
        ctx.lineTo(-40, 95);
        ctx.lineTo(-10, 80);
        ctx.lineTo(0, 95);
        ctx.lineTo(10, 80);
        ctx.lineTo(40, 95);
        ctx.lineTo(25, 0);
        ctx.fill();

        // Outer Cog Ring
        ctx.fillStyle = '#fbbf24'; // Gold
        for (let i = 0; i < 16; i++) {
          ctx.rotate(Math.PI / 8);
          ctx.fillRect(-8, -60, 16, 20);
        }
        ctx.beginPath();
        ctx.arc(0, 0, 52, 0, Math.PI * 2);
        ctx.fill();

        // Inner Circle
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.fill();

        // Gold Star or Core Icon
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        // Star path
        const points = 5;
        const outerRadius = 22;
        const innerRadius = 9;
        let rot = (Math.PI / 2) * 3;
        const step = Math.PI / points;
        ctx.moveTo(0, -outerRadius);
        for (let i = 0; i < points; i++) {
          let x = Math.cos(rot) * outerRadius;
          let y = Math.sin(rot) * outerRadius;
          ctx.lineTo(x, y);
          rot += step;

          x = Math.cos(rot) * innerRadius;
          let y2 = Math.sin(rot) * innerRadius;
          ctx.lineTo(x, y2);
          rot += step;
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 9. Draw Badge Title
        ctx.font = '800 44px sans-serif';
        // Give gradient fill to title
        const titleGrad = ctx.createLinearGradient(300, 0, 780, 0);
        titleGrad.addColorStop(0, '#3b82f6'); // blue
        titleGrad.addColorStop(0.5, '#fbbf24'); // gold
        titleGrad.addColorStop(1, '#ff6a13'); // orange
        ctx.fillStyle = titleGrad;
        ctx.textAlign = 'center';
        ctx.fillText(badge.title, 540, 715);

        // 10. Draw Stats Sub-text
        ctx.font = 'semibold 24px sans-serif';
        ctx.fillStyle = '#94a3b8'; // slate-400
        ctx.textAlign = 'center';
        ctx.fillText(`Solved ${badge.threshold} Problems on ${badge.platform}`, 540, 765);

        // 11. Draw Congratulatory Message (Wrapped Text)
        ctx.font = '18px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.textAlign = 'center';
        wrapText(ctx, badge.congrats, 540, 830, 760, 28);

        // 12. Draw Footer Signatures / Issue Date
        const dateStr = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        ctx.font = '14px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.textAlign = 'center';
        ctx.fillText(`Date Achieved: ${dateStr}`, 540, 960);

        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText('Verification: codekrack-badge-verified', 540, 990);

        // Convert canvas drawing to base64 Url
        const url = canvas.toDataURL('image/png');
        setPosterUrl(url);
        setPosterGenerating(false);
      } catch (err) {
        console.error('Error generating poster canvas: ', err);
        setPosterGenerating(false);
      }
    }, 200);
  };

  // Helper function to wrap text inside canvas
  const wrapText = (context, text, x, y, maxWidth, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + ' ';
      let metrics = context.measureText(testLine);
      let testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, currentY);
  };

  const handleDownload = () => {
    if (!posterUrl) return;
    const a = document.createElement('a');
    a.href = posterUrl;
    a.download = `${selectedBadge.title.toLowerCase().replace(/\s+/g, '_')}_achievement.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Group achievements by their unlock states for overview counts
  const unlockedCount = useMemo(() => badgesList.filter(b => b.status === 'unlocked').length, [badgesList]);
  const totalCount = badgesList.length;

  return (
    <div className="min-h-screen bg-canvas flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Page Title */}
        <div className="mb-10 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider mb-3">
                <Award className="w-3.5 h-3.5" />
                Player Progress
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-fg tracking-tight">
                Coding Achievement Badges
              </h1>
              <p className="text-sm sm:text-base text-fg-muted mt-1 max-w-2xl">
                Reward your competitive coding discipline! Unlock professional badges by solving tasks across platforms and generate shareable LinkedIn posters.
              </p>
            </div>

            {/* Achievements Summary Pill */}
            <div className="bg-surface rounded-2xl border border-edge p-4 sm:px-6 sm:py-4 shadow-sm flex items-center gap-4 self-center sm:self-auto">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-fg-subtle font-semibold uppercase tracking-wider">Unlocked Badges</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-fg">{unlockedCount}</span>
                  <span className="text-sm text-fg-subtle">/ {totalCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {queryLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            
            {/* Sidebar Stats Brief */}
            <div className="md:col-span-1 space-y-6">
              <div className="bg-surface rounded-2xl border border-edge p-5 shadow-sm">
                <h3 className="text-base font-bold text-fg mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-500" />
                  Your Platform Stats
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-fg-subtle mb-1.5">
                      <span>LeetCode Solved</span>
                      <span className="text-fg font-bold">{studentStats.leetcode}</span>
                    </div>
                    <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min((studentStats.leetcode / 250) * 100, 100)}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-fg-subtle mb-1.5">
                      <span>Codeforces Solved</span>
                      <span className="text-fg font-bold">{studentStats.codeforces}</span>
                    </div>
                    <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((studentStats.codeforces / 150) * 100, 100)}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-fg-subtle mb-1.5">
                      <span>AtCoder Solved</span>
                      <span className="text-fg font-bold">{studentStats.atcoder}</span>
                    </div>
                    <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min((studentStats.atcoder / 50) * 100, 100)}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-fg-subtle mb-1.5">
                      <span>GitHub Repositories</span>
                      <span className="text-fg font-bold">{studentStats.github}</span>
                    </div>
                    <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-700 rounded-full" style={{ width: `${Math.min((studentStats.github / 5) * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Badges Grid View */}
            <div className="md:col-span-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {badgesList.map((badge) => {
                  const isUnlocked = badge.status === 'unlocked';
                  const isInProgress = badge.status === 'in-progress';
                  const isLocked = badge.status === 'locked';

                  return (
                    <motion.div
                      key={badge.id}
                      onClick={() => setSelectedBadge(badge)}
                      className={`relative overflow-hidden rounded-3xl border p-5 flex flex-col justify-between cursor-pointer transition-all duration-300 ${
                        isUnlocked 
                          ? 'bg-white border-blue-100 hover:border-blue-300 hover:shadow-lg'
                          : isInProgress
                          ? 'bg-gradient-to-br from-blue-50/20 to-orange-50/20 border-orange-200/60 hover:border-orange-300'
                          : 'bg-surface-2/60 border-edge opacity-65 hover:opacity-80'
                      }`}
                      whileHover={{ y: -4 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      {/* State corner tag */}
                      <div className="absolute top-3 right-3">
                        {isUnlocked && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            Unlocked
                          </span>
                        )}
                        {isInProgress && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[10px] font-bold animate-pulse">
                            <Flame className="w-3.5 h-3.5" />
                            In Progress
                          </span>
                        )}
                        {isLocked && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold">
                            <Lock className="w-3 h-3" />
                            Locked
                          </span>
                        )}
                      </div>

                      {/* Badge Icon Display */}
                      <div className="mb-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                          isUnlocked 
                            ? `bg-gradient-to-br ${badge.color} text-white shadow-md`
                            : 'bg-surface border border-edge text-gray-400'
                        }`}>
                          <Award className="w-8 h-8" />
                        </div>
                      </div>

                      {/* Badge Details */}
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className={`text-base font-extrabold tracking-tight ${isUnlocked ? 'text-slate-800' : 'text-gray-500'}`}>
                            {badge.title}
                          </h3>
                          <p className="text-xs text-fg-subtle font-medium mt-0.5">{badge.platform}</p>
                          <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                            {badge.description}
                          </p>
                        </div>

                        {/* Progress display (for In-progress and Locked) */}
                        <div className="mt-4 pt-3 border-t border-edge/60">
                          {isUnlocked ? (
                            <div className="flex items-center justify-between text-xs text-green-600 font-bold">
                              <span>Unlocked!</span>
                              <span className="flex items-center gap-0.5">Share Poster <ChevronRight className="w-3 h-3" /></span>
                            </div>
                          ) : (
                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-gray-400 mb-1">
                                <span>Progress</span>
                                <span>{badge.currentValue} / {badge.threshold}</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${isInProgress ? 'bg-orange-500' : 'bg-gray-300'}`}
                                  style={{ width: `${badge.progressPercent}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </main>

      {/* Badge Detail Dialog Modal */}
      <AnimatePresence>
        {selectedBadge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedBadge(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Badge visual banner */}
              <div className={`p-8 bg-gradient-to-br ${selectedBadge.status === 'unlocked' ? selectedBadge.color : 'from-gray-100 to-gray-200'} text-white flex flex-col items-center relative`}>
                <button
                  onClick={() => setSelectedBadge(null)}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-black/10 hover:bg-black/25 text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <div className={`w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg mb-4`}>
                  {selectedBadge.status === 'unlocked' ? (
                    <Award className="w-12 h-12 text-white" />
                  ) : (
                    <Lock className="w-12 h-12 text-gray-400" />
                  )}
                </div>
                
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">{selectedBadge.platform} Series</span>
                <h2 className="text-2xl font-black mt-1 text-center">{selectedBadge.title}</h2>
              </div>

              {/* Badge metadata */}
              <div className="p-6 sm:p-8 space-y-5">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Requirement</h4>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">
                      Solve {selectedBadge.threshold} problems on {selectedBadge.platform}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Description</h4>
                    <p className="text-sm text-gray-500 leading-relaxed mt-0.5">
                      {selectedBadge.description}
                    </p>
                  </div>

                  {selectedBadge.status === 'unlocked' ? (
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Congratulation Message</h4>
                      <p className="text-sm text-gray-600 leading-relaxed italic mt-0.5">
                        "{selectedBadge.congrats}"
                      </p>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex items-start gap-3">
                      <Lock className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">How to Unlock</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          You currently have solved <strong className="text-slate-800">{selectedBadge.currentValue}</strong> problems on {selectedBadge.platform}. 
                          Solve <strong className="text-slate-800">{selectedBadge.threshold - selectedBadge.currentValue}</strong> more problems to unlock this achievement badge!
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal actions */}
                <div className="flex gap-3 pt-3 border-t border-edge">
                  <button
                    onClick={() => setSelectedBadge(null)}
                    className="flex-1 btn-ghost py-3 font-bold rounded-xl"
                  >
                    Close
                  </button>
                  {selectedBadge.status === 'unlocked' && (
                    <button
                      onClick={() => {
                        const badgeCopy = selectedBadge;
                        setSelectedBadge(null);
                        generatePoster(badgeCopy);
                      }}
                      className="flex-1 btn-accent py-3 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-4 h-4" />
                      Share Achievement
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Achievement Poster Generator Modal */}
      <AnimatePresence>
        {showPosterModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => {
              if (!posterGenerating) setShowPosterModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-slate-900 text-white rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl border border-slate-800 flex flex-col md:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left: Dynamic Canvas / Poster Rendering Preview */}
              <div className="flex-1 bg-slate-950 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-800 relative">
                
                {/* Hidden canvas used for high-res drawing */}
                <canvas 
                  ref={canvasRef} 
                  style={{ display: 'none' }}
                />

                {posterGenerating ? (
                  <div className="flex flex-col items-center gap-3 py-24">
                    <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-slate-400">Assembling certificate elements...</p>
                  </div>
                ) : (
                  <div className="w-full max-w-sm aspect-square bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg relative group">
                    {posterUrl && (
                      <img 
                        src={posterUrl} 
                        alt="Achievement Poster Preview" 
                        className="w-full h-full object-contain"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-xs">
                      <span className="px-4 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-xs font-bold flex items-center gap-1.5">
                        💡 Click download to export poster
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Actions */}
              <div className="w-full md:w-[360px] p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-500">Share Flow</span>
                      <h2 className="text-xl font-extrabold text-white mt-0.5">Poster Ready!</h2>
                    </div>
                    <button
                      onClick={() => setShowPosterModal(false)}
                      className="p-1 text-slate-400 hover:text-white transition-colors"
                      disabled={posterGenerating}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-6 space-y-4 text-sm text-slate-300">
                    <p className="leading-relaxed">
                      Your achievement poster has been dynamically compiled with your user credentials, platform metrics, and official **CodeKrack & Syasans** branding parameters.
                    </p>
                    <div className="bg-slate-800/50 rounded-2xl border border-slate-800 p-4 space-y-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Poster Checklist</h4>
                      <ul className="space-y-1.5 text-xs text-slate-400">
                        <li className="flex items-center gap-2">🟢 Official CodeKrack Logo</li>
                        <li className="flex items-center gap-2">🟢 Syasans Parent Line</li>
                        <li className="flex items-center gap-2">🟢 Verified Student Name</li>
                        <li className="flex items-center gap-2">🟢 Badge Metadata & Stats</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleDownload}
                    className="w-full btn-accent py-3.5 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-amber-500 text-slate-900"
                    disabled={posterGenerating || !posterUrl}
                  >
                    <Download className="w-4 h-4" />
                    Download Poster
                  </button>
                  
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">
                      Optimized for LinkedIn sharing
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
};

export default AchievementsPage;
