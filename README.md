# Lumby Castle Bingo Tracker

This is a free-hosting/shared-database version of the uploaded bingo tracker.

## Architecture

- **Website:** GitHub Pages (free for public repositories)
- **Database + realtime:** Supabase
- **Frontend:** plain HTML/CSS/JavaScript
- **Authentication:** Supabase email magic-link for admin access

## 1. Create Supabase

Create a free Supabase project.

Open **SQL Editor** and paste the contents of `schema.sql`, then run it.

## 2. Create your admin account

In Supabase Authentication, create/sign in the email account you want to use as the bingo admin.

After the account exists, copy its user UUID from Authentication > Users.

In SQL Editor run:

```sql
insert into public.admin_users(user_id)
values ('YOUR-USER-UUID');
```

## 3. Get the Supabase keys

In Supabase go to Project Settings > API.

Copy:
- Project URL
- anon/public key

Open `app.js` and replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Do NOT put a service-role/secret key in `app.js`.

## 4. Test locally

Because this site uses browser modules/CDN resources and Supabase, use a small local web server instead of double-clicking the HTML.

If Python is installed:

```bash
python -m http.server 8000
```

Then open:

http://localhost:8000

## 5. Put it online with GitHub Pages

Create a public GitHub repository and upload:

- index.html
- style.css
- app.js
- schema.sql
- README.md

Enable GitHub Pages under:

Repository > Settings > Pages > Deploy from a branch > main > / (root)

Your site will become:

https://YOUR-GITHUB-USERNAME.github.io/REPOSITORY-NAME/

## How it works

Everyone sees the same teams, tasks, completion states, verification states, points and leaderboard because those records live in Supabase rather than local browser storage.

The page subscribes to Supabase realtime changes, so a change made by one person can appear on other open copies of the tracker.

## Important security note

The Supabase `anon` key is safe to use in a browser when Row Level Security is configured correctly. Never expose a Supabase service-role key in the website.

For a production event, keep admin operations limited to the authenticated accounts listed in `admin_users`.
