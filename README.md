# ClassMarket

A free-to-play prediction market website in the style of Polymarket. People make an account, get 1,000 free points and vote on markets. Odds move as people vote.

## Features

- **Accounts:** sign up with full name, username, email, password, an optional date of birth and an optional profile photo.
- **Markets:** Yes/No or multiple-option questions, each with a picture, a description (rules), a category and an end date. Options in multi-option markets can have their own thumbnails.
- **Voting:** spend points to buy shares of an outcome, or sell them back. A winning share pays 1 point when the admin resolves the market.
- **Odds:** priced with LMSR (Logarithmic Market Scoring Rule), the automated market maker Polymarket originally used. See `public/lmsr.js`.
- **Profile:** each user sees their own positions and vote history. Nobody else can see them.
- **Admin page:** create markets with pictures, resolve them, and delete markets, single votes or users. Deleting a vote or an unresolved market refunds the points.

## Run it locally

You need Node.js 22.5 or newer.

```bash
npm install
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='your-password' npm start
```

Then open http://localhost:3000. Log in with the admin email and password, and the **Admin** button appears in the top bar.

## Settings (environment variables)

| Variable | What it does |
| --- | --- |
| `ADMIN_EMAIL` | Email of the admin account. Created or updated on every start. |
| `ADMIN_PASSWORD` | Password of the admin account. |
| `PORT` | Port to listen on (default `3000`). |
| `DATA_DIR` | Folder for the database and uploaded pictures (default `./data`). Point it at a persistent disk in production. |
| `NODE_ENV` | Set to `production` when hosted over HTTPS so login cookies are marked secure. |

The admin password is never stored in the code. Set it only in your hosting dashboard.

## Put it online (Render)

1. Sign in at https://render.com with GitHub and choose **New → Web Service**, then pick this repo and branch.
2. Build command: `npm install`. Start command: `npm start`.
3. Under **Environment**, add `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV=production` and `DATA_DIR=/var/data`.
4. Add a **Disk** mounted at `/var/data` so accounts and votes survive restarts. Disks need a paid instance. On the free plan, all data is wiped whenever the site restarts.
5. Deploy. Render gives you a public link like `https://classmarket.onrender.com`.

Any host that runs Node.js with a persistent disk works the same way (Railway, Fly.io, a VPS).
