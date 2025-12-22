# 🎁 Gift Exchange Helper

A simple web application to randomly assign gift exchange partners while respecting family groups and matching rules.

## ✨ Features

- **Smart Matching**: Automatically prevents people from the same family from being matched together
- **Restricted Pools**: Core families are configurable (via **Settings**) and only match with each other; everyone else matches within their own group
- **Bulk Import**: Paste a list of names to quickly add multiple people
- **Fun Animation**: Enjoy a festive animation when shuffling assignments
- **Copy Results**: Easily copy the final assignments to share with participants

---

## 🚀 Quick Start (No Installation Required!)

The easiest way to use this application is to simply open it in your web browser. **No installation or setup needed!**

### For Mac Users:

1. **Download the files**: Make sure you have all the files (`index.html`, `style.css`, `script.js`) in the same folder
2. **Open the app**:
   - Navigate to the folder in Finder where you saved the files
   - Right-click (or Control-click) on `index.html`
   - Select **"Open With"** → **"Safari"** (or Chrome, Firefox, etc.)
3. **That's it!** The app should now open in your browser

### For Windows Users:

1. **Download the files**: Make sure you have all the files (`index.html`, `style.css`, `script.js`) in the same folder
2. **Open the app**:
   - Navigate to the folder in File Explorer where you saved the files
   - Right-click on `index.html`
   - Select **"Open with"** → **"Microsoft Edge"** (or Chrome, Firefox, etc.)
3. **That's it!** The app should now open in your browser

> **💡 Tip**: You can bookmark the opened page in your browser for quick access next time!

---

## 📖 How to Use

### Adding People

1. Enter the person's **First Name** and **Last Name**
2. (Optional) Enter a **Family Group** to manually group people (if blank, it defaults to their last name)
3. Click the **"Add to List"** button

### Bulk Import

1. Click the **"Bulk Import"** button
2. Paste your list in this format: `FirstName LastName [FamilyGroup]`
   - Example: `John Doe [Doe Family], Jane Smith [Smith Family]`
3. Click **"Import Names"**

### Shuffling

1. Once you have at least 2 people added, click **"Shuffle & Assign"**
2. Watch the fun animation! 🎁
3. View your gift exchange assignments
4. Click **"Copy Results"** to copy the list to your clipboard
5. Click **"Start Over"** to shuffle again or add more people

### Important Rules

- **Core Families** (configurable via **Settings**) will only be matched with each other
- **Everyone else** will only be matched within their own group
- **Family members** from the same family group will never be matched together

---

## 🔧 Advanced: Running Tests (Optional)

If you're a developer or want to verify the app is working correctly, you can run automated tests.

### Prerequisites for Testing

You'll need to install **Node.js** first:

#### Mac:
1. Go to [nodejs.org](https://nodejs.org/)
2. Download the "LTS" version for macOS
3. Open the downloaded `.pkg` file and follow the installer
4. To verify it installed, open **Terminal** and type: `node --version`

#### Windows:
1. Go to [nodejs.org](https://nodejs.org/)
2. Download the "LTS" version for Windows
3. Open the downloaded `.msi` file and follow the installer
4. To verify it installed, open **Command Prompt** and type: `node --version`

### Running the Tests

Once Node.js is installed:

#### Mac:
1. Open **Terminal**
2. Navigate to the project folder:
   ```bash
   cd /path/to/BrothersHelper
   ```
3. Run unit tests:
   ```bash
   npx jest
   ```
4. Run UI tests:
   ```bash
   npx playwright test
   ```

#### Windows:
1. Open **Command Prompt** or **PowerShell**
2. Navigate to the project folder:
   ```cmd
   cd C:\path\to\BrothersHelper
   ```
3. Run unit tests:
   ```cmd
   npx jest
   ```
4. Run UI tests:
   ```cmd
   npx playwright test
   ```

---

## ❓ Troubleshooting

### The page looks broken or doesn't work
- Make sure all three files (`index.html`, `style.css`, `script.js`) are in the same folder
- Try using a different browser (Chrome, Firefox, Safari, or Edge)
- Make sure you're opening `index.html` and not one of the other files

### I can't add names
- Make sure you've entered both a first name and last name
- Check that the person isn't already in the list (duplicates aren't allowed)

### The shuffle button is disabled
- You need at least 2 people in the list to shuffle
- Make sure you don't have only 1 person in a pool (Core or Other)

### I get an error when shuffling
- Make sure people from at least 2 different family groups are in each pool
- If you only have 2 people, they must be from different family groups

---

## 📝 Need Help?

If you run into any issues or have questions, feel free to reach out!

---

## 🎄 Happy Gift Exchanging!

Enjoy your stress-free gift exchange planning! 🎁✨
