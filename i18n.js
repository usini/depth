/**
 * Simple i18n system for Depth Map Viewer
 * 
 * To add a new language:
 * 1. Add a new object in the `translations` object with the language code as key
 * 2. Copy all keys from 'en' and translate the values
 * 3. The language will automatically appear in the language selector
 */

const translations = {
    en: {
        // Language metadata
        _name: 'English',
        _flag: '🇬🇧',

        // Upload
        uploadLabel: 'Local image',
        uploadTitle: 'Choose an image (depth map)',

        // Depth controls
        depthLabel: 'Depth',
        depthSliderTitle: 'Depth (slider)',
        depthNumberTitle: 'Depth (numeric value)',

        // Capture interval
        intervalLabel: 'Capture interval (ms)',
        intervalTitle: 'Interval in milliseconds (screen capture)',

        // Display
        displayLabel: 'Display',
        toggleGoldOn: 'Gold filter',
        toggleGoldOff: 'No gold filter',
        toggleGoldTitle: 'Enable/Disable gold filter',

        // Picture-in-Picture
        pipLabel: 'Picture-in-Picture',
        pipEnable: 'Enable PiP',
        pipDisable: 'Disable PiP',
        pipTitle: 'Show canvas in Picture-in-Picture',

        // Capture buttons
        startCapture: 'Start',
        startCaptureTitle: 'Start screen capture',
        oneShot: 'Single Capture',
        oneShotTitle: 'Capture a single frame',
        stopCapture: 'Stop',
        stopCaptureTitle: 'Stop capture',

        // Status
        statusLabel: 'Status',
        statusStopped: 'Stopped',
        statusWaiting: 'Waiting',
        statusRunning: 'Running: {interval} ms',
        statusOneShotDone: 'Single capture done',
        statusError: 'Error',

        // Language
        languageLabel: 'Language'
    },

    fr: {
        _name: 'Français',
        _flag: '🇫🇷',

        uploadLabel: 'Image locale',
        uploadTitle: 'Choisir une image (depth map)',

        depthLabel: 'Profondeur',
        depthSliderTitle: 'Profondeur (slider)',
        depthNumberTitle: 'Profondeur (valeur numérique)',

        intervalLabel: 'Intervalle capture (ms)',
        intervalTitle: 'Intervalle en millisecondes (capture écran)',

        displayLabel: 'Affichage',
        toggleGoldOn: 'Filtre or',
        toggleGoldOff: 'Sans filtre or',
        toggleGoldTitle: 'Activer/Désactiver le filtre doré',

        pipLabel: 'Picture-in-Picture',
        pipEnable: 'Activer PiP',
        pipDisable: 'Désactiver PiP',
        pipTitle: 'Afficher le canvas en Picture-in-Picture',

        startCapture: 'Démarrer',
        startCaptureTitle: 'Commencer la capture écran',
        oneShot: 'Capture Unique',
        oneShotTitle: 'Capturer une seule frame',
        stopCapture: 'Arrêter',
        stopCaptureTitle: 'Arrêter la capture',

        statusLabel: 'Status',
        statusStopped: 'Arrêt',
        statusWaiting: 'En attente',
        statusRunning: 'En cours: {interval} ms',
        statusOneShotDone: 'Capture unique fini',
        statusError: 'Erreur',

        languageLabel: 'Langue'
    }

    // To add a new language, copy the 'en' block above and translate all values
    // Example for Spanish:
    // es: {
    //     _name: 'Español',
    //     _flag: '🇪🇸',
    //     appTitle: 'Mapa de Profundidad',
    //     ...
    // }
};

class I18n {
    constructor() {
        this.currentLang = this.detectLanguage();
        this.listeners = [];
    }

    /**
     * Detect the best language to use
     */
    detectLanguage() {
        // Check localStorage first
        const saved = localStorage.getItem('depthmap-lang');
        if (saved && translations[saved]) {
            return saved;
        }

        // Default to English
        return 'en';
    }

    /**
     * Get available languages
     */
    getLanguages() {
        return Object.keys(translations).map(code => ({
            code,
            name: translations[code]._name,
            flag: translations[code]._flag
        }));
    }

    /**
     * Get current language code
     */
    getLang() {
        return this.currentLang;
    }

    /**
     * Set current language
     */
    setLang(lang) {
        if (!translations[lang]) {
            console.warn(`[i18n] Language '${lang}' not found, falling back to 'en'`);
            lang = 'en';
        }
        this.currentLang = lang;
        localStorage.setItem('depthmap-lang', lang);
        this.updateDOM();
        this.notifyListeners();
    }

    /**
     * Get translation for a key, with optional interpolation
     * @param {string} key - Translation key
     * @param {object} params - Parameters for interpolation (e.g., {interval: 200})
     */
    t(key, params = {}) {
        let text = translations[this.currentLang]?.[key]
            || translations['en']?.[key]
            || key;

        // Interpolate parameters like {interval}
        for (const [param, value] of Object.entries(params)) {
            text = text.replace(`{${param}}`, value);
        }

        return text;
    }

    /**
     * Update all DOM elements with data-i18n attributes
     */
    updateDOM() {
        // Update text content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            el.textContent = this.t(key);
        });

        // Update titles
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.dataset.i18nTitle;
            el.title = this.t(key);
        });

        // Update placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            el.placeholder = this.t(key);
        });

        // Update html lang attribute
        document.documentElement.lang = this.currentLang;
    }

    /**
     * Add a listener for language changes
     */
    onLangChange(callback) {
        this.listeners.push(callback);
    }

    /**
     * Notify all listeners of language change
     */
    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentLang));
    }
}

// Create and export singleton instance
const i18n = new I18n();

export { i18n, translations };
export default i18n;
