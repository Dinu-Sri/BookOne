<?php
/**
 * Language Switch API
 */
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

// Allow language switch even without full auth for login page
Auth::init();

$lang = $_GET['lang'] ?? $_POST['lang'] ?? '';

if (Lang::setLanguage($lang)) {
    if (Auth::isAjax()) {
        jsonSuccess(['language' => $lang], 'Language changed');
    } else {
        // Redirect back
        $redirect = $_SERVER['HTTP_REFERER'] ?? 'index.php';
        header('Location: ' . $redirect);
        exit;
    }
} else {
    if (Auth::isAjax()) {
        jsonError('Invalid language');
    } else {
        header('Location: index.php');
        exit;
    }
}
