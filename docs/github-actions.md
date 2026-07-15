# GitHub Actions Setup

This document describes the GitHub Actions workflows configured for the permissions service package.

## Workflows

### 1. CI Workflow (`.github/workflows/ci.yml`)

**Triggers:**
- Pull requests to `main` branch
- Pushes to `main` branch

**Features:**
- Runs on a matrix of Node.js versions (22 and 24)
- Runs formatter and linter checks with Biome
- Executes full test suite
- Runs TypeScript compilation
- Validates package can be packed
- Cancels superseded runs for the same ref via concurrency
- Runs with least-privilege `contents: read` permissions

**Steps:**
1. Checkout code
2. Setup Node.js (matrix version) with npm cache
3. Install dependencies with `npm ci`
4. Run checks with `npm run check`
5. Run tests with `npm run test:run`
6. Run TypeScript build with `npm run build`
7. Verify package can be packed with `npm pack --dry-run`

### 2. Publish Workflow (`.github/workflows/publish.yml`)

**Triggers:**
- Manual `workflow_dispatch`, with a required `release-type` input (`patch`, `minor`, or `major`; defaults to `patch`)

**Features:**
- Bumps the version, tags, and pushes as part of the run (via `npm version`)
- Publishes to NPM with public access
- Creates a GitHub release with auto-generated notes
- Guarded to run only from `main`
- Serializes runs via a workflow-level concurrency group (does not cancel in progress)

**Steps:**
1. Generate a GitHub App token (`actions/create-github-app-token`)
2. Checkout code using the app token
3. Fail fast unless the current branch is `main`
4. Setup Node.js from `.nvmrc` with the NPM registry configured
5. Install dependencies with `npm ci`
6. Run tests with `npm run test:run`
7. Build with `npm run build`
8. Configure the `github-actions[bot]` git identity
9. Bump version and create a tag: `npm version <release-type>` (commit message `chore: release v%s [skip ci]`)
10. Push the commit and tag with `git push --follow-tags`
11. Publish to NPM with `npm publish --access public`
12. Create a GitHub release with `gh release create v<version> --generate-notes`

## Required Secrets

The publish workflow authenticates through a GitHub App and publishes to NPM via OIDC trusted publishing. Add these repository secrets:

### `LEVANTE_BOT_APP_CLIENT_ID`
The client ID of the GitHub App used to mint a token for checkout, pushing the release commit/tag, and creating the release.

### `LEVANTE_BOT_APP_PRIVATE_KEY`
The private key for that same GitHub App.

> NPM authentication uses OIDC trusted publishing (the workflow requests `id-token: write`), so no `NPM_TOKEN` secret is required. Configure this package as a trusted publisher for the workflow in your NPM package settings.

## Package Configuration

The workflows assume:
- Package name: `@levante-framework/permissions-core`
- Main branch: `main`
- Node.js: CI tests a matrix of 22 and 24; publish uses the version pinned in `.nvmrc`
- NPM scripts: `build`, `check`, `test:run`

## Version Management

The publish workflow owns version bumping. Based on the chosen `release-type`, it runs `npm version` to update `package.json`, commit (`chore: release v%s [skip ci]`), and tag, then pushes the commit and tag.

**To publish a new version:**
1. Go to the Actions tab and run the **Publish permissions-core** workflow from `main`
2. Choose the release type (`patch`, `minor`, or `major`)
3. The workflow bumps the version, publishes to NPM, and creates the GitHub release

## Workflow Status

Both workflows will show status badges in pull requests and on the repository main page, providing immediate feedback on build and test status.
