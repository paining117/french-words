# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Release requirement

The date editing UI, debug persistence/restore code and clock override capability were physically removed on 2026-09-23 at the user's request. Do not reintroduce them. All runtime business dates use the device clock through appNow(). Migration v5 removes only the legacy dev_date_offset_days setting, preserving Cards, logs, rounds, check-ins and other preferences. See docs/release-checklist.md for automated verification and still-pending device checks.
