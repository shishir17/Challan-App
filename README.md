# 🚦 Challan Sender — UP Traffic Department
**Bulk WhatsApp & SMS Messaging Desktop Software**

---

## STEP-BY-STEP INSTALLATION GUIDE

### Step 1 — Install Node.js (One-time setup)

1. Open your browser and go to: **https://nodejs.org**
2. Click **"LTS"** (the green button — recommended version)
3. Download and run the installer (`.msi` for Windows)
4. Click **Next → Next → Install** (keep all defaults)
5. When done, open **Command Prompt** and type:
   ```
   node --version
   ```
   You should see something like `v20.11.0` — this means Node.js is installed.

---

### Step 2 — Install the Challan Sender App

#### On Windows:
1. Extract the `challan-sender` folder anywhere (e.g., `C:\ChallanSender\`)
2. Double-click **`install.bat`**
3. Wait for it to finish (2–5 minutes, it downloads Electron)
4. When you see **"Installation Complete!"** — done!

#### On Mac / Linux:
1. Open Terminal
2. `cd` into the `challan-sender` folder
3. Run:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

---

### Step 3 — Start the App

**Every time you want to use the app:**

Open Command Prompt inside the `challan-sender` folder and run:
```
npm start
```

OR — to build a standalone `.exe` you can double-click anywhere:
```
npm run build
```
The installer will appear in the `dist/` folder.

---

## HOW TO USE THE SOFTWARE

### 📤 SEND TAB (Main screen)

#### Loading Your Data File
1. Click **"Click to browse"** or drag and drop your Excel/CSV file
2. The app reads the **"Violator Contact"** column automatically
3. You'll see: total records loaded, a preview table, and stats

#### Choosing Your Channel
- ✅ **WhatsApp** — opens WhatsApp on your computer/phone with the message pre-filled for each contact
- ✅ **SMS** — opens your default SMS app with the message pre-filled
- You can select **both** — it will send via both channels for each record

#### Previewing the Message
- The **Message Preview** box shows exactly what the recipient will receive
- Use **Prev / Next** buttons to check different records
- Variables like `{amount}` and `{vehicle_number}` are automatically replaced with real data

#### Sending Messages
1. Click **▶ Start Sending**
2. For each record, the app will:
   - Open WhatsApp/SMS with the contact number and message
   - Wait for the configured delay (default: 2000ms = 2 seconds)
   - Move to the next record
3. The table rows turn **green** (sent) or **red** (failed) in real time
4. Click **⏹ Stop** at any time to pause

> **Note:** You need to **manually click Send** in WhatsApp/SMS for each message.
> This is by design — it prevents automated spam and complies with WhatsApp's policy.
> To speed things up, set a shorter delay in Settings.

---

### ⚙️ SETTINGS TAB

| Setting | What it does |
|---|---|
| **Language** | Choose Hindi or English template |
| **Delay** | Milliseconds to wait between each message. 2000ms = 2 seconds |
| **Country Code** | Default is 91 (India). Added to 10-digit numbers automatically |
| **Auto Open App** | Toggle to enable/disable auto-opening WhatsApp/SMS |
| **Hindi Template** | Edit the Hindi message. Use variables like `{amount}` |
| **English Template** | Edit the English message |
| **Save Settings** | Saves your settings permanently to disk |
| **Reset Templates** | Restores original default templates |

#### Message Variables
You can use these placeholders in your templates — they get replaced automatically:

| Variable | Replaced with |
|---|---|
| `{amount}` | Challan fine amount (e.g., 2000) |
| `{vehicle_number}` | Vehicle registration number (e.g., UP32LY7577) |
| `{challan_number}` | Challan ID number |
| `{violator_name}` | Name of violator |

---

### 📋 LOGS TAB

- Shows a **timestamped record** of every action
- Color coded: 🟢 Success · 🔴 Error · 🟡 Warning · 🔵 Info
- **Export** saves the log as a `.txt` file for record keeping
- **Clear** empties the current session log

---

## COLUMN MAPPING

The app reads these columns from your Excel file:

| Excel Column | Used for |
|---|---|
| `Violator Contact` | Primary mobile number |
| `Violator Owner Contact` | Fallback if Violator Contact is empty |
| `Vehicle Number` | Inserted into message |
| `Amount (Rs.)` | Fine amount inserted into message |
| `Challan Number` | Challan ID inserted into message |
| `Violator Name` | Violator name inserted into message |
| `RTO/Office` | Shown in table |

---

## TROUBLESHOOTING

**"npm is not recognized"**
→ Node.js is not installed or not in PATH. Re-install from nodejs.org and restart Command Prompt.

**App opens but shows blank screen**
→ Run `npm start` again. Check if `node_modules` folder exists.

**WhatsApp doesn't open**
→ Make sure WhatsApp Desktop is installed, or WhatsApp Web is open in your browser.

**"No valid contact" for many rows**
→ Some rows in your Excel have no mobile number. These are skipped automatically.

**Messages show `{amount}` literally**
→ Check your Excel column name is exactly `Amount (Rs.)` (case-sensitive).

---

## REQUIREMENTS

- Windows 10/11 (or Mac 10.15+, Ubuntu 18.04+)
- Node.js 18+ (LTS)
- Internet connection (for first install only)
- WhatsApp Desktop app installed (for WhatsApp channel)

---

*Developed for UP Traffic Department · Internal Use Only*
