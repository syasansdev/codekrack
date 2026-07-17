import { motion } from 'framer-motion';

const StatCard = ({ title, stats, color, borderColor }) => {
  return (
    <motion.div 
      className={`rounded-xl shadow-sm p-6 border-l-4 ${borderColor} ${color} transition-all duration-200 hover:shadow-md`}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
    >
      <h3 className="font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, index) => (
          <motion.div 
            key={`${title}-${stat.label}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 * index }}
          >
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default StatCard;
