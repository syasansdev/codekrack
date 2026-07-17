// backend/routes/emailRoutes.js
//
// SEC-01 FIX. Every route in this file was previously mounted with NO auth
// middleware whatsoever. Verified before the fix:
//     curl -o /dev/null -w "%{http_code}" localhost:5001/api/email/scheduler/status
//     200
// An anonymous caller could email every student repeatedly (through YOUR Gmail
// account, until Google suspends it for exceeding sending limits), or POST
// /scheduler/stop and silently disable weekly notifications — a failure that
// looks like a bug, not an attack.
//
// The guard is graduated by who genuinely needs each route, NOT blanket-admin:
//
//   verifyToken  /upcoming-contests   Header.jsx renders the contest calendar for
//                                     every signed-in STUDENT. verifyAdmin here
//                                     would break the calendar for the whole
//                                     student body.
//   verifyAdmin  everything else      Only the admin screens (ContestNotifications,
//                                     WeeklyScheduler) call these.
//
// The two routes that actually SEND mail also carry a strict rate limiter
// (SEC-02) — auth alone still lets one compromised admin session burn the
// account's daily sending quota in a loop.
import express from 'express';
import emailService from '../services/emailService.js';
import schedulerService from '../services/schedulerService.js';
import { verifyToken, verifyAdmin } from '../middleware/supabaseAuth.js';
import { emailSendLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Fetch contests from Codeforces API and generate contest data
const fetchUpcomingContests = async () => {
  try {
    // Helper function to get next occurrence of a specific day
    const getNextDayOfWeek = (dayOfWeek, hour, minute) => {
      const now = new Date();
      const resultDate = new Date();
      const currentDay = now.getDay();
      let daysUntilTarget = (dayOfWeek - currentDay + 7) % 7;

      if (daysUntilTarget === 0) {
        const targetTime = new Date();
        targetTime.setHours(hour, minute, 0, 0);
        if (now >= targetTime) {
          daysUntilTarget = 7;
        }
      }

      resultDate.setDate(now.getDate() + daysUntilTarget);
      resultDate.setHours(hour, minute, 0, 0);
      return resultDate;
    };

    // Generate placeholder contests
    const now = new Date();
    const leetcodeDate = getNextDayOfWeek(0, 8, 0); // Sunday 8 AM
    const atcoderDate = getNextDayOfWeek(6, 17, 30); // Saturday 5:30 PM
    const codechefDate = getNextDayOfWeek(3, 20, 0); // Wednesday 8 PM

    let contests = [
      {
        name: "LeetCode Weekly Contest",
        platform: "LeetCode",
        date: new Intl.DateTimeFormat('en-GB').format(leetcodeDate),
        time: new Intl.DateTimeFormat('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).format(leetcodeDate),
        duration: "1h 30m",
        url: "https://leetcode.com/contest/",
        startTime: leetcodeDate.getTime()
      },
      {
        name: "AtCoder Beginner Contest",
        platform: "AtCoder",
        date: new Intl.DateTimeFormat('en-GB').format(atcoderDate),
        time: new Intl.DateTimeFormat('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).format(atcoderDate),
        duration: "1h 40m",
        url: "https://atcoder.jp/contests/",
        startTime: atcoderDate.getTime()
      },
      {
        name: "CodeChef Starters",
        platform: "CodeChef",
        date: new Intl.DateTimeFormat('en-GB').format(codechefDate),
        time: new Intl.DateTimeFormat('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).format(codechefDate),
        duration: "3h 0m",
        url: "https://www.codechef.com/contests",
        startTime: codechefDate.getTime()
      }
    ];

    // Try to fetch real Codeforces contests
    try {
      console.log('Fetching Codeforces contests...');
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://codeforces.com/api/contest.list');
      
      console.log('Codeforces API response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Codeforces API data status:', data.status);
        
        if (data.status === 'OK') {
          console.log('Total contests from API:', data.result.length);
          
          const upcomingContests = data.result.filter(contest => 
            contest.phase === 'BEFORE' && 
            contest.startTimeSeconds * 1000 > now.getTime()
          );
          
          console.log('Upcoming contests found:', upcomingContests.length);
          console.log('Upcoming contests:', upcomingContests.map(c => ({ name: c.name, startTime: new Date(c.startTimeSeconds * 1000) })));
          
          const cfContests = upcomingContests
            .slice(0, 3)
            .map(contest => {
              const startTime = new Date(contest.startTimeSeconds * 1000);
              return {
                name: contest.name,
                platform: "Codeforces",
                date: new Intl.DateTimeFormat('en-GB').format(startTime),
                time: new Intl.DateTimeFormat('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                }).format(startTime),
                duration: `${Math.floor(contest.durationSeconds / 3600)}h ${Math.floor((contest.durationSeconds % 3600) / 60)}m`,
                url: `https://codeforces.com/contest/${contest.id}`,
                startTime: contest.startTimeSeconds * 1000
              };
            });

          console.log('Processed Codeforces contests:', cfContests.length);
          
          if (cfContests.length > 0) {
            contests = [...cfContests, ...contests.filter(c => c.platform !== 'Codeforces')];
            console.log('Added Codeforces contests to list. Total contests now:', contests.length);
          } else {
            console.log('No Codeforces contests to add');
          }
        } else {
          console.log('Codeforces API returned non-OK status:', data.status, data.comment);
        }
      } else {
        console.log('Codeforces API request failed with status:', response.status);
      }
    } catch (apiError) {
      console.error('Codeforces API error:', apiError.message);
      console.error('Full error:', apiError);
    }

    // Sort by start time and return top 6
    contests.sort((a, b) => a.startTime - b.startTime);
    return contests.slice(0, 6);

  } catch (error) {
    console.error('Error fetching contests:', error);
    throw error;
  }
};

// Send contest notifications
router.post('/send-contest-notifications', verifyAdmin, emailSendLimiter, async (req, res) => {
  try {
    const contests = await fetchUpcomingContests();
    
    if (contests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No upcoming contests found'
      });
    }

    const result = await emailService.sendContestNotifications(contests);
    
    res.json(result);
  } catch (error) {
    console.error('Error sending contest notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notifications',
      error: error.message
    });
  }
});

// Get upcoming contests (for preview)
// verifyToken, NOT verifyAdmin: the student Header renders a contest calendar.
router.get('/upcoming-contests', verifyToken, async (req, res) => {
  try {
    const contests = await fetchUpcomingContests();
    res.json({
      success: true,
      contests
    });
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contests',
      error: error.message
    });
  }
});

// Get weekly contests (for scheduler)
router.get('/weekly-contests', verifyAdmin, async (req, res) => {
  try {
    const contests = await schedulerService.getWeeklyContests();
    res.json({
      success: true,
      contests,
      count: contests.length
    });
  } catch (error) {
    console.error('Error fetching weekly contests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch weekly contests',
      error: error.message
    });
  }
});

// Get scheduler status
router.get('/scheduler/status', verifyAdmin, (req, res) => {
  try {
    const status = schedulerService.getStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get scheduler status',
      error: error.message
    });
  }
});

// Start scheduler
router.post('/scheduler/start', verifyAdmin, (req, res) => {
  try {
    schedulerService.startScheduler();
    res.json({
      success: true,
      message: 'Weekly email scheduler started',
      status: schedulerService.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start scheduler',
      error: error.message
    });
  }
});

// Stop scheduler
router.post('/scheduler/stop', verifyAdmin, (req, res) => {
  try {
    schedulerService.stopScheduler();
    res.json({
      success: true,
      message: 'Weekly email scheduler stopped',
      status: schedulerService.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to stop scheduler',
      error: error.message
    });
  }
});

// Manual trigger for testing
router.post('/scheduler/trigger', verifyAdmin, emailSendLimiter, async (req, res) => {
  try {
    console.log('🧪 Manual email trigger requested via API');
    const result = await schedulerService.triggerManualEmail();
    res.json(result);
  } catch (error) {
    console.error('❌ Manual trigger failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger manual email',
      error: error.message
    });
  }
});

// Test email functionality (sends to first 3 students only)
router.post('/test-email', verifyAdmin, emailSendLimiter, async (req, res) => {
  try {
    console.log('🧪 Testing email functionality (limited to 3 students)...');
    
    // Get a small sample of contests
    const contests = await fetchUpcomingContests();
    
    if (contests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No contests available for testing'
      });
    }

    // Send to just first 3 students for testing
    const testResult = await emailService.sendTestContestNotifications(contests.slice(0, 3), 3);
    
    res.json({
      success: true,
      message: 'Test email functionality completed',
      contests: contests.length,
      emailResult: testResult
    });
  } catch (error) {
    console.error('❌ Test email failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test email failed',
      error: error.message
    });
  }
});

export default router;