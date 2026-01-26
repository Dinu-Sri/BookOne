<?php
/**
 * Common Header
 */
setSecurityHeaders();
$currentLang = Lang::getCurrentLanguage();

// Get departments for switcher
$userDepartments = [];
$businessCurrency = 'USD';
if (Auth::check()) {
    $userDepartments = db()->fetchAll(
        "SELECT id, name FROM departments WHERE business_id = ? AND active = 1 ORDER BY name",
        [Auth::user('business_id')]
    );
    $businessCurrency = Auth::user('business_currency') ?? 'USD';
}

// Get currency symbol for JavaScript
$currencies = getCurrencies();
$currencySymbol = $currencies[$businessCurrency]['symbol'] ?? '$';
?>
<!DOCTYPE html>
<html lang="<?= $currentLang ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <meta name="googlebot" content="noindex, nofollow">
    <title><?= h($pageTitle ?? APP_NAME) ?></title>
    <link rel="icon" type="image/webp" href="favicon.webp">
    <link rel="stylesheet" href="assets/style.css?v=<?= filemtime(__DIR__ . '/../assets/style.css') ?>">
</head>
<body>
    <header class="app-header">
        <div class="header-left">
            <button class="menu-toggle" id="menuToggle" aria-label="Toggle menu">☰</button>
            <a href="index.php" class="header-logo">
                <img src="logo.webp" alt="<?= h(APP_NAME) ?>" height="32">
            </a>
        </div>
        <div class="header-center">
            <span class="business-info">
                <strong><?= h(Auth::user('business_name') ?? __('no_data')) ?></strong>
                <?php if (count($userDepartments) >= 1): ?>
                    <span class="dept-separator">|</span>
                    <div class="dept-switcher">
                        <select id="deptSwitcher" onchange="switchDepartment(this.value)">
                            <option value="0" <?= !Auth::user('department_id') ? 'selected' : '' ?>><?= __('all_departments') ?></option>
                            <?php foreach ($userDepartments as $dept): ?>
                                <option value="<?= $dept['id'] ?>" <?= Auth::user('department_id') == $dept['id'] ? 'selected' : '' ?>><?= h($dept['name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                <?php endif; ?>
            </span>
        </div>
        <div class="header-right">
            <div class="lang-switcher">
                <select id="langSwitcher" onchange="switchLanguage(this.value)">
                    <?php foreach (Lang::getAvailableLanguages() as $code => $name): ?>
                        <option value="<?= $code ?>" <?= $currentLang === $code ? 'selected' : '' ?>><?= $name ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <span class="user-name"><?= h(Auth::user('name')) ?></span>
            <a href="logout.php" class="btn btn-sm btn-outline"><?= __('logout') ?></a>
        </div>
    </header>
    
    <nav class="sidebar" id="sidebar">
        <ul class="nav-menu">
            <li><a href="index.php" class="<?= ($currentPage ?? '') === 'transactions' ? 'active' : '' ?>">📝 <?= __('nav_transactions') ?></a></li>
            <li><a href="reports.php" class="<?= ($currentPage ?? '') === 'reports' ? 'active' : '' ?>">📊 <?= __('nav_reports') ?></a></li>
            <li><a href="settings.php" class="<?= ($currentPage ?? '') === 'settings' ? 'active' : '' ?>">⚙️ <?= __('nav_settings') ?></a></li>
            <li><a href="help.php" class="<?= ($currentPage ?? '') === 'help' ? 'active' : '' ?>">📚 <?= __('nav_help') ?></a></li>
        </ul>
    </nav>
    
    <main class="main-content" id="mainContent">
