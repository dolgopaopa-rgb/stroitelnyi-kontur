# Project Form Save And Draft Fix

Date: 2026-05-28

## Issue

While creating a new project, pressing the save/create button could appear to do nothing. After refreshing the browser, the entered form data was lost.

## Cause

The browser's native required-field validation could block submit before the app's JavaScript handler ran, so the app did not show its own clear message inside the modal. Also, file preparation can take time, but there was no visible in-form saving state.

The form did not keep a local text draft during filling. Browser security does not allow restoring selected file inputs after a page reload.

## Fix

- Added manual validation for the new project form.
- Added an in-modal status area with clear messages for missing fields, saving progress, and errors.
- Added local browser draft autosave for text fields: title, customer, address, Smetter, planned date, and estimate amount.
- Restored saved text fields when the user opens `Новый объект` again after a page refresh.
- Preserved file names in the draft note so the user knows which files must be selected again.
- Disabled the create/draft buttons while saving to prevent double submits.
- Bumped static asset cache version to `20260528-project-draft`.

## Verification

Local browser check:

1. Opened `Новый объект`.
2. Filled text fields without attaching files.
3. Pressed `Создать`.
4. Confirmed the modal shows the missing file list instead of doing nothing.
5. Refreshed the page.
6. Opened `Новый объект` again.
7. Confirmed the text fields were restored.
8. Pressed `Сохранить черновик`.
9. Confirmed a draft project was created locally and the modal closed.

No production data was changed during local verification.
