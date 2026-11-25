# EP site

A pay-to-access site for one EP. Fans open your link, create an account (name, phone, password), pay by mobile money or bank, upload a screenshot with the transaction ID, and the admin approves them from a dashboard. Approved fans can stream and download every song, unlimited times. The admin sees sign-ups, approvals, plays and download numbers.

Powered by Lorgodan (shown in the footer; change it in `config.js`).

Everything runs on free plans: **Supabase** (database and file storage) and **Render** (hosting).

## What is in the folder

| File | What it does |
|---|---|
| `config.js` | **Edit this first.** Artist name, EP title, price, colours, payment numbers, bio, social links, WhatsApp message wording |
| `public/assets/cover.jpg` | The cover art (black and white) |
| `render.yaml` | Tells Render how to run the site |
| `schema.sql` | Database tables. Run once in Supabase |
| `server.js` | The back end |
| `public/` | The fan site (`index.html`) and the admin dashboard (`admin.html`) |
| `.env.example` | The secret settings you must fill in |

## 1. Set up Supabase (10 minutes)

1. Create a free account at supabase.com and make a **new project** (use a new one, not your other apps' project). Save the database password somewhere.
2. Open **SQL Editor > New query**, paste the whole of `schema.sql`, and press **Run**. It should say "Success".
3. Open **Project Settings > API** (or **API Keys**). Copy:
   - the **Project URL**
   - the **service_role** key (a secret key also works). Keep it private. It goes only into Render or your `.env`, never into the website files.

The three storage folders (`songs`, `screenshots`, `previews`) are created automatically when the server first starts.

## 2. Try it on your computer (optional but recommended)

```bash
npm install
cp .env.example .env     # then open .env and fill it in
npm start
```

Open http://localhost:3000. The admin dashboard is at http://localhost:3000/admin.html and you log in with `ADMIN_PHONE` and `ADMIN_PASSWORD` from your `.env`.

## 3. Put it online (GitHub + Render)

**Where the data lives:** fans, payments, play and download counts are in the Supabase database. Songs, previews and payment screenshots are in Supabase Storage. Render only runs the code and keeps nothing on its own disk, so restarts, redeploys and the free plan's sleeping can never wipe your data.

1. Create an empty repository on GitHub (private is fine) and push this folder to it. The `.gitignore` keeps `.env` out.
2. On render.com choose **New > Blueprint**, pick the repository, and Render reads `render.yaml`. It asks you for these values (type them in the Render page; never put them in GitHub):
   - `SUPABASE_URL`: your Supabase Project URL
   - `SUPABASE_SERVICE_KEY`: the service_role / secret key
   - `ADMIN_PHONE` and `ADMIN_PASSWORD`: the admin's login (choose a strong password)
   `JWT_SECRET` is generated for you.
3. Deploy. Your site is at `https://kolino-ep.onrender.com` (Render adds letters if the name is taken), and the admin dashboard is at `/admin.html`.
4. From now on, every push to GitHub redeploys automatically.

Changing `ADMIN_PASSWORD` on Render and redeploying also changes the admin's password.

### Keep it awake (free)

Free Render sites sleep after about 15 minutes without visitors, and the first visit afterwards takes up to a minute. Free Supabase projects also pause after about a week without activity. Fix both with a free monitor:

1. Make a free account at uptimerobot.com.
2. Add an HTTP monitor for `https://your-name.onrender.com/healthz`, checking every 5 minutes.

That address wakes Render and touches the database, so neither goes to sleep. Check each service's current free-plan limits on its pricing page, because they change.

## 4. First day with the client

1. Edit `config.js`: artist name, EP title, price, colours, bio, payment numbers, social links.
2. The cover is already set. For sharper screens, swap `public/assets/cover.jpg` for a larger square version (about 1000 x 1000 px, under 300 KB).
3. Push the changes to GitHub. Render redeploys by itself.
4. Log in at `/admin.html`, open the **Songs** tab and add each song:
   - **Full song**: MP3 at 128 to 192 kbps keeps files small.
   - **Preview clip** (optional): a 20 to 30 second MP3 of the same song. Anyone can hear previews without paying.
5. Open the normal site, create a test fan account, and go through payment to check the whole flow. Approve it from the admin dashboard, check that you can stream and download, then use **Remove access** on the test fan.
6. Share the link.

## Daily use (admin dashboard)

- **Payments**: new proofs are listed oldest first. Tap the screenshot to enlarge it, **check the money really arrived on your own Airtel, TNM or bank statement**, and match the transaction ID. Then Approve or Reject. After either, a **Message on WhatsApp** button opens WhatsApp with the message already written. Edit the wording in `config.js > messages`.
- **Fans**: search by name or phone, message anyone on WhatsApp, give a new password to someone who forgot theirs (it is shown once; send it by WhatsApp), remove access, or download the list as a CSV file.
- **Overview**: waiting, approved, estimated income, plays, total downloads, how many different fans downloaded, and numbers per song, plus the latest downloads with names.
- **Songs**: add or delete songs, and see plays and downloads for each.

The same transaction ID cannot be submitted twice, which stops one payment being used by many people.

## Free-plan limits to watch

- **Supabase free storage bandwidth** (about 5 GB a month when this was written). The EP is under 50 MB, so 70 fans each streaming a few times and downloading once is close to that limit. Keep songs as compressed MP3s. If you ever hit the limit, the audio files can be moved to Cloudflare R2, which has free downloads. That is a small change to `server.js`.
- **Render free** sleeps when idle (solved above) and restarts now and then. Nothing is stored on its disk, so restarts lose nothing.

## Security notes

- Songs and payment screenshots are in **private** storage. Songs are only given out through links that last one hour (streams) or five minutes (downloads), and only to approved fans.
- Passwords are stored hashed. Login attempts are rate limited.
- Nobody can stop an approved fan from sharing a downloaded file. This site stops casual sharing of the link and nothing more.
- Never share the `service_role` key or `.env`. If it leaks, make a new key in Supabase and update Render.

## Changing things later

- Price, numbers, colours, text, social links: `config.js`.
- To add another social network, add a line to `socials` using one of: facebook, instagram, tiktok, youtube, x, whatsapp, spotify, applemusic, soundcloud, audiomack, snapchat, telegram.
- Phone numbers are Malawi numbers (`0999 123 456` or `+265 999 123 456`). Another country needs a small change in `normalizePhone` in `server.js`.
