import React from 'react';
import Leaderboard from '../components/Leaderboard';

const LeaderboardPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <Leaderboard />
      </div>
    </div>
  );
};

export default LeaderboardPage;