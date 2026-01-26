<?php
/**
 * Language Helper
 */

class Lang {
    private static $translations = [];
    private static $currentLang = 'en';
    private static $availableLanguages = [
        'en' => 'English',
        'zh' => '中文'
    ];
    
    public static function init() {
        // Get language from session or default
        if (isset($_SESSION['language'])) {
            self::$currentLang = $_SESSION['language'];
        } elseif (isset($_COOKIE['language'])) {
            self::$currentLang = $_COOKIE['language'];
        }
        
        // Validate language
        if (!array_key_exists(self::$currentLang, self::$availableLanguages)) {
            self::$currentLang = 'en';
        }
        
        // Load translation file
        $langFile = __DIR__ . '/../lang/' . self::$currentLang . '.php';
        if (file_exists($langFile)) {
            self::$translations = require $langFile;
        } else {
            // Fallback to English
            self::$translations = require __DIR__ . '/../lang/en.php';
        }
    }
    
    public static function get($key, $default = null) {
        return self::$translations[$key] ?? $default ?? $key;
    }
    
    public static function setLanguage($lang) {
        if (array_key_exists($lang, self::$availableLanguages)) {
            self::$currentLang = $lang;
            $_SESSION['language'] = $lang;
            setcookie('language', $lang, time() + (365 * 24 * 60 * 60), '/');
            self::init();
            return true;
        }
        return false;
    }
    
    public static function getCurrentLanguage() {
        return self::$currentLang;
    }
    
    public static function getAvailableLanguages() {
        return self::$availableLanguages;
    }
    
    public static function getAllTranslations() {
        return self::$translations;
    }
}

// Helper function for easy access
function __($key, $default = null) {
    return Lang::get($key, $default);
}

// Initialize
Lang::init();
