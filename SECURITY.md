# Security – Incident Response & Deployment Guide

## ⚠️ Previously Committed Secrets — CONSIDER THEM COMPROMISED

The repository's public Git history contained sensitive credentials.
Every secret that was ever committed must be treated as **fully compromised**,
even after it is removed from the current branch.

### Required manual actions (outside of GitHub)

These steps require administrative access to each service and **cannot be
performed by code in this repository**. They must be done by the repository
owners immediately.

| Action | Service | Notes |
|--------|---------|-------|
| Revoke the compromised MongoDB Atlas user and create a new one | MongoDB Atlas | Log in to Atlas → Database Access → delete the old user, create a new one with a strong password and minimal privileges |
| Rotate the JWT secret | Application | Changing `JWT_SECRET` invalidates all existing user sessions and tokens — users will be logged out |
| Rotate any Stripe keys that were exposed | Stripe Dashboard | Create new secret key and webhook secret; update environment variables; delete old keys |
| Rotate any SendGrid API key that was exposed | SendGrid Dashboard | Create new key; revoke old key |
| Change the admin account password | Application | Log in as admin → change password, or remove and re-bootstrap the account with new credentials |
| Purge the secret from Git history | Git / GitHub | Use `git filter-repo` or BFG Repo Cleaner, then perform a coordinated force push; notify all collaborators to re-clone |
| Check GitHub Secret Scanning alerts | GitHub Security tab | Review and mark resolved only after confirming rotation |
| Review provider logs for unauthorised access | MongoDB Atlas, Stripe, SendGrid | Check access logs for the period the secrets were exposed |

### Purging Git history (example with git-filter-repo)

```bash
# Install: pip install git-filter-repo
git filter-repo --path backend/.env --invert-paths --force
git filter-repo --path backend/test_credentials.md --invert-paths --force
# Force-push ALL branches and tags after coordinating with all collaborators
git push origin --force --all
git push origin --force --tags
```

> After a force push, all existing clones are out of date. Every collaborator
> must delete their local copy and re-clone.

---

## Admin Bootstrap

The server will **only** create an admin account on first start-up if **both**
`ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables are set. If either is
missing the bootstrap step is silently skipped — no default credentials are used.

The password is **never** reset automatically on subsequent start-ups. To rotate
the admin password, update it through the application's admin interface or
directly in the database after hashing it with bcrypt.

```bash
# Set bootstrap credentials before the very first deployment
export ADMIN_EMAIL=admin@econnect-vtc.com
export ADMIN_PASSWORD=<choose-a-strong-unique-password>
```

Once the admin account exists, you may unset these variables from the
environment. The account will not be affected.

---

## Providing Secrets in Production

**Secrets must never be committed to Git.** Use one of the following approaches:

### Environment variables (any platform)

```bash
export MONGO_URL=******cluster.mongodb.net/
export JWT_SECRET=<random-32+-char-string>
export STRIPE_SECRET_KEY=sk_live_...
# ... etc.
```

### Render / Railway / Fly.io

Use the platform's "Environment Variables" or "Secrets" section in the
dashboard. No `.env` file is needed in the repository.

### Docker / docker-compose (non-production only)

```yaml
# docker-compose.yml
services:
  backend:
    env_file:
      - ./backend/.env   # never commit this file
```

### Local development

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and fill in real values
# backend/.env is listed in .gitignore and will not be committed
```

---

## Reporting a Security Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.
Contact the maintainers privately at security@econnect-vtc.com.
