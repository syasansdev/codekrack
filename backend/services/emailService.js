import nodemailer from 'nodemailer';
import { many } from '../config/db.js';

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  /**
   * Who gets contest notifications: students, and only students.
   *
   * The Firestore version fetched EVERY user document and filtered in JS with
   * `userData.role !== 'admin'` — which let 'superadmin' straight through, so
   * the super-admin was being mailed every contest notification as if they were
   * a student. `role = 'student'` is exact and does the filtering in the query.
   */
  async getAllStudentEmails() {
    try {
      const adminEmail = process.env.EMAIL_USER; // never mail the sending account
      const rows = await many(
        `select email, coalesce(nullif(name, ''), nullif(display_name, ''), 'Student') as name
           from public.profiles
          where role = 'student'
            and email <> ''
            and lower(email) <> lower(coalesce($1, ''))
          order by name`,
        [adminEmail || '']
      );
      console.log(`Found ${rows.length} student emails for notifications`);
      return rows.map((r) => ({ email: r.email, name: r.name }));
    } catch (error) {
      console.error('Error fetching student emails:', error);
      throw error;
    }
  }

  generateContestEmailHTML(contests, studentName) {
    const contestsHTML = contests.map(contest => `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0; background: #f9fafb;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h3 style="margin: 0; color: #1f2937; font-size: 18px;">${contest.name}</h3>
          <span style="background: #3b82f6; color: white; padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: bold;">
            ${contest.platform}
          </span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0;">
          <div>
            <p style="margin: 4px 0; color: #6b7280; font-size: 14px;">📅 Date: <strong>${contest.date}</strong></p>
            <p style="margin: 4px 0; color: #6b7280; font-size: 14px;">⏰ Time: <strong>${contest.time}</strong></p>
          </div>
          <div>
            <p style="margin: 4px 0; color: #6b7280; font-size: 14px;">⏱️ Duration: <strong>${contest.duration}</strong></p>
            <p style="margin: 4px 0; color: #6b7280; font-size: 14px;">🟢 Status: <strong>Upcoming</strong></p>
          </div>
        </div>
        ${contest.url ? `
          <a href="${contest.url}" style="display: inline-block; background: #3b82f6; color: white; padding: 8px 16px; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 8px;">
            Register Now →
          </a>
        ` : ''}
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Upcoming Coding Contests</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
         
          <h1 style="margin: 0; color: #1f2937;">CodeKrack</h1>
          <p style="margin: 8px 0 0 0; color: #6b7280;">Upcoming Contest Notifications</p>
        </div>

        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Hello ${studentName}! 👋</h2>
          
          <p style="color: #4b5563; margin-bottom: 24px;">
            Don't miss out on these exciting coding contests! Here are the upcoming competitions across various platforms:
          </p>

          ${contestsHTML}

          <div style="background: #eff6ff; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <h3 style="margin: 0 0 8px 0; color: #1e40af;">💡 Pro Tips:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #374151;">
              <li>Set reminders 30 minutes before each contest</li>
              <li>Review your favorite algorithms beforehand</li>
              <li>Ensure stable internet connection</li>
              <li>Keep your IDE/editor ready</li>
            </ul>
          </div>

          <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; margin-bottom: 16px;">Track your progress on CodeKrack</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" 
               style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500;">
              Visit CodeKrack
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 CodeKrack — a product of Syasans (syasans.com). All rights reserved.</p>
          <p>You're receiving this because you're registered for contest notifications.</p>
        </div>
      </body>
      </html>
    `;
  }

  // Helper function to delay execution
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Send email with retry logic
  async sendEmailWithRetry(mailOptions, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.transporter.sendMail(mailOptions);
        return { status: 'sent' };
      } catch (error) {
        console.log(`Attempt ${attempt} failed for ${mailOptions.to}: ${error.message}`);
        
        // If it's a rate limit error and we have retries left, wait and retry
        if (error.responseCode === 421 && attempt < maxRetries) {
          console.log(`Waiting 5 seconds before retry ${attempt + 1}...`);
          await this.delay(5000); // Wait 5 seconds
          continue;
        }
        
        return { status: 'failed', error: error.message };
      }
    }
  }

  async sendContestNotifications(contests) {
    try {
      const students = await this.getAllStudentEmails();
      
      if (students.length === 0) {
        return { success: false, message: 'No students found' };
      }

      console.log(`📧 Sending emails to ${students.length} students with throttling...`);
      const results = [];
      
      // Send emails one by one with delay to avoid rate limits
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        
        const mailOptions = {
          from: `"CodeKrack" <${process.env.EMAIL_USER}>`,
          to: student.email,
          subject: `🚀 ${contests.length} Upcoming Coding Contest${contests.length > 1 ? 's' : ''} - Don't Miss Out!`,
          html: this.generateContestEmailHTML(contests, student.name)
        };

        console.log(`📤 Sending to ${student.email} (${i + 1}/${students.length})`);
        
        const result = await this.sendEmailWithRetry(mailOptions);
        results.push({ 
          email: student.email, 
          ...result 
        });
        
        // Add delay between emails to avoid rate limiting (except for last email)
        if (i < students.length - 1) {
          await this.delay(2000); // Wait 2 seconds between emails
        }
      }

      const successful = results.filter(r => r.status === 'sent').length;
      const failed = results.filter(r => r.status === 'failed').length;

      return {
        success: true,
        message: `Emails sent successfully to ${successful} students. ${failed} failed.`,
        results: {
          total: students.length,
          successful,
          failed,
          details: results
        }
      };
    } catch (error) {
      console.error('Error sending contest notifications:', error);
      return { success: false, message: error.message };
    }
  }

  // Test method - sends to limited number of students
  async sendTestContestNotifications(contests, maxStudents = 3) {
    try {
      const allStudents = await this.getAllStudentEmails();
      
      if (allStudents.length === 0) {
        return { success: false, message: 'No students found' };
      }

      // Limit to first few students for testing
      const students = allStudents.slice(0, maxStudents);
      console.log(`📧 [TEST MODE] Sending emails to ${students.length} students (limited for testing)...`);
      
      const results = [];
      
      // Send emails one by one with delay to avoid rate limits
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        
        const mailOptions = {
          from: `"CodeKrack" <${process.env.EMAIL_USER}>`,
          to: student.email,
          subject: `🧪 [TEST] ${contests.length} Upcoming Coding Contest${contests.length > 1 ? 's' : ''} - Don't Miss Out!`,
          html: this.generateContestEmailHTML(contests, student.name)
        };

        console.log(`📤 [TEST] Sending to ${student.email} (${i + 1}/${students.length})`);
        
        const result = await this.sendEmailWithRetry(mailOptions);
        results.push({ 
          email: student.email, 
          ...result 
        });
        
        // Add delay between emails to avoid rate limiting (except for last email)
        if (i < students.length - 1) {
          await this.delay(1000); // Wait 1 second between emails for testing
        }
      }

      const successful = results.filter(r => r.status === 'sent').length;
      const failed = results.filter(r => r.status === 'failed').length;

      return {
        success: true,
        message: `[TEST MODE] Emails sent successfully to ${successful} students. ${failed} failed.`,
        results: {
          total: students.length,
          successful,
          failed,
          details: results
        }
      };
    } catch (error) {
      console.error('Error sending test contest notifications:', error);
      return { success: false, message: error.message };
    }
  }
}

export default new EmailService();