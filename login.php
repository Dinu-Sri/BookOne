<?php
/**
 * Login Page
 */
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';

// Redirect if already logged in
if (Auth::check()) {
    redirect('index.php');
}

$error = '';
$currentLang = Lang::getCurrentLanguage();

if (isPost()) {
    $username = trim(input('username'));
    $password = input('password');
    
    if (empty($username) || empty($password)) {
        $error = __('login_required_fields');
    } elseif (Auth::attempt($username, $password)) {
        redirect('index.php');
    } else {
        $error = __('login_invalid');
        // Simple rate limiting via sleep
        sleep(1);
    }
}

setSecurityHeaders();
?>
<!DOCTYPE html>
<html lang="<?= $currentLang ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <meta name="googlebot" content="noindex, nofollow">
    <title><?= __('login') ?> - <?= h(APP_NAME) ?></title>
    <link rel="icon" type="image/webp" href="favicon.webp">
    <link rel="stylesheet" href="assets/style.css?v=<?= filemtime(__DIR__ . '/assets/style.css') ?>">
</head>
<body class="login-page">
    <div class="login-container">
        <div class="login-box">
            <div class="login-logo">
                <img src="logo.webp" alt="<?= h(APP_NAME) ?>" width="256" height="54">
            </div>
            
            <?php if ($error): ?>
                <div class="alert alert-error"><?= h($error) ?></div>
            <?php endif; ?>
            
            <form method="POST" action="login.php" class="login-form">
                <div class="form-group">
                    <label for="username"><?= __('username') ?></label>
                    <input type="text" id="username" name="username" required 
                           autocomplete="username" autofocus
                           value="<?= h(input('username')) ?>">
                </div>
                
                <div class="form-group">
                    <label for="password"><?= __('password') ?></label>
                    <input type="password" id="password" name="password" required
                           autocomplete="current-password">
                </div>
                
                <button type="submit" class="btn btn-primary btn-block"><?= __('login') ?></button>
            </form>
        </div>
        
        <div class="login-lang-bottom">
            <div class="lang-switcher">
                <select id="langSwitcher" onchange="switchLanguage(this.value)">
                    <?php foreach (Lang::getAvailableLanguages() as $code => $name): ?>
                        <option value="<?= $code ?>" <?= $currentLang === $code ? 'selected' : '' ?>><?= $name ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
        </div>
    </div>
    <script src="assets/app.js"></script>
</body>
</html>
