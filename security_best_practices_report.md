# Security / Runtime Risk Review

## Executive Summary

I verified the three claims against the codebase. Two are real risks, one is overstated as a security control, and one is a genuine supply-chain/runtime concern.

### Status

- `XSS vulnerabilities`: **Real**
- `security.js`: **Security theater / overstated as protection**
- `jsPDF loaded from CDN`: **Real runtime/supply-chain risk**

The most important related issue is that I did not find any CSP or Trusted Types policy in the repo, so any DOM XSS has a larger blast radius than it should.

## Findings

### 1. DOM XSS in invoice preview rendering

- **Severity:** High
- **Location:** `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/modules/ui.js:14-39`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/modules/ui.js:150-180`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/modules/ui.js:241-299`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/modules/ui.js:302-320`
- **Evidence:** `gatherFormData()` collects raw user-controlled fields such as `desc`, `client`, `consultant`, `period`, `notes`, `business_info.address`, and `client_info.address`. `renderPaper()` and `renderItemDetails()` then inject those values into `preview.innerHTML` without escaping.
- **Impact:** A malicious invoice/template value can execute script inside the invoice editor preview. Because the values are persisted and reloaded, this is at least self-XSS and can become stored XSS if attacker-controlled content is saved and later viewed by the same authenticated origin.
- **Fix:** Escape every interpolated field before inserting into `innerHTML`, or replace the preview assembly with DOM node creation / `textContent`. The lowest-risk diff is to reuse a single HTML-escape helper everywhere in `src/modules/ui.js`.
- **Mitigation:** Add a CSP and Trusted Types policy if the deployment model allows it, so a missed escaping path is less likely to become an origin-wide compromise.

### 2. Error overlays are also DOM XSS sinks

- **Severity:** Medium
- **Location:** `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/app-main.js:173-185` and the same pattern in `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/dashboard-main.js:71-74`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/invoices-main.js:71-74`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/consultants-main.js:43-47`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/timesheets-main.js:57-61`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/analytics-main.js:48-52`
- **Evidence:** Fatal error handlers append a fixed HTML overlay with `msg.innerHTML = ... ${err.message} ...` or equivalent `document.body.innerHTML += ... ${err.message} ...`.
- **Impact:** If an exception message ever contains attacker-controlled text, it can execute in the page. This is lower risk than the invoice preview issue, but it is still a real DOM XSS sink.
- **Fix:** Build the error overlay with DOM nodes and `textContent`, or escape `err.message` before interpolation.
- **Mitigation:** Keep the overlay minimal and plain-text only.

### 3. `security.js` is not a real security control

- **Severity:** Low
- **Location:** `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/security.js:1-52`, imported from `/Users/vinay/IdeaProjects/Side Projects/Invoices/auth.html:131-135`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/app-main.js:1-29`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/dashboard-main.js:1-9`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/invoices-main.js:1-7`
- **Evidence:** The module only disables right-click, blocks a few keyboard shortcuts, clears the console, and prints a warning.
- **Impact:** This does not stop XSS, script tampering, or data extraction. It mainly creates a false sense of protection and can interfere with normal user and developer workflows.
- **Fix:** Remove it, or keep it only as a dev-facing warning banner if that is the actual intent. Do not treat it as a protection layer.
- **Mitigation:** Invest in actual controls: input escaping, CSP, Trusted Types, and safe third-party script loading.

### 4. `jsPDF` is loaded from a CDN without integrity controls

- **Severity:** Medium
- **Location:** `/Users/vinay/IdeaProjects/Side Projects/Invoices/app.html:13-15`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/invoices.html:13-14`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/src/modules/pdf.js:8-36`
- **Evidence:** The HTML entrypoints include `cdnjs.cloudflare.com` scripts directly, and `src/modules/pdf.js` can inject the same CDN URLs dynamically. There is no visible SRI hash or local bundling.
- **Impact:** If the CDN response is altered or intercepted, code runs with your origin privileges. That is a real supply-chain/runtime risk for an app that handles invoices and auth-gated data.
- **Fix:** Prefer bundling `jsPDF` via npm/Vite and importing it locally. If a CDN must be kept, add `integrity` and `crossorigin="anonymous"` and remove the dynamic fallback loader.
- **Mitigation:** Pin the version, self-host the asset, and keep the loading path deterministic.

## Major Related Issue

### No CSP / Trusted Types policy visible in the repo

- **Severity:** Medium
- **Location:** Entry points such as `/Users/vinay/IdeaProjects/Side Projects/Invoices/app.html:4-17`, `/Users/vinay/IdeaProjects/Side Projects/Invoices/invoices.html:4-20`, and the other app pages
- **Evidence:** I did not find a CSP meta tag or any Trusted Types policy in the repository, and the app relies heavily on `innerHTML` across multiple pages/modules.
- **Impact:** Any DOM XSS that slips through is much easier to exploit because there is no visible policy barrier in the app code.
- **Fix:** Add a CSP at the deployment edge if possible, and consider Trusted Types for the browser app where compatible.
- **Mitigation:** At minimum, remove unsafe sinks or route all dynamic HTML through a single escape/sanitization utility.

## Practical Priority Order

1. Fix the invoice preview XSS in `src/modules/ui.js`.
2. Stop using `innerHTML` for fatal error overlays, or escape `err.message`.
3. Replace the CDN `jsPDF` load with a local dependency.
4. Remove or de-emphasize `security.js`.
5. Add CSP / Trusted Types at the deployment layer.
