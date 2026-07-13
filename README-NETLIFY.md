# Room Booking System - Netlify Deployment Guide

This guide covers deploying the Room Booking System on Netlify Functions with MySQL (Aiven).

## Prerequisites

- Node.js 18+ installed
- Netlify account
- Aiven MySQL database
- Git repository

## Architecture

- **Backend**: Netlify Functions (Node.js)
- **Database**: MySQL (Aiven)
- **Sessions**: MySQL-based session storage
- **Email**: SMTP or Email API (SendGrid/Resend)
- **Cron Jobs**: Netlify Scheduled Functions

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Update the following variables:

```env
# Database (use either DATABASE_URL or individual params)
DATABASE_URL=mysql://avnadmin:YOUR_PASSWORD@room-booking-mysql-roombooking21.g.aivencloud.com:14255/defaultdb?sslMode=REQUIRED

# Aiven CA Certificate (required for SSL connection)
# Download from Aiven Console → Service → Overview → CA Certificate
# Copy the entire content (including BEGIN/END CERTIFICATE) and paste as a multi-line value
DB_CA_CERT=-----BEGIN CERTIFICATE-----
...paste your CA certificate content here...
-----END CERTIFICATE-----

# Email Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-email-password
SMTP_FROM=noreply@roombooking.system
```

**Important for Aiven MySQL:**
- Aiven requires SSL/TLS connections
- Download the CA certificate from Aiven Console
- Set `DB_CA_CERT` with the full certificate content (multi-line)
- Connection limit is set to 5 for serverless optimization

### 3. Create Sessions Table

The sessions table will be created automatically on first use, but you can create it manually:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  data JSON NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_expires_at (expires_at)
);
```

### 4. Local Development

Install Netlify CLI:

```bash
npm install -g netlify-cli
```

Run local development server:

```bash
npm run dev
```

This will start Netlify Functions locally at `http://localhost:3000`.

### 5. Deploy to Netlify

#### Option A: Via Netlify CLI

```bash
# Login to Netlify
netlify login

# Initialize site
netlify init

# Deploy to production
npm run deploy
```

#### Option B: Via Git

1. Push your code to GitHub/GitLab/Bitbucket
2. Connect your repository in Netlify dashboard
3. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `.` (root)
   - **Functions directory**: `netlify/functions`

### 6. Set Environment Variables in Netlify

Go to your Netlify site dashboard → **Site settings** → **Environment variables** and add:

- `DATABASE_URL` (or `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- `DB_CA_CERT` - Aiven CA certificate (multi-line value)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- `MAX_LOGIN_ATTEMPTS`, `LOGIN_LOCK_MINUTES`
- `OPEN_TIME`, `CLOSE_TIME`, `REMINDER_MINUTES`

**Setting DB_CA_CERT in Netlify:**
1. Download CA certificate from Aiven Console
2. Open the file and copy the entire content (including `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`)
3. Paste it as the value for `DB_CA_CERT` in Netlify (supports multi-line)

**Note:** Node.js version is set to 20 in `netlify.toml` - no need to configure manually.

### 7. Configure Scheduled Functions

The reminder cron job is configured in `netlify/functions/reminder.js` with:

```js
export const config = {
  schedule: "*/5 * * * *", // Run every 5 minutes
};
```

Netlify will automatically detect and schedule this function.

## File Structure

```
room-booking-v2/
├── netlify/
│   └── functions/
│       ├── index.js          # Main API handler
│       └── reminder.js       # Scheduled cron function
├── src/
│   ├── config/
│   │   └── db.js            # MySQL connection (process.env)
│   ├── middleware/
│   │   └── session.js       # MySQL-based sessions
│   ├── routes/              # API routes
│   └── cron/
│       └── reminder.js      # Original cron (moved to netlify/functions)
├── netlify.toml             # Netlify configuration
├── package.json
└── .env.example
```

## Key Changes from Cloudflare Workers

### Database
- **Before**: Cloudflare Hyperdrive + MySQL
- **After**: Direct MySQL connection via `process.env.DATABASE_URL`

### Sessions
- **Before**: Cloudflare KV (auto-expire)
- **After**: MySQL sessions table (manual expiration check)

### Cron Jobs
- **Before**: Cloudflare Cron Triggers (`wrangler.toml`)
- **After**: Netlify Scheduled Functions (export config)

### Environment
- **Before**: `env` object passed to handlers
- **After**: `process.env` for all environment variables

## Troubleshooting

### Database Connection Issues

If you see connection errors:

1. Verify `DATABASE_URL` is correct in Netlify environment variables
2. Check Aiven MySQL is accessible from Netlify (whitelist Netlify IPs if needed)
3. Ensure SSL is enabled (`sslMode=REQUIRED`)

### Session Issues

If sessions aren't working:

1. Check sessions table exists in MySQL
2. Verify `expires_at` column is being set correctly
3. Run `cleanupExpiredSessions()` periodically to remove old sessions

### Cron Job Not Running

If reminder emails aren't sent:

1. Check Netlify Functions logs for errors
2. Verify email configuration (SMTP/API key)
3. Test the function manually via Netlify dashboard

### Build Errors

If deployment fails:

1. Ensure `netlify-cli` is in devDependencies
2. Check Node.js version (Netlify supports 18+)
3. Verify all imports are correct (no Cloudflare-specific imports)

## Monitoring

- **Function Logs**: Netlify Dashboard → Functions → Logs
- **Site Analytics**: Netlify Dashboard → Analytics
- **Database**: Aiven Console for MySQL metrics

## Cost Estimation

- **Netlify Functions**: Free tier includes 125k invocations/month
- **MySQL**: Depends on Aiven plan
- **Email**: Depends on email service provider

## Security Notes

- Never commit `.env` files to version control
- Use strong passwords for database and email
- Enable SSL for all database connections
- Rotate secrets regularly
- Use Netlify's environment variable encryption

## Support

For issues related to:
- **Netlify**: https://docs.netlify.com/
- **Aiven MySQL**: https://docs.aiven.io/
- **Hono**: https://hono.dev/
