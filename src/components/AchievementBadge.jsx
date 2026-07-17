import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';

const AchievementBadge = ({ achievement, userName, onClose }) => {
  const collegeName = "St. Joseph's Group of Institutions";
  const collegeLogoUrl = "/college-logo.png";

  const [isGenerating, setIsGenerating] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [certificateId, setCertificateId] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const badgeRef = useRef(null);

  useEffect(() => {
    setLogoDataUrl(collegeLogoUrl);
    setLogoLoaded(true);
    
    const generatedId = `SJ-${achievement.name.replace(/\s+/g, '').toUpperCase().slice(0, 4)}-${Date.now().toString().slice(-6)}`;
    setCertificateId(generatedId);
    
    const formattedDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    setCurrentDate(formattedDate);
    
    const certificateData = JSON.stringify({
      id: generatedId,
      name: userName,
      achievement: achievement.name,
      institution: collegeName,
      date: new Date().toISOString().split('T')[0]
    });
    
    QRCode.toDataURL(certificateData, {
      width: 128,
      margin: 1,
      color: {
        dark: '#1f2937',
        light: '#ffffff'
      }
    }).then(url => {
      setQrCodeUrl(url);
    }).catch(err => {
      console.error('QR Code generation failed:', err);
    });
  }, [achievement.name, userName]);

  const downloadBadge = async () => {
    if (!badgeRef.current) return;
    
    setIsGenerating(true);
    
    const nameElement = badgeRef.current.querySelector('.user-name-gradient');
    const originalClasses = nameElement ? nameElement.className : '';

    try {
      if (nameElement) {
        nameElement.className = 'text-3xl md:text-4xl lg:text-5xl font-extrabold my-3 text-sky-400 break-words';
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const canvas = await html2canvas(badgeRef.current, {
        backgroundColor: '#0f172a',
        scale: 3,
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 15000,
        removeContainer: true,
        windowWidth: badgeRef.current.scrollWidth,
        windowHeight: badgeRef.current.scrollHeight,
      });

      const link = document.createElement('a');
      link.download = `${collegeName.replace(/\s+/g, '_')}_${achievement.name.replace(/\s+/g, '_')}_Badge.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (error) {
      console.error('Error generating badge:', error);
      alert('Sorry, there was an error generating the badge. Please try again.');
    } finally {
      if (nameElement) {
        nameElement.className = originalClasses;
      }
      setIsGenerating(false);
    }
  };

  const shareToLinkedIn = () => {
    const text = `I'm excited to share that I've unlocked the "${achievement.name}" achievement at ${collegeName}! This recognizes my skills in ${achievement.description}. Always learning and growing! 🚀`;
    const hashtags = `StJosephs,Coding,Achievement,NeverStopLearning`;
    const url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}%0A%0A%23${hashtags.replace(/,/g, ' %23')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200 }}
        className="bg-slate-800 border border-slate-700 rounded-xl max-w-3xl w-full max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 p-4">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-700"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto px-6 min-h-0">
          <div
            ref={badgeRef}
            className="w-full text-white bg-slate-900 rounded-xl p-6 md:p-8 relative shadow-2xl shadow-blue-500/20 border-2 border-slate-700 overflow-hidden"
            style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '500px' }}
          >
            <div className="absolute inset-0 opacity-[0.03]">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="p" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="scale(2) rotate(45)">
                    <rect x="0" y="0" width="100%" height="100%" fill="none"/>
                    <path d="M-10 10h60M-10 30h60" stroke="#3b82f6" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#p)"/>
              </svg>
            </div>
            
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500"></div>
            
            <div className="relative z-10 flex flex-col" style={{ minHeight: '450px' }}>
              <header className="flex justify-between items-start pb-6 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-white ring-2 ring-slate-600 rounded-lg flex items-center justify-center shadow-xl p-1 flex-shrink-0">
                    {logoDataUrl && logoLoaded ? (
                      <img 
                        src={logoDataUrl}
                        alt={`${collegeName} Logo`}
                        className="w-full h-full object-contain"
                        style={{ imageRendering: 'crisp-edges' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-blue-600 rounded">
                        <span className="text-white font-bold text-lg">SJ</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-base md:text-lg text-white leading-tight no-underline">{collegeName}</h3>
                    <p className="text-xs text-blue-400 font-medium">Certificate of Achievement</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Issued On</p>
                  <p className="font-semibold text-sm text-white">{currentDate}</p>
                </div>
              </header>

              <main className="flex-grow flex flex-col justify-center items-center text-center my-6">
                <p className="text-sm md:text-base text-gray-400 uppercase tracking-widest font-semibold">This certifies that</p>
                <h1 className="user-name-gradient text-3xl md:text-4xl lg:text-5xl font-extrabold my-3 text-sky-400 break-words">
                  {userName}
                </h1>
                <p className="text-sm md:text-base text-gray-400 mb-6 uppercase tracking-widest font-semibold">has successfully earned the achievement</p>
                
                <div className="bg-slate-800 border-2 border-slate-700 rounded-xl p-6 mb-6 max-w-2xl w-full shadow-lg">
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">{achievement.name}</h2>
                  <div className="w-16 h-1 bg-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-300 text-sm md:text-base leading-relaxed">{achievement.description}</p>
                </div>
                
                <div className="relative w-20 h-20 md:w-24 md:h-24 my-4">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full blur-lg opacity-60"></div>
                  <div className="relative w-full h-full bg-slate-800 border-2 border-blue-500 rounded-full flex items-center justify-center">
                     <svg className="w-10 h-10 md:w-12 md:h-12 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                       <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                     </svg>
                  </div>
                </div>
              </main>

              <footer className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 sm:gap-2 pt-6 border-t border-slate-700">
                <div className="text-center sm:text-left bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                  <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Certificate ID</p>
                  <p className="text-xs md:text-sm font-mono text-white font-semibold">{certificateId}</p>
                </div>
                <div className="text-center bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
                  <p className="font-serif text-lg md:text-xl text-white font-bold">{collegeName}</p> 
                  <p className="text-xs text-blue-400 uppercase tracking-wider font-semibold">Issuing Authority</p>
                </div>
                <div className="w-14 h-14 md:w-16 md:h-16 bg-white rounded-lg p-1 flex items-center justify-center flex-shrink-0 border-2 border-slate-600">
                  {qrCodeUrl ? (
                    <img 
                      src={qrCodeUrl} 
                      alt="Certificate Verification QR Code" 
                      className="w-full h-full rounded"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 rounded animate-pulse"></div>
                  )}
                </div>
              </footer>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 p-6 pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={downloadBadge}
              disabled={isGenerating}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isGenerating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin mr-2"></div>
                  Generating Badge...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Badge
                </>
              )}
            </button>
            <button
              onClick={shareToLinkedIn}
              className="w-full bg-[#0A66C2] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#004182] transition-colors flex items-center justify-center"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 -2 24 24" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              Share on LinkedIn
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AchievementBadge;