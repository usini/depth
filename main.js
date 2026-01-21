import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import i18n from './i18n.js';

// Initialize i18n system
const langSelect = document.getElementById('langSelect');
function initI18n() {
    // Populate language selector
    const languages = i18n.getLanguages();
    languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = `${lang.flag} ${lang.name}`;
        langSelect.appendChild(option);
    });
    langSelect.value = i18n.getLang();

    // Handle language change
    langSelect.addEventListener('change', (e) => {
        i18n.setLang(e.target.value);
    });

    // Listen for language changes to update dynamic buttons
    i18n.onLangChange(() => {
        refreshDisplayButtons();
        updatePiPButton();
        // Update status if capture is running
        if (captureTimer) {
            setStatus('statusRunning', { interval: captureIntervalMs });
        }
    });

    // Initial DOM update
    i18n.updateDOM();
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

let depthMapTexture;
let mesh, bgMesh;

let depthScale = 0.5; // Default depth
let lastImage, lastWidth, lastHeight;
let cameraInitialized = false;
let animationStarted = false;


const uploadButton = document.getElementById('upload');
uploadButton.onchange = handleFileUpload;

// Screen capture controls
const startBtn = document.getElementById('startCapture');
const stopBtn = document.getElementById('stopCapture');
const oneShotBtn = document.getElementById('oneShot');
const intervalInput = document.getElementById('intervalInput');
const statusLabel = document.getElementById('captureStatus');
const depthRange = document.getElementById('depthRange');
const depthNumber = document.getElementById('depthNumber');
const depthValueSpan = document.getElementById('depthValue');
const toggleGoldBtn = document.getElementById('toggleGold');

// Gold texture tint
let useGoldTint = true;

function refreshDisplayButtons() {
    if (toggleGoldBtn)
        toggleGoldBtn.textContent = i18n.t(useGoldTint ? 'toggleGoldOff' : 'toggleGoldOn');
}

let captureStream = null;
let captureVideo = null;
let captureTimer = null;

// Persist settings
function loadSettings() {
    const savedDepth = localStorage.getItem('depthmap-depth');
    const savedInterval = localStorage.getItem('depthmap-interval');
    if (savedDepth !== null) depthScale = parseFloat(savedDepth);
    if (savedInterval !== null) captureIntervalMs = parseInt(savedInterval, 10);
    // Update inputs
    if (depthRange) depthRange.value = depthScale.toString();
    if (depthNumber) depthNumber.value = depthScale.toString();
    if (intervalInput) intervalInput.value = captureIntervalMs.toString();
}
function saveDepth() { localStorage.setItem('depthmap-depth', depthScale.toString()); }
function saveInterval() { localStorage.setItem('depthmap-interval', captureIntervalMs.toString()); }

let captureIntervalMs = 200;
loadSettings();
function syncDepthDisplays() {
    const txt = depthScale.toFixed(2);
    if (depthValueSpan) depthValueSpan.textContent = txt;
    if (depthRange && document.activeElement !== depthRange) depthRange.value = depthScale.toString();
    if (depthNumber && document.activeElement !== depthNumber) depthNumber.value = depthScale.toString();
}

depthRange?.addEventListener('input', e => { depthScale = parseFloat(e.target.value) || 0; if (mesh?.material?.uniforms?.depthScale) mesh.material.uniforms.depthScale.value = depthScale; syncDepthDisplays(); saveDepth(); });
depthNumber?.addEventListener('input', e => { depthScale = parseFloat(e.target.value) || 0; if (mesh?.material?.uniforms?.depthScale) mesh.material.uniforms.depthScale.value = depthScale; syncDepthDisplays(); saveDepth(); });

syncDepthDisplays();

intervalInput?.addEventListener('change', () => {
    const v = Math.max(100, parseInt(intervalInput.value || '200', 10));
    captureIntervalMs = v;
    saveInterval();
    // Restart timer if running
    if (captureTimer) {
        clearInterval(captureTimer);
        captureTimer = setInterval(captureFrameToImage, captureIntervalMs);
        setStatus('statusRunning', { interval: captureIntervalMs });
    }
});

startBtn?.addEventListener('click', async () => {
    await startScreenCapture();
});

stopBtn?.addEventListener('click', () => {
    stopScreenCapture();
});

oneShotBtn?.addEventListener('click', async () => {
    await startScreenCapture(true);
});

toggleGoldBtn?.addEventListener('click', () => {
    useGoldTint = !useGoldTint;
    if (mesh?.material?.uniforms?.useGoldTint) {
        mesh.material.uniforms.useGoldTint.value = useGoldTint ? 1 : 0;
    }
    refreshDisplayButtons();
});

// Picture-in-Picture
const togglePiPBtn = document.getElementById('togglePiP');
let pipVideo = null;
let pipStream = null;

async function togglePictureInPicture() {
    // check PiP support
    if (!document.pictureInPictureEnabled) {
        console.warn('[PiP] Picture-in-Picture non supporté par ce navigateur');
        alert('Picture-in-Picture non supporté par ce navigateur');
        return;
    }

    // If Pip is already active, exit it
    if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
    }

    try {
        // Create stream from renderer if not already done
        if (!pipStream) {
            const canvas = renderer.domElement;
            pipStream = canvas.captureStream(30); // 30 fps
        }

        // Create hidden video element if not already done
        if (!pipVideo) {
            pipVideo = document.createElement('video');
            pipVideo.srcObject = pipStream;
            pipVideo.muted = true;
            pipVideo.playsInline = true;
            pipVideo.style.display = 'none';
            document.body.appendChild(pipVideo);
            await pipVideo.play();
        }

        // Enable PiP
        await pipVideo.requestPictureInPicture();
        updatePiPButton();
    } catch (err) {
        console.error('[PiP] Erreur:', err);
        alert('Impossible d\'activer Picture-in-Picture: ' + err.message);
    }
}

function updatePiPButton() {
    if (togglePiPBtn) {
        togglePiPBtn.textContent = i18n.t(document.pictureInPictureElement ? 'pipDisable' : 'pipEnable');
    }
}

togglePiPBtn?.addEventListener('click', togglePictureInPicture);

// Listen to PiP events to update button state
document.addEventListener('leavepictureinpicture', updatePiPButton);
document.addEventListener('enterpictureinpicture', updatePiPButton);

function setStatus(key, params = {}) {
    if (statusLabel) statusLabel.textContent = i18n.t(key, params);
}

async function startScreenCapture(oneShot = false) {
    try {
        // If already active and we just want oneShot, no need to request permission again.
        if (!captureStream) {
            // Tips: Microsoft Edge/Chrome will ask to choose screen/window/tab.
            captureStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'monitor' // hint, not always respected
                },
                audio: false
            });
            captureVideo = document.createElement('video');
            captureVideo.srcObject = captureStream;
            captureVideo.muted = true;
            captureVideo.playsInline = true;
            await captureVideo.play();

            // Handle the case where the user stops the capture from browser UI
            const [track] = captureStream.getVideoTracks();
            track.addEventListener('ended', () => {
                stopScreenCapture();
            });
        }

        if (oneShot) {
            await captureFrameToImage();
            setStatus('statusOneShotDone');
            // If oneShot, we stop immediately after
            return;
        }

        if (captureTimer) clearInterval(captureTimer);
        captureTimer = setInterval(captureFrameToImage, captureIntervalMs);
        setStatus('statusRunning', { interval: captureIntervalMs });
    } catch (err) {
        console.error('Screen capture error', err);
        setStatus('statusError');
    }
}

function stopScreenCapture() {
    if (captureTimer) {
        clearInterval(captureTimer);
        captureTimer = null;
    }
    if (captureStream) {
        captureStream.getTracks().forEach(t => t.stop());
        captureStream = null;
    }
    captureVideo = null;
    setStatus('statusWaiting');
}

async function captureFrameToImage() {
    if (!captureVideo) return;
    // Draw the video frame into a canvas, then pass the image to the create3DObject pipeline
    const vw = captureVideo.videoWidth;
    const vh = captureVideo.videoHeight;
    if (!vw || !vh) return;

    // Use the native captured resolution (no downscale)
    const cw = vw;
    const ch = vh;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = cw;
    canvas.height = ch;
    ctx.drawImage(captureVideo, 0, 0, cw, ch);

    // Convert to image to reuse existing create3DObject
    const img = new Image();
    img.onload = () => create3DObject(img);
    img.src = canvas.toDataURL('image/png');
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            create3DObject(img);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Displacement handled on GPU side (vertex shader) – no more CPU geometry modification.

// Adds a solid background under non-transparent parts
function createBackgroundMesh(planeWidth, planeHeight) {
    // Slightly larger plane, behind the main mesh
    const geometry = new THREE.PlaneGeometry(planeWidth * 1.02, planeHeight * 1.02, 1, 1);
    geometry.translate(0, 0, -0.3);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        side: THREE.DoubleSide
    });
    return new THREE.Mesh(geometry, material);
}

function create3DObject(image) {
    console.time('[depthmap] create3DObject total');
    const width = image.width;
    const height = image.height;

    // Preserve the image aspect ratio (not square)
    const baseHeight = 10; // reference size in the scene
    const planeHeight = baseHeight;
    const planeWidth = baseHeight * (width / height);

    // If same resolution -> keep geometry and update only the texture
    if (mesh && lastWidth === width && lastHeight === height) {
        console.time('[depthmap] updateTexture');
        depthMapTexture.image = image;
        depthMapTexture.needsUpdate = true;
        // Update texelSize if existing (just in case)
        if (mesh.material.uniforms && mesh.material.uniforms.texelSize) {
            mesh.material.uniforms.texelSize.value.set(1 / width, 1 / height);
        }
        console.timeEnd('[depthmap] updateTexture');
        lastImage = image;
        console.timeEnd('[depthmap] create3DObject total');
        return;
    }

    // Otherwise recreate everything (potentially new resolution)
    if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh = null;
    }
    if (bgMesh) {
        scene.remove(bgMesh);
        bgMesh.geometry.dispose();
        bgMesh.material.dispose();
        bgMesh = null;
    }

    depthMapTexture = new THREE.Texture(image);
    depthMapTexture.needsUpdate = true;

    // Subdivided geometry (1 vertex per pixel)
    const segX = Math.max(1, width - 1);
    const segY = Math.max(1, height - 1);
    console.time('[depthmap] geometry build');
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, segX, segY);
    console.timeEnd('[depthmap] geometry build');

    const uniforms = {
        map: { value: depthMapTexture },
        depthScale: { value: depthScale },
        color: { value: new THREE.Color(0xffd700) },
        alphaThreshold: { value: 0.04 },
        texelSize: { value: new THREE.Vector2(1 / width, 1 / height) },
        useGoldTint: { value: useGoldTint ? 1 : 0 }
    };

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `varying vec2 vUv;uniform sampler2D map;uniform float depthScale;uniform float alphaThreshold;uniform vec2 texelSize;float gSample(vec2 uv){vec4 t=texture2D(map,uv);if(t.a<alphaThreshold) return 0.0;return t.r;}float kernelGauss(vec2 uv){float w[9];w[0]=1.;w[1]=2.;w[2]=1.;w[3]=2.;w[4]=4.;w[5]=2.;w[6]=1.;w[7]=2.;w[8]=1.;float sum=0.;float norm=0.;int k=0;for(int j=-1;j<=1;j++){for(int i=-1;i<=1;i++){float ww=w[k];k++;vec2 o=vec2(float(i),float(j))*texelSize;sum+=gSample(uv+o)*ww;norm+=ww;}}return sum/norm;}float kernelMax(vec2 uv){float m=0.;for(int j=-1;j<=1;j++){for(int i=-1;i<=1;i++){vec2 o=vec2(float(i),float(j))*texelSize;m=max(m,gSample(uv+o));}}return m;}void main(){vUv=uv;float g=kernelGauss(vUv);float mx=kernelMax(vUv);float diff=mx-g;float t=smoothstep(0.075,0.15,diff);float gray=mix(g,mx,t);float depth=gray*depthScale;vec3 displaced=position;displaced.z=depth;gl_Position=projectionMatrix*modelViewMatrix*vec4(displaced,1.0);}`,
        fragmentShader: `varying vec2 vUv;uniform sampler2D map;uniform vec3 color;uniform float alphaThreshold;uniform int useGoldTint;void main(){vec4 tex=texture2D(map,vUv);if(tex.a<alphaThreshold) discard;vec3 baseColor=tex.rgb;if(useGoldTint==1) baseColor*=color;gl_FragColor=vec4(baseColor,1.0);}`,
        side: THREE.DoubleSide,
        transparent: false
    });

    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Background (optional) – can keep it, or disable if performance is insufficient
    bgMesh = createBackgroundMesh(planeWidth, planeHeight);
    scene.add(bgMesh);

    lastImage = image;
    lastWidth = width;
    lastHeight = height;

    console.log(`[depthmap] Résolution image: ${width}x${height}, segments: ${segX}x${segY}, vertices=${mesh.geometry.attributes.position.count}`);

    if (!cameraInitialized) {
        camera.position.set(0, 0, 20);
        camera.lookAt(0, 0, 0);
        cameraInitialized = true;
    }
    if (!animationStarted) {
        animate();
        animationStarted = true;
    }
    console.timeEnd('[depthmap] create3DObject total');
}

function rebuildMeshWithCurrentImage() {
    if (!lastImage) return;
    create3DObject(lastImage);
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

const controls = new OrbitControls(camera, renderer.domElement);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// (Depth synchronization handled above)

// Very light background
scene.background = new THREE.Color(0xeeeecc);

window.addEventListener('DOMContentLoaded', () => {
    initI18n();
    setupMenuCollapse();
    refreshDisplayButtons();

    const img = new Image();
    img.onload = function () {
        create3DObject(img);
    };
    img.onerror = function () {
        alert("Unable to load scorpion_final.jpg. Check the file path and name!");
    };
    img.src = './scorpion_final.png';
});

// === Button to show/hide the entire menu ===
function setupMenuCollapse() {
    // All possible menu/UI containers (+ data-menu-root option)
    const hideSelectors = [
        '[data-menu-root]',
        '#menu', '#controls', '#ui', '#panel', '#sidebar',
        '.menu', '.controls', '.ui', '.ui-root', '.panel', '.sidebar', '.toolbar',
        'header', 'aside', 'nav'
    ];

    // Inject a style that hides the UI when the body has the menu-collapsed class
    const styleEl = document.createElement('style');
    styleEl.textContent = `
    body.menu-collapsed ${hideSelectors.join(', body.menu-collapsed ')} { display: none !important; }
    #toggleMenuBtn {
      position: fixed; top: 12px; right: 12px; z-index: 9999;
      padding: 6px 10px; font: inherit; cursor: pointer;
      background:#222; color:#fff; border:1px solid #444; border-radius:6px;
      opacity:.9;
    }
    #toggleMenuBtn:hover { opacity:1; }
    `;
    document.head.appendChild(styleEl);

    // If there is no candidate in the DOM, do not create the button
    const hasAnyUi = hideSelectors.some(sel => document.querySelector(sel));
    if (!hasAnyUi) return;

    const btn = document.createElement('button');
    btn.id = 'toggleMenuBtn';
    document.body.appendChild(btn);

    const collapsed = localStorage.getItem('menuCollapsed') === '1';
    document.body.classList.toggle('menu-collapsed', collapsed);
    btn.textContent = collapsed ? 'Afficher le menu' : 'Masquer le menu';
    btn.setAttribute('aria-expanded', (!collapsed).toString());

    btn.addEventListener('click', () => {
        const isCollapsed = document.body.classList.toggle('menu-collapsed');
        localStorage.setItem('menuCollapsed', isCollapsed ? '1' : '0');
        btn.textContent = isCollapsed ? 'Afficher le menu' : 'Masquer le menu';
        btn.setAttribute('aria-expanded', (!isCollapsed).toString());
    });
}