import { motion } from 'framer-motion';
import { 
  MessageCircle, 
  Shield, 
  Users, 
  BookOpen, 
  Headphones,
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Github,
  Heart,
  ArrowRight
} from 'lucide-react';

// Animation Variants for cleaner code
const footerContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.3,
    },
  },
};

const columnVariants = {
  hidden: { opacity: 0, y: 30 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' }
  },
};

const linkItemVariants = {
  hidden: { opacity: 0, x: -20 },
  show: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.4, ease: 'easeOut' }
  },
};

const brandNameVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.5,
    },
  },
};

const letterVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      damping: 12,
      stiffness: 200,
    },
  },
};

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const brandName = "CodeKrack";

  return (
    <motion.footer 
      className="bg-gray-100 border-t border-gray-200 py-16 relative overflow-hidden"
      variants={footerContainerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      {/* Animated top border */}
      <motion.div 
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 2, ease: 'easeInOut', delay: 0.2 }}
        style={{ transformOrigin: 'center' }}
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10"
          variants={footerContainerVariants}
        >
          {/* Brand Section */}
          <motion.div 
            className="lg:col-span-1"
            variants={columnVariants}
          >
            <motion.div 
              className="flex items-center space-x-2 mb-4"
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
            >
              <motion.span 
                variants={brandNameVariants} 
                initial="hidden" 
                animate="visible" 
                className="text-2xl font-bold text-blue-600 inline-block"
              >
                {brandName.split("").map((char, index) => (
                  <motion.span key={char + "-" + index} variants={letterVariants} className="inline-block">
                    {char}
                  </motion.span>
                ))}
              </motion.span>
            </motion.div>
            <p className="text-gray-600 text-sm mb-4 leading-relaxed">
              Bridging the gap between students and administrators through seamless communication and support.
            </p>
            
            <div className="space-y-1">
              {[
                { icon: Shield, text: 'Secure & Private' },
                { icon: Headphones, text: '24/7 Support' }
              ].map((feature, index) => (
                <motion.div 
                  key={index}
                  className="flex items-center space-x-3 text-sm text-gray-700 p-2 rounded-lg hover:bg-blue-50 transition-colors duration-200"
                  whileHover={{ x: 5, backgroundColor: 'rgba(239, 246, 255, 1)' }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <motion.div 
                    className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0"
                    whileHover={{ rotate: 15, scale: 1.1 }}
                  >
                    <feature.icon className="w-3 h-3 text-blue-600" />
                  </motion.div>
                  <span>{feature.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
          
          {/* Quick Links */}
          <motion.div variants={columnVariants}>
            <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-500" />
              For Students
            </h3>
            <motion.ul className="space-y-3" variants={footerContainerVariants}>
              {[
                { name: 'Student Dashboard', href: '/dashboard' },
                { name: 'LeaderBoard', href: '/leaderboard' },
                { name: 'Start Chat', href: '/help' },
                { name: 'Profile Settings', href: '/settings' },
              ].map((item) => (
                <motion.li key={item.name} variants={linkItemVariants}>
                  <motion.a 
                    href={item.href} 
                    className="text-sm text-gray-600 hover:text-blue-600 transition-all duration-200 flex items-center group py-1"
                    whileHover={{ x: 4, transition: { type: 'spring', stiffness: 400 } }}
                  >
                    <ArrowRight className="w-3 h-3 mr-2 text-blue-500 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                    {item.name}
                  </motion.a>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
          
          {/* Admin Links */}
          <motion.div variants={columnVariants}>
            <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-blue-500" />
              For Admins
            </h3>
            <motion.ul className="space-y-3" variants={footerContainerVariants}>
              {[
                { name: 'Admin Portal', href: '/dashboard' },
                { name: 'Chat Management', href: '/dashboard' },
                { name: 'User Management', href: '/dashboard' },
                { name: 'Analytics', href: '/dashboard' },
              ].map((item) => (
                 <motion.li key={item.name} variants={linkItemVariants}>
                  <motion.a 
                    href={item.href} 
                    className="text-sm text-gray-600 hover:text-blue-600 transition-all duration-200 flex items-center group py-1"
                    whileHover={{ x: 4, transition: { type: 'spring', stiffness: 400 } }}
                  >
                    <ArrowRight className="w-3 h-3 mr-2 text-blue-500 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                    {item.name}
                  </motion.a>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
          
          {/* Support & Legal */}
          <motion.div variants={columnVariants}>
            <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <BookOpen className="w-5 h-5 mr-2 text-blue-500" />
              Resources
            </h3>
            <motion.ul className="space-y-3" variants={footerContainerVariants}>
              {[
                { name: 'API Reference', href: '/api-docs' },
                { name: 'Privacy Policy', href: '/privacy' },
                { name: 'Terms of Service', href: '/terms' },
                { name: 'Contact Us', href: '/contact' }
              ].map((item) => (
                <motion.li key={item.name} variants={linkItemVariants}>
                  <motion.a 
                    href={item.href} 
                    className="text-sm text-gray-600 hover:text-blue-600 transition-all duration-200 flex items-center group py-1"
                    whileHover={{ x: 4, transition: { type: 'spring', stiffness: 400 } }}
                  >
                    <ArrowRight className="w-3 h-3 mr-2 text-blue-500 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                    {item.name}
                  </motion.a>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        </motion.div>
        
        {/* Bottom Section */}
        <motion.div 
          className="mt-12 border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          <div className="flex flex-col items-center md:items-start gap-1 mb-4 md:mb-0">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-600">
                &copy; {currentYear} {brandName}. Made with
              </p>
              <motion.div
                animate={{ scale: [1, 1.2, 1], y: [0, -2, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Heart className="w-4 h-4 text-red-500 fill-current" />
              </motion.div>
              <p className="text-sm text-gray-600">for better education.</p>
            </div>
            <p className="text-xs text-gray-500">
              A product of{" "}
              <a
                href="https://syasans.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium"
              >
                Syasans
              </a>
            </p>
          </div>
          
          <div className="flex items-center space-x-1">
            <span className="text-sm text-gray-500 mr-4">Follow us:</span>
            {[
              { icon: Twitter, href: '#', label: 'Twitter' },
              { icon: Facebook, href: '#', label: 'Facebook' },
              { icon: Instagram, href: '#', label: 'Instagram' },
              { icon: Linkedin, href: '#', label: 'LinkedIn' },
              { icon: Github, href: '#', label: 'GitHub' }
            ].map((social, index) => (
              <motion.a 
                key={index}
                href={social.href}
                className="text-gray-400 hover:text-blue-600 transition-all duration-300 p-2 rounded-full hover:bg-blue-50"
                whileHover={{ scale: 1.2, rotate: 8, y: -2 }}
                whileTap={{ scale: 0.9, rotate: -8 }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1 + (index * 0.1), type: 'spring', stiffness: 200, damping: 10 }}
                title={social.label}
              >
                <social.icon className="w-5 h-5" />
              </motion.a>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.footer>
  );
};

export default Footer;