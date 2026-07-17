import { motion } from 'framer-motion';

const StreakTracker = ({ streak }) => {
  // Generate last 30 days for streak visualization
  const days = Array.from({ length: 30 }, (_, i) => {
    // Randomly determine if day is active for days before current streak
    // For current streak, all days are active
    const isActive = i >= 30 - streak;
    return { day: 30 - i, isActive };
  });

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-gray-800">Coding Streak</h3>
        <div className="flex items-center">
          <span className="text-2xl font-bold text-blue-600">{streak}</span>
          <span className="ml-1 text-gray-500 text-sm">days</span>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 justify-center">
        {days.map((day, index) => (
          <motion.div
            key={day.day}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.02 }}
            className={`w-7 h-7 rounded-sm flex items-center justify-center text-xs font-medium ${
              day.isActive 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {day.day}
          </motion.div>
        ))}
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">Current streak</div>
          <motion.div 
            className="h-2 bg-gray-100 rounded-full overflow-hidden w-2/3"
            initial={{ width: 0 }}
            animate={{ width: "66.666667%" }}
            transition={{ delay: 0.5, duration: 1 }}
          >
            <motion.div 
              className="h-full bg-blue-500" 
              initial={{ width: 0 }}
              animate={{ width: `${(streak/100) * 100}%` }}
              transition={{ delay: 0.8, duration: 1.5 }}
            />
          </motion.div>
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-gray-500">0</span>
          <span className="text-gray-500">50</span>
          <span className="text-gray-500">100</span>
        </div>
      </div>
    </div>
  );
};

export default StreakTracker;
