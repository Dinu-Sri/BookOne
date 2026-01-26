<?php
/**
 * BookOne Configuration - SAMPLE
 * Copy this file to config.php and update with your settings
 */

// Database Configuration
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');

// Application Settings
define('APP_NAME', 'BookOne');
define('APP_URL', 'https://yourdomain.com/bookone');
define('APP_VERSION', '1.3');

// Security
define('SESSION_LIFETIME', 3600); // 1 hour
define('CSRF_TOKEN_LIFETIME', 3600);

// File Upload
define('MAX_UPLOAD_SIZE', 5 * 1024 * 1024); // 5MB
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'webp']);

// Timezone
date_default_timezone_set('Asia/Colombo');
