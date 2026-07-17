import cron from 'node-cron';
import emailService from './emailService.js';

class SchedulerService {
  constructor() {
    this.isRunning = false;
  }

  // Fetch contests for the next 7 days
  async getWeeklyContests() {
    try {
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

      const now = new Date();
      const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Generate weekly contests
      const leetcodeDate = getNextDayOfWeek(0, 8, 0); // Sunday 8 AM
      const atcoderDate = getNextDayOfWeek(6, 17, 30); // Saturday 5:30 PM
      const codechefDate = getNextDayOfWeek(3, 20, 0); // Wednesday 8 PM

      let contests = [];

      // Add weekly contests if they're within the next 7 days
      if (leetcodeDate <= oneWeekFromNow) {
        contests.push({
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
        });
      }

      if (atcoderDate <= oneWeekFromNow) {
        contests.push({
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
        });
      }

      if (codechefDate <= oneWeekFromNow) {
        contests.push({
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
        });
      }

      // Try to fetch Codeforces contests
      try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://codeforces.com/api/contest.list');
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'OK') {
            const cfContests = data.result
              .filter(contest => {
                const contestTime = contest.startTimeSeconds * 1000;
                return contest.phase === 'BEFORE' && 
                       contestTime > now.getTime() && 
                       contestTime <= oneWeekFromNow.getTime();
              })
              .slice(0, 5) // Limit to 5 contests
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

            contests = [...contests, ...cfContests];
          }
        }
      } catch (apiError) {
        console.log('Could not fetch Codeforces contests for weekly email');
      }

      // Sort by start time
      contests.sort((a, b) => a.startTime - b.startTime);
      return contests;

    } catch (error) {
      console.error('Error fetching weekly contests:', error);
      return [];
    }
  }

  // Send weekly contest email
  async sendWeeklyContestEmail() {
    try {
      console.log('🕒 Starting weekly contest email job...');
      
      const contests = await this.getWeeklyContests();
      
      if (contests.length === 0) {
        console.log('📭 No contests found for this week');
        return { success: false, message: 'No contests found for this week' };
      }

      console.log(`📧 Found ${contests.length} contests for this week`);
      
      const result = await emailService.sendContestNotifications(contests);
      
      if (result.success) {
        console.log(`✅ Weekly email sent successfully to ${result.results.successful} students`);
        if (result.results.failed > 0) {
          console.log(`⚠️ ${result.results.failed} emails failed to send`);
        }
      } else {
        console.error('❌ Failed to send weekly email:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error in weekly email job:', error);
      return { success: false, message: error.message };
    }
  }

  // Start the scheduler
  startScheduler() {
    if (this.isRunning) {
      console.log('⚠️ Scheduler is already running');
      return;
    }

    // Schedule for every Monday at 9:00 AM
    // Cron format: '0 9 * * 1' = minute hour day month dayOfWeek
    // dayOfWeek: 0 = Sunday, 1 = Monday, etc.
    this.weeklyJob = cron.schedule('0 9 * * 1', async () => {
      console.log('🚀 Weekly contest email job triggered - Monday 9:00 AM IST');
      console.log('📅 Current time:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
      await this.sendWeeklyContestEmail();
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata" // Adjust timezone as needed
    });

    this.isRunning = true;
    console.log('✅ Weekly contest email scheduler started');
    console.log('📅 Emails will be sent every Monday at 9:00 AM IST');
    console.log('🕐 Current IST time:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    
    // Calculate next Monday 9 AM
    const now = new Date();
    const nextMonday = new Date();
    const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(9, 0, 0, 0);
    console.log('📅 Next scheduled run:', nextMonday.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    
    // For testing - uncomment to send immediately
    // console.log('🧪 Sending test email immediately...');
    // this.sendWeeklyContestEmail();
  }

  // Stop the scheduler
  stopScheduler() {
    if (this.weeklyJob) {
      this.weeklyJob.stop();
      this.isRunning = false;
      console.log('🛑 Weekly contest email scheduler stopped');
    }
  }

  // Get scheduler status
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.isRunning ? 'Next Monday at 9:00 AM IST' : 'Not scheduled',
      timezone: 'Asia/Kolkata'
    };
  }

  // Manual trigger for testing
  async triggerManualEmail() {
    console.log('🧪 Manual trigger - sending weekly contest email...');
    return await this.sendWeeklyContestEmail();
  }
}

export default new SchedulerService();