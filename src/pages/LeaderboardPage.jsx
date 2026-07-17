import React from 'react';
import Leaderboard from '../components/Leaderboard';

/**
 * Thin route wrapper.
 *
 * This used to add `min-h-screen` and a `from-gray-50 to-blue-50` gradient of
 * its own — both of which Leaderboard already sets on its own root. So the page
 * stacked two full-height gradients, and wrapped a self-laying-out component in
 * a second max-w-7xl container, giving it two competing width constraints.
 * Leaderboard owns its own chrome; this just mounts it.
 */
const LeaderboardPage = () => <Leaderboard />;

export default LeaderboardPage;
