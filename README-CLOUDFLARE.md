# Room Booking System - Cloudflare Workers Deployment Guide

This guide covers deploying the Room Booking System on Cloudflare Workers with MySQL (Aiven or external), KV for sessions, and Cron Triggers for scheduled tasks.

## Prerequisites

- Node.js 18+ installed
- Cloudflare account (free tier works)
- Wrangler CLI installed
- MySQL database (Aiven, PlanetScale, or any external MySQL)
- Git repository

## Architecture

- **Backend**: Cloudflare Workers (Node.js compatibility)
- **Framework**: Hono (lightweight web framework)
- **Database**: MySQL via Hyperdrive (recommended) or direct connection
- **Sessions**: Cloudflare KV (with auto-expiration)
- **Email**: SMTP or Email API (SendGrid/Resend/Cloudflare Email Routing)
- **Cron Jobs**: Cloudflare Cron Triggers
- **Static Assets**: Cloudflare Workers Assets binding

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 3. Configure wrangler.toml

Copy the example configuration and fill in your values:

```bash
cp wrangler.toml.example wrangler.toml
```

Update the following in `wrangler.toml`:

```toml
name = "room-booking-system"
main = "src/index.js"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

# KV namespace for sessions
[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_KV_NAMESPACE_ID"
preview_id = "YOUR_PREVIEW_KV_NAMESPACE_ID"

# Hyperdrive configuration (recommended for MySQL)
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "YOUR_HYPERDRIVE_ID"

# Cron triggers for reminder scheduler
[triggers]
crons = ["*/5 * * * *"]  # Run every 5 minutes

# Static assets for frontend
[assets]
directory = "./frontend"
binding = "ASSETS"
```

### 4. Create Cloudflare Resources

#### 4.1 Create KV Namespace for Sessions

```bash
# Create production KV namespace
wrangler kv namespace create SESSIONS

# Create preview KV namespace for development
wrangler kv namespace create SESSIONS --preview

# Copy the IDs to wrangler.toml
```

#### 4.2 Set Up Database

**Option A: Using Hyperdrive (Recommended)**

Hyperdrive provides fast, secure connections to your existing MySQL database.

```bash
# Create Hyperdrive configuration
wrangler hyperdrive create room-booking-mysql

# You'll need your MySQL connection string:
# mysql://user:password@host:port/database
```

**Option B: Direct MySQL Connection**

If you prefer not to use Hyperdrive, you can connect directly to MySQL.

#### 4.3 Set Environment Variables

Set secrets using Wrangler:

```bash
# Database connection (if not using Hyperdrive)
wrangler secret put DATABASE_URL
# Enter: mysql://user:password@host:port/database

# Database CA certificate (for SSL connections)
wrangler secret put DB_CA_CERT
# Paste the full certificate content including BEGIN/END CERTIFICATE

# Email configuration (SMTP)
wrangler secret put SMTP_HOST
wrangler secret put SMTP_PORT
wrangler secret put SMTP_USER
wrangler secret put SMTP_PASSWORD
wrangler secret put SMTP_FROM
```

### 5. Local Development

Start the local development server:

```bash
npm run dev
```

This will start Cloudflare Workers locally at `http://localhost:8787`.

### 6. Deploy to Cloudflare

#### Deploy to Preview/Development

```bash
npm run deploy
```

#### Deploy to Staging

```bash
npm run deploy:staging
```

#### Deploy to Production

```bash
npm run deploy:production
```

### 7. Configure Custom Domain (Optional)

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your worker
3. Go to Settings → Triggers → Custom Domains
4. Add your custom domain

## Key Changes from Netlify

### Database
- **Before**: Direct MySQL connection via `process.env.DATABASE_URL`
- **After**: Hyperdrive (recommended) or direct connection via `env` bindings

### Sessions
- **Before**: MySQL sessions table with manual expiration
- **After**: Cloudflare KV with automatic TTL-based expiration

### Cron Jobs
- **Before**: Netlify Scheduled Functions (export config)
- **After**: Cloudflare Cron Triggers in `wrangler.toml`

### Environment
- **Before**: `process.env` for all environment variables
- **After**: `env` object passed to handlers + `process.env` for secrets

### Static Assets
- **Before**: Netlify serves from `frontend` directory
- **After**: Cloudflare Workers Assets binding

## File Structure

```
room-booking-v2/
├── src/
│   ├── index.js              # Main Cloudflare Workers handler
│   ├── config/
│   │   └── db.js            # MySQL connection (Hyperdrive/direct)
│   ├── middleware/
│   │   ├── auth.js          # Authentication middleware
│   │   └── session.js       # KV-based sessions
│   ├── routes/              # API routes
│   │   ├── auth.js
│   │   ├── bookings.js
│   │   ├── rooms.js
│   │   ├── queues.js
│   │   ├── maintenance.js
│   │   ├── password-reset.js
│   │   ├── holidays.js
│   │   └── admin/           # Admin routes
│   ├── scheduled/
│   │   └── reminder.js      # Cron job for reminders
│   └── utils/               # Utility functions
├── frontend/                # Static HTML/CSS/JS files
├── wrangler.toml            # Cloudflare Workers configuration
├── wrangler.toml.example    # Example configuration
├── package.json
└── .env.example
```

## Troubleshooting

### Database Connection Issues

If you see connection errors:

1. Verify `DATABASE_URL` or Hyperdrive configuration is correct
2. Check MySQL is accessible from Cloudflare (whitelist Cloudflare IPs if needed)
3. Ensure SSL is enabled for external MySQL connections
4. Verify CA certificate is correctly set in `DB_CA_CERT` secret

### Session Issues

If sessions aren't working:

1. Verify KV namespace is correctly bound in `wrangler.toml`
2. Check KV namespace ID matches your Cloudflare account
3. Ensure session middleware is correctly passing `env` parameter

### Cron Job Not Running

If reminder emails aren't sent:

1. Check Cron Triggers are configured in `wrangler.toml`
2. Verify scheduled function is correctly exported
3. Check Workers logs via `npm run tail` or Cloudflare Dashboard
4. Verify email configuration (SMTP/API key)

### Build/Deployment Errors

If deployment fails:

1. Ensure `wrangler` is in devDependencies
2. Check Node.js compatibility flags in `wrangler.toml`
3. Verify all imports are correct (no Netlify-specific imports)
4. Check for any syntax errors in your code

## Monitoring

- **Workers Logs**: `npm run tail` or Cloudflare Dashboard → Workers → Logs
- **Analytics**: Cloudflare Dashboard → Workers → Analytics
- **KV Storage**: Cloudflare Dashboard → Workers → KV
- **Database**: Your MySQL provider's dashboard (Aiven, PlanetScale, etc.)

## Cost Estimation

- **Cloudflare Workers**: Free tier includes 100k requests/day
- **KV Storage**: Free tier includes 100k reads/day, 1k writes/day
- **Hyperdrive**: Free tier includes 1M requests/month
- **MySQL**: Depends on your database provider
- **Email**: Depends on email service provider

## Security Notes

- Never commit `wrangler.toml` with secrets to version control
- Use Cloudflare Secrets for sensitive data
- Enable SSL for all database connections
- Rotate secrets regularly
- Use Cloudflare's built-in DDoS protection

## Useful Wrangler Commands

```bash
# Development
npm run dev              # Start local dev server
npm run tail            # Tail live logs
npm run secret          # Manage secrets

# KV operations
wrangler kv namespace list      # List KV namespaces
wrangler kv key put SESSIONS key value  # Put key in KV
wrangler kv key get SESSIONS key        # Get key from KV

# D1 operations (if using D1 instead of external MySQL)
wrangler d1 create room-booking-db
wrangler d1 execute room-booking-db --file=./schema.sql

# Hyperdrive operations
wrangler hyperdrive list
wrangler hyperdrive create

# Deployment
npm run deploy                    # Deploy to default environment
npm run deploy:staging            # Deploy to staging
npm run deploy:production        # Deploy to production
```

## Support

For issues related to:
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/
- **Hono**: https://hono.dev/
- **Hyperdrive**: https://developers.cloudflare.com/hyperdrive/
- **KV**: https://developers.cloudflare.com/workers/runtime-apis/kv/
- **Cron Triggers**: https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Migration from Netlify

If you're migrating from the Netlify version:

1. ✅ Backend already migrated to Hono framework
2. ✅ Sessions migrated from MySQL to KV
3. ✅ Cron jobs migrated to Cloudflare Cron Triggers
4. ✅ Environment variables updated to use `env` bindings
5. ✅ Static assets configured with Workers Assets binding
6. ✅ All database queries updated to pass `env` parameter

The migration is complete! You can now deploy to Cloudflare Workers.
