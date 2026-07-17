import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TaskTracker = ({ tasks, expanded = false }) => {
  const [userTasks, setUserTasks] = useState(tasks);
  const [newTaskText, setNewTaskText] = useState('');

  const toggleTaskCompletion = (taskId) => {
    setUserTasks(userTasks.map(task => 
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };

  const addTask = (e) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    
    const newTask = {
      id: Date.now(),
      title: newTaskText.trim(),
      completed: false
    };
    
    setUserTasks([...userTasks, newTask]);
    setNewTaskText('');
  };

  const completedTasks = userTasks.filter(task => task.completed).length;
  const progressPercentage = Math.round((completedTasks / userTasks.length) * 100) || 0;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800">Daily Tasks</h3>
        <div className="flex items-center">
          <span className="text-sm text-gray-500">
            {completedTasks} of {userTasks.length} completed
          </span>
        </div>
      </div>
      
      <div className="mb-6">
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-green-500"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
      
      <div className="space-y-3 mb-6">
        <AnimatePresence>
          {userTasks.map((task) => (
            <motion.div 
              key={task.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="flex items-center"
            >
              <div 
                className={`w-5 h-5 rounded-full border flex-shrink-0 cursor-pointer transition-colors duration-200 flex items-center justify-center ${
                  task.completed 
                    ? 'bg-green-500 border-green-500' 
                    : 'border-gray-300 hover:border-blue-500'
                }`}
                onClick={() => toggleTaskCompletion(task.id)}
              >
                {task.completed && (
                  <motion.svg 
                    width="12" height="12" viewBox="0 0 12 12" fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </motion.svg>
                )}
              </div>
              <span 
                className={`ml-3 text-sm ${
                  task.completed ? 'text-gray-400 line-through' : 'text-gray-700'
                }`}
              >
                {task.title}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {expanded && (
        <form onSubmit={addTask} className="mt-4">
          <div className="flex items-center">
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="Add a new task..."
              className="flex-grow px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <motion.button
              type="submit"
              className="ml-2 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg focus:outline-none"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={!newTaskText.trim()}
            >
              Add
            </motion.button>
          </div>
        </form>
      )}
      
      {!expanded && (
        <motion.button 
          className="text-blue-600 text-sm font-medium hover:text-blue-800 transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          View all tasks
        </motion.button>
      )}
    </div>
  );
};

export default TaskTracker;
