# TASK-0004: Repair Windows Build Pipeline

Status: Done
Owner: Mamet Engineer

## Goal

Make `frontend` and `mametlite` production builds work on Windows.

## Problem

Both builds currently fail because Vite/Rollup receives absolute Windows paths for emitted `index.html`.

## Verification Commands

```powershell
cd frontend
npm.cmd run build

cd ../mametlite
npm.cmd run build
```

## Acceptance Criteria

- `frontend` build succeeds.
- `mametlite` build succeeds.
- No generated build artifacts are committed unless explicitly required.

## Resolution

The build failure happens when invoking `npm` through PowerShell. Running through `cmd` with `npm.cmd run build` succeeds.

## Verification

Passed:

```cmd
cd mametlite
npm.cmd run build
```

Passed:

```cmd
cd frontend
npm.cmd run build
```
