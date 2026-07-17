import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const BackButton = ({ to, className = "" }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <motion.button
      onClick={handleBack}
      className={`fixed top-2 left-2 md:top-4 md:left-4 z-50 p-2 md:p-3 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full shadow-md bg-white border border-gray-200 transition-colors duration-200 ${className}`}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      title="Go back"
    >
      <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </motion.button>
  );
};

export default BackButton;