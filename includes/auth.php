<?php
/**
 * Authentication System
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/lang.php';

class Auth {
    private static $user = null;
    
    public static function init() {
        if (session_status() === PHP_SESSION_NONE) {
            ini_set('session.cookie_httponly', 1);
            ini_set('session.cookie_secure', isset($_SERVER['HTTPS']) ? 1 : 0);
            ini_set('session.use_strict_mode', 1);
            ini_set('session.cookie_samesite', 'Strict');
            session_name(SESSION_NAME);
            session_start();
        }
        
        // Regenerate session ID periodically
        if (!isset($_SESSION['created'])) {
            $_SESSION['created'] = time();
        } elseif (time() - $_SESSION['created'] > 1800) {
            session_regenerate_id(true);
            $_SESSION['created'] = time();
        }
    }
    
    public static function attempt($username, $password) {
        $user = db()->fetch(
            "SELECT u.*, b.name as business_name, b.currency as business_currency, 
                    b.financial_year_start as fy_start, d.name as department_name 
             FROM users u 
             LEFT JOIN businesses b ON u.business_id = b.id 
             LEFT JOIN departments d ON u.department_id = d.id 
             WHERE u.username = ? AND u.active = 1",
            [$username]
        );
        
        if ($user && password_verify($password, $user['password'])) {
            // Check if password needs rehashing
            if (password_needs_rehash($user['password'], PASSWORD_BCRYPT, ['cost' => HASH_COST])) {
                $newHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => HASH_COST]);
                db()->update('users', ['password' => $newHash], 'id = ?', [$user['id']]);
            }
            
            session_regenerate_id(true);
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user'] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'name' => $user['name'],
                'role' => $user['role'],
                'business_id' => $user['business_id'],
                'business_name' => $user['business_name'],
                'business_currency' => $user['business_currency'] ?? 'USD',
                'financial_year_start' => $user['fy_start'] ?? 1,
                'department_id' => $user['department_id'],
                'department_name' => $user['department_name']
            ];
            $_SESSION['created'] = time();
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            
            return true;
        }
        
        return false;
    }
    
    public static function check() {
        self::init();  // Ensure session is started
        return isset($_SESSION['user_id']);
    }
    
    public static function user($key = null) {
        if (!self::check()) {
            return null;
        }
        
        if ($key) {
            return $_SESSION['user'][$key] ?? null;
        }
        
        return $_SESSION['user'];
    }
    
    public static function isAdmin() {
        return self::user('role') === 'admin';
    }
    
    public static function isManager() {
        return in_array(self::user('role'), ['admin', 'manager']);
    }
    
    public static function logout() {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params['path'], $params['domain'],
                $params['secure'], $params['httponly']
            );
        }
        session_destroy();
    }
    
    public static function requireAuth() {
        self::init();  // Ensure session is started
        if (!self::check()) {
            if (self::isAjax()) {
                http_response_code(401);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Unauthorized']);
                exit;
            }
            header('Location: login.php');
            exit;
        }
    }
    
    public static function requireAdmin() {
        self::requireAuth();
        if (!self::isAdmin()) {
            http_response_code(403);
            die('Access denied');
        }
    }
    
    public static function requireManager() {
        self::requireAuth();
        if (!self::isManager()) {
            http_response_code(403);
            die('Access denied');
        }
    }
    
    public static function csrfToken() {
        if (!isset($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf_token'];
    }
    
    public static function verifyCsrf($token) {
        return isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
    }
    
    public static function hashPassword($password) {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => HASH_COST]);
    }
    
    public static function isAjax() {
        return !empty($_SERVER['HTTP_X_REQUESTED_WITH']) && 
               strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';
    }
    
    public static function updatePassword($userId, $newPassword) {
        $hash = self::hashPassword($newPassword);
        return db()->update('users', ['password' => $hash], 'id = ?', [$userId]);
    }
    
    public static function refreshUserData() {
        if (!self::check()) return;
        
        $user = db()->fetch(
            "SELECT u.*, b.name as business_name, b.currency as business_currency, 
                    b.financial_year_start as fy_start, d.name as department_name 
             FROM users u 
             LEFT JOIN businesses b ON u.business_id = b.id 
             LEFT JOIN departments d ON u.department_id = d.id 
             WHERE u.id = ? AND u.active = 1",
            [$_SESSION['user_id']]
        );
        
        if ($user) {
            $_SESSION['user'] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'name' => $user['name'],
                'role' => $user['role'],
                'business_id' => $user['business_id'],
                'business_name' => $user['business_name'],
                'business_currency' => $user['business_currency'] ?? 'USD',
                'financial_year_start' => $user['fy_start'] ?? 1,
                'department_id' => $user['department_id'],
                'department_name' => $user['department_name']
            ];
        }
    }
}

// Initialize auth on include
Auth::init();
