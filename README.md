# CodeKrack

> A comprehensive student progress tracking and contest notification system for coding enthusiasts.
>
> A product of [Syasans](https://syasans.com/).

## Overview

CodeKrack is a modern web application designed to track student coding progress across multiple platforms and provide automated contest notifications. Built for educational institutions to monitor and encourage student participation in competitive programming.

## Features

- **Multi-Platform Integration**: Track progress on LeetCode, Codeforces, AtCoder, HackerRank, and GitHub
- **Automated Contest Notifications**: Weekly email alerts for upcoming coding contests
- **Admin Dashboard**: Comprehensive analytics and student management
- **Real-time Leaderboards**: Track top performers and achievements
- **Student Profiles**: Individual progress tracking and statistics
- **Password Management**: Secure student account management
- **Responsive Design**: Mobile-friendly interface

## Tech Stack

**Frontend:**
- React 18 with Vite
- Tailwind CSS for styling
- Framer Motion for animations
- Firebase Authentication

**Backend:**
- Node.js with Express
- Firebase Firestore
- Nodemailer for email notifications
- Node-cron for scheduled tasks

**Deployment:**
- Frontend: Vercel
- Backend: Render
- Database: Firebase Firestore

## Quick Start

### Prerequisites
- Node.js 18+
- Firebase project
- Gmail account for email notifications

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/DharanSJIT/code_portal.git
   cd code_portal
   ```

2. **Install dependencies**
   ```bash
   # Frontend
   npm install
   
   # Backend
   cd backend
   npm install
   ```

3. **Environment Setup**
   ```bash
   # Backend (.env)
   EMAIL_USER=your-gmail@gmail.com
   EMAIL_PASS=your-app-password
   FRONTEND_URL=http://localhost:5173
   PORT=5001
   ```

4. **Firebase Configuration**
   - Add your Firebase config to `src/firebase.js`
   - Place `serviceAccountKey.json` in the backend directory

5. **Start Development Servers**
   ```bash
   # Frontend (port 5173)
   npm run dev
   
   # Backend (port 5001)
   cd backend
   npm start
   ```

## Contest Email Scheduler

The system automatically sends weekly contest notifications every **Monday at 9:00 AM IST** to all registered students, featuring:

- Upcoming contests from major platforms
- Contest details (date, time, duration)
- Direct registration links
- Personalized student greetings

## Admin Features

- Student management and bulk operations
- Real-time analytics dashboard
- Contest notification management
- Password reset functionality
- Progress tracking across platforms

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Support

For support and questions, please contact the development team or create an issue in the repository.

---

**CodeKrack** - Empowering students through competitive programming 🚀