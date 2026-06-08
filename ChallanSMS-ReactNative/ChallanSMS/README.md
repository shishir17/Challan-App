# 📱 ChallanSMS v2 — React Native App
## UP Traffic Department · SIM-Based Bulk SMS · No API Needed

---

## HOW IT WORKS

```
Your Phone's SIM Card
        ↓
    ChallanSMS App
        ↓
Load Excel file → Send 200 SMS/day → Logs every result
```

- **Android**: Sends SMS silently in background via SIM — fully automatic
- **iOS**: Opens Messages app pre-filled — you tap Send for each (iOS policy)
- **No internet needed** for SMS
- **Free** — only standard SMS charges from your carrier
- **200 SMS/day limit** — protects your SIM from spam detection

---

## STEP 1 — Setup Your Computer (One Time)

### Install Node.js
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # should show v20.x.x
npm --version
```

### Install Java (needed for Android build)
```bash
sudo apt-get install -y openjdk-17-jdk
java --version   # should show 17.x
```

### Install Android Studio (for Android)
1. Download from: https://developer.android.com/studio
2. Install and open it
3. Go to **SDK Manager** → install:
   - Android SDK Platform 34
   - Android SDK Build-Tools
   - Android Emulator

### Set Environment Variables
Add to your `~/.bashrc`:
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```
Then run:
```bash
source ~/.bashrc
```

---

## STEP 2 — Install React Native CLI
```bash
npm install -g react-native-cli
npm install -g @react-native-community/cli
```

---

## STEP 3 — Set Up the Project

```bash
# Extract the zip
cd ~/Downloads
unzip ChallanSMS.zip
cd ChallanSMS

# Install JS dependencies
npm install

# Link native modules (Android auto-linking)
npx react-native-asset
```

---

## STEP 4 — Connect Your Android Phone

1. On your Android phone: go to **Settings → About Phone**
2. Tap **Build Number** 7 times → Developer Mode enabled
3. Go to **Settings → Developer Options**
4. Enable **USB Debugging**
5. Connect phone to computer via USB cable
6. On the phone: tap **Allow** when it asks for USB debugging permission

Verify connection:
```bash
adb devices
# Should show your device listed
```

---

## STEP 5 — Build & Install on Android

```bash
cd ~/Downloads/ChallanSMS

# Run on connected phone (debug mode — for testing)
npx react-native run-android

# OR build a release APK to install anywhere
cd android
./gradlew assembleRelease

# APK location after build:
# android/app/build/outputs/apk/release/app-release.apk
```

Copy the APK to your phone and install it.

---

## STEP 6 — iOS Setup (Mac Only)

> iOS builds require a Mac with Xcode installed.

```bash
# Install CocoaPods
sudo gem install cocoapods

# Install iOS dependencies
cd ios
pod install
cd ..

# Run on simulator
npx react-native run-ios

# Build for device (requires Apple Developer account)
npx react-native run-ios --device "Your iPhone Name"
```

---

## HOW TO USE THE APP

### Loading Your Data File

You have 3 ways:

#### Option 1 — Phone Storage (Recommended)
1. Copy your `.xlsx` / `.xlsm` / `.csv` file to your phone
   - Via USB: copy to Downloads folder
   - Via WhatsApp: send file to yourself, then "Save to phone"
   - Via email: download the attachment
2. Tap **📤 Send tab** → tap the upload area
3. Select **Phone Storage** → browse to your file
4. App reads it instantly

#### Option 2 — Google Drive
1. Go to **⚙️ Settings → General** and sign in with Google
2. Tap upload area → select **Google Drive**
3. Browse your Drive files → tap the Excel file

#### Option 3 — Paste CSV
1. Open your Excel file on computer
2. Select all → Copy
3. In the app: tap upload → **Paste CSV Data** → paste
4. Tap **Parse & Load**

---

### Sending SMS

1. Load your file (see above)
2. Check the **Message Preview** — verify vehicle number, amount look correct
3. Check the **daily counter** at the top (limit: 200/day)
4. Tap **▶ Start Sending**
5. Confirm the popup → sending begins automatically
6. Watch the progress bar — rows turn green (sent) or red (failed)
7. Tap **⏹ Stop** at any time to pause

**Android**: Fully automatic — no tapping needed
**iOS**: Messages app opens for each contact → tap the blue Send arrow

---

### Settings

| Setting | What it does |
|---|---|
| Language | Hindi or English template |
| Delay | Wait time between SMS (2000ms = 2 seconds recommended) |
| Hindi Template | Edit the Hindi message |
| English Template | Edit the English message |
| Daily Limit | Max SMS per day (max 200) |

**Variables in templates:**
- `{amount}` → Fine amount from Excel
- `{vehicle_number}` → Vehicle registration number
- `{challan_number}` → Challan ID
- `{violator_name}` → Violator's name

---

### Logs Tab
- Every send attempt is logged with timestamp
- Filter by: All / Success / Error / Warning
- Tap **Share** to export log as text file
- Color coded: 🟢 Sent · 🔴 Failed · 🟡 Warning

---

## REQUIRED EXCEL COLUMNS

Your file must have these column headers (exact spelling):

| Column Name | Example |
|---|---|
| `Violator Contact` | 9198444494 |
| `Vehicle Number` | UP32LY7577 |
| `Amount (Rs.)` | 200 |
| `Challan Number` | UP108648220811173914 |
| `Violator Name` | Ram Kumar |
| `RTO/Office` | Lucknow |

---

## TROUBLESHOOTING

**"adb: command not found"**
→ Android SDK not in PATH. Re-run `source ~/.bashrc` or restart terminal.

**"No devices found"**
→ USB debugging not enabled on phone. See Step 4.

**App installs but SMS not sending**
→ Go to Android Settings → Apps → ChallanSMS → Permissions → enable **SMS**

**"SmsModule not found"**
→ App wasn't rebuilt after adding native module. Run `npx react-native run-android` again.

**Build fails with "SDK location not found"**
→ Create file `android/local.properties` with content:
   `sdk.dir=/home/YOUR_USERNAME/Android/Sdk`

**npm install fails**
→ Try: `npm install --legacy-peer-deps`

---

## APK DISTRIBUTION

Once you build `app-release.apk`, you can:
- Copy it to any Android phone via USB
- Share via WhatsApp to your team
- Upload to Google Drive for easy distribution

To install APK on phone: enable **"Install from unknown sources"** in Settings → Security.

---

*ChallanSMS v2 · UP Traffic Department · Internal Use*
