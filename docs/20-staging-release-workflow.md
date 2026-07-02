# Staging And Release Workflow

This project uses a separate staging site for redesign work so production can stay stable while colleagues keep working.

## Environments

- Production: `https://kontur.derevgroup.ru`
- Staging: `https://staging.79-143-30-43.sslip.io`
- Production branch: `main`
- Staging branch: `codex/ui-redesign-staging`

Staging uses its own Docker Compose project and its own database volume. It can be refreshed from a production SQLite backup, but all staging writes stay separate from production.

## Release Rhythm

1. Create or continue work on `codex/ui-redesign-staging`.
2. Make a small release-sized change.
3. Run local QA:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run test:qa`
   - `npm run qa`
4. Push the staging branch.
5. Deploy only staging:
   - `cd /opt/stroitelnyi-kontur-staging`
   - `git pull`
   - `deploy/staging-up.sh`
6. Check:
   - staging `/version`
   - staging `/health`
   - QA report
   - key screens in browser and mobile viewport
7. If accepted, merge the release into `main`.
8. Before production deployment, run `deploy/backup.sh`.
9. Deploy production only after explicit approval.

## Rollback

### Staging rollback

```bash
cd /opt/stroitelnyi-kontur-staging
deploy/staging-rollback.sh <previous-commit>
```

### Production rollback

Production rollback requires two parts:

1. Return code to a known good commit and run production update.
2. Restore database only if the release changed or corrupted data.

```bash
cd /opt/stroitelnyi-kontur
git checkout <previous-good-commit>
deploy/update.sh
```

If database restore is needed:

```bash
deploy/restore-sqlite.sh data/backups/<backup-file>.db
```

## Rules For UI Redesign Work

- Do not deploy redesign work directly to production.
- Do not reuse Claude Design runtime in production.
- Use the Claude prototype as a UX/UI reference only.
- Keep production on `main`.
- Keep redesign work on `codex/ui-redesign-staging` until accepted.
- Each release must be small enough to rollback safely.
- MAX messages for colleagues should describe user-facing changes only, with no developer details.
