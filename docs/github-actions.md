# GitHub Actions Setup

This document describes the GitHub Actions workflows configured for the permissions service package.

## Workflows

### 1. Test Workflow (`.github/workflows/test.yml`)

**Triggers:**
- Pull requests to `main` branch
- Pushes to `main` branch

**Features:**
- Tests on current LTS and previous LTS Node.js versions
- Runs TypeScript compilation
- Executes full test suite
- Validates package can be built

**Steps:**
1. Checkout code
2. Setup Node.js with npm cache
3. Install dependencies with `npm ci`
4. Run TypeScript build
5. Run tests
6. Verify package can be packed

### 2. Publish Workflow (`.github/workflows/publish.yml`)

**Triggers:**
- Pushes to `main` branch (excluding docs and markdown files)

**Features:**
- Automatic version detection
- Only publishes when version changes
- Creates GitHub releases
- Publishes to NPM with public access

**Steps:**
1. Checkout code
2. Setup Node.js with NPM registry
3. Install dependencies and run tests
4. Build package
5. Check if version changed compared to published version
6. Publish to NPM (if version changed)
7. Create GitHub release (if version changed)

## Required Secrets

To enable the publish workflow, add these secrets to your GitHub repository:

### `NPM_TOKEN`
1. Go to [npmjs.com](https://www.npmjs.com) and log in
2. Go to Access Tokens in your account settings
3. Create a new token with "Automation" type
4. Add the token as `NPM_TOKEN` in GitHub repository secrets

### `GITHUB_TOKEN`
This is automatically provided by GitHub Actions - no setup required.

## Package Configuration

The workflows assume:
- Package name: `@yourorg/permissions-core`
- Main branch: `main`
- Node.js versions: Current LTS and previous LTS
- NPM scripts: `build`, `test:run`

## Version Management

The publish workflow automatically detects version changes by comparing:
- Current version in `package.json`
- Latest published version on NPM

**To publish a new version:**
1. Update version in `package.json`
2. Commit and push to `main` branch
3. GitHub Actions will automatically publish and create a release

## Workflow Status

Both workflows will show status badges in pull requests and on the repository main page, providing immediate feedback on build and test status.