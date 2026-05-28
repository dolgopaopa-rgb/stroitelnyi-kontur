# Role Persistence Fix

Date: 2026-05-28

## Issue

When the user selected a test role, for example `sales_manager`, and refreshed the browser page, the role selector returned to the account role, usually `owner`.

## Cause

The selected role was already stored in `localStorage`, but app startup loaded `/api/session` and immediately overwrote `state.currentRole` with the logged-in account role before the role selector was rendered.

## Fix

`loadSession()` now keeps the saved role when the current account is allowed to switch roles. If switching is not allowed, the app still uses the logged-in account role.

Static asset versions were bumped to `20260528-role-persist` so browsers and installed mobile shortcuts load the new JavaScript instead of a cached copy.

## Verification

Local browser check:

1. Opened the app locally.
2. Selected `Менеджер`.
3. Reloaded the page.
4. Confirmed the selected role stayed `Менеджер`.

No production data was changed.
