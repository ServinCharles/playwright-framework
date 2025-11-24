# Playwright Automation Framework

A scalable automation framework using Playwright (TypeScript), Page Object Model, BrowserStack, and Jenkins.

## 🚀 Features
- **Web & Mobile Support:** Runs on Desktop (Chrome/Firefox) and Mobile Emulation (iPhone/Pixel).
- **BrowserStack Integration:** Seamless cross-browser cloud execution.
- **CI/CD:** Jenkins pipeline configuration included.
- **Reporting:** HTML & JUnit reporting.

## 📂 Structure
- `pages/`: Page Object classes (Locators & Actions).
- `tests/`: Test specifications.
- `jenkins/`: CI pipeline configuration.
- `playwright.config.ts`: Framework configuration.

## 🛠️ Prerequisites
1. **Node.js** (v14 or higher)
2. **BrowserStack Account** (for cloud testing)

## 📦 Installation

```bash
npm install
npx playwright install
```

## ⚙️ Configuration
Create a `.env` file in the root directory:

```properties
BROWSERSTACK_USERNAME=your_username
BROWSERSTACK_ACCESS_KEY=your_access_key
```

## 🏃 Running Tests

### 1. Local Execution
Run tests on your local machine (Headless by default):

```bash
# Run all tests
npx playwright test

# Run specific project (Desktop)
npx playwright test --project=chromium

# Run specific project (Mobile Emulation)
npx playwright test --project=mobile-safari

# Run in headed mode (visible browser)
npx playwright test --headed
```

### 2. BrowserStack Execution
To run tests on the BrowserStack cloud, set the environment variable `execution=cloud`:

```bash
# Linux/Mac
execution=cloud npx playwright test --project=bs-chrome

# Windows (PowerShell)
$env:execution="cloud"; npx playwright test --project=bs-chrome
```

### 3. Viewing Reports
After execution, a report is generated automatically.

```bash
npx playwright show-report
```

## 🏗️ Jenkins Setup

1. **New Item:** Create a "Pipeline" project in Jenkins.
2. **SCM:** Point to your Git repository.
3. **Script Path:** Set to `jenkins/Jenkinsfile`.
4. **Parameters:** You can add a String Parameter `EXECUTION_TYPE` (default: `local`) to switch between local and cloud runs easily in the UI.
5. **Plugins Needed:**
   - Node.js Plugin
   - HTML Publisher Plugin
   - JUnit Plugin

## 📱 Mobile Application Testing Note
This framework is configured for **Mobile Web** (Websites on Mobile Browsers).
For **Native App** (APK/IPA) automation, Playwright has experimental Android support, but it is recommended to use Appium. However, this framework fully supports Mobile Viewport testing via Playwright's emulation and BrowserStack real devices for web.