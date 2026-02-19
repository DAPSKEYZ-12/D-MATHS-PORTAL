# D-Maths Platform — Google Sheets Backend Setup Guide

## What this does
Your D-Maths website uses **Google Sheets as a free database** and
**Google Apps Script** as a free serverless API. No hosting cost, no server,
no database subscription needed.

---

## Architecture Overview

```
Your Browser (HTML File)
        │
        │  fetch() requests
        ▼
Google Apps Script Web App   ←── Acts as your REST API
        │
        │  SpreadsheetApp.getSheet()
        ▼
Google Spreadsheet           ←── Acts as your database
  ├── Applications sheet
  ├── Students sheet
  ├── Classes sheet
  ├── Assignments sheet
  ├── Notices sheet
  ├── Scores sheet
  ├── Attendance sheet
  ├── Contacts sheet
  ├── AdminNotes sheet
  └── Credentials sheet
```

---

## Step-by-Step Setup

### Step 1 — Create a Google Spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com)
2. Click **+** to create a new spreadsheet
3. Name it **D-Maths Database**
4. Copy the **Spreadsheet ID** from the URL:
   - URL looks like: `https://docs.google.com/spreadsheets/d/`**`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`**`/edit`
   - The bold part is your ID

---

### Step 2 — Open the Apps Script Editor

1. In your Spreadsheet, click **Extensions** → **Apps Script**
2. A new tab opens with an empty `Code.gs` file
3. **Delete all existing code** in the editor
4. Open `google-apps-script.gs` (the file we gave you)
5. **Copy all the code** and **paste it** into the Apps Script editor

---

### Step 3 — Configure Your Settings

At the top of the pasted code, update these lines:

```javascript
// Paste your Spreadsheet ID here:
const SPREADSHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms';

// Change these to your actual admin credentials:
const ADMIN_EMAIL    = 'admin@dmaths.edu.gh';
const ADMIN_PASSWORD = 'Admin@2024!';
```

---

### Step 4 — Create the Sheet Headers

1. In the Apps Script editor, click the **function selector dropdown** (top of editor)
2. Select **`setupSheets`**
3. Click ▶ **Run**
4. If prompted, click **Review Permissions** → **Allow**
5. Go back to your Spreadsheet — you should see all 10 tabs created automatically

---

### Step 5 — Deploy as a Web App

1. In Apps Script, click **Deploy** → **New Deployment**
2. Click the ⚙️ gear next to **Select type** → choose **Web App**
3. Set the following:
   - **Description:** D-Maths API v1
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Click **Authorize access** → Grant permissions
6. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycbxXXXXXXXXXXXXXX/exec
   ```

---

### Step 6 — Connect Your HTML File

1. Open `dmaths-platform.html`
2. Find this line near the top of the `<script>` section:
   ```javascript
   const SHEET_API = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID_HERE/exec";
   ```
3. Replace `YOUR_DEPLOYMENT_ID_HERE` with your actual deployment URL:
   ```javascript
   const SHEET_API = "https://script.google.com/macros/s/AKfycbxXXXXXXXXXXXXXX/exec";
   ```
4. Save the file

---

## Testing the Connection

Open your HTML file in a browser and:

1. Try the **Contact Form** — a new row should appear in the Contacts sheet
2. Try **Student Sign-Up** — a new row should appear in the Applications sheet
3. Log in as admin → go to **Applications** → approve a student
4. The student should appear in the Students sheet with a generated ID

---

## How Each Feature Maps to the Spreadsheet

| Feature | Sheet | What Gets Stored |
|---------|-------|-----------------|
| Student sign-up | `Applications` | Full application row (status: pending) |
| Admin approves | `Students` | New student row with ID & temp password |
| Admin rejects | `Applications` | Status updated to: rejected |
| Contact form | `Contacts` | Message + auto-email to admin |
| Admin adds notice | `Notices` | Announcement row |
| Admin marks attendance | `Attendance` | Record + recalculates student % |
| Admin updates score | `Scores` | Score row + recalculates average |
| Admin adds note | `AdminNotes` | Note linked to Student ID |

---

## Email Notifications (Automatic)

When connected to Google Sheets, the following emails are sent automatically:

| Event | Recipient | Content |
|-------|-----------|---------|
| Student submits application | Student | Confirmation with reference number |
| Admin approves application | Student | Student ID + temp password + portal link |
| Admin rejects application | Student | Rejection notice + contact info |
| Contact form submitted | Admin | Full message forwarded to admin inbox |

> **Note:** Google Apps Script can send up to **100 emails/day** on a free account.
> Upgrade to Google Workspace for higher limits.

---

## Updating the Deployment

If you make changes to the Apps Script code, you must **redeploy**:

1. Click **Deploy** → **Manage Deployments**
2. Click the ✏️ pencil on your existing deployment
3. Change **Version** to **New Version**
4. Click **Deploy**

Your URL stays the same — no changes needed in the HTML file.

---

## Fallback Behaviour (No Internet / API Down)

The platform is designed to work even if the Google Sheets API is
unavailable. When a fetch() call fails:

- **Login:** Falls back to hardcoded demo credentials
- **Data display:** Falls back to the mock data built into the HTML file
- **Form submissions:** Shows a success toast but the data isn't saved

This means the platform always looks working for demos, even offline.

---

## Free Tier Limits (Google)

| Resource | Free Limit |
|----------|-----------|
| Script runtime | 6 min/execution |
| Daily executions | Unlimited (Apps Script) |
| Email sends | 100/day |
| Spreadsheet rows | 10 million cells total |
| Spreadsheet size | 50 MB |

For a tuition centre with under 500 students, you'll never hit these limits.

---

## Security Notes

⚠️ **For production use, consider these upgrades:**

1. **Hash passwords** — use `Utilities.computeDigest()` in Apps Script instead of storing plain text
2. **Add an API secret key** — include a `?secret=YOUR_KEY` parameter and validate it in the script
3. **Rate limiting** — Apps Script has built-in protections, but add logging for failed logins
4. **HTTPS only** — the Web App URL is already HTTPS by default ✅

---

## Troubleshooting

**"Script function not found"**
→ Make sure you saved the file in Apps Script (Ctrl+S)

**"Permission denied" on fetch()**
→ Redeploy with **Who has access: Anyone** (not "Anyone with Google Account")

**Data not appearing in sheets**
→ Check the Apps Script execution log: View → Executions

**CORS error in browser console**
→ The script uses `mode:'no-cors'` for POST requests — this is expected. 
   The data still saves even though you can't read the response directly.

**Emails not sending**
→ Run `testSetup()` in Apps Script manually to grant MailApp permissions.
