<?php
/**
 * Utility Functions
 */

/**
 * Sanitize output for HTML
 */
function h($str) {
    return htmlspecialchars($str ?? '', ENT_QUOTES, 'UTF-8');
}

/**
 * Sanitize filename
 */
function sanitizeFilename($filename) {
    // Remove any character that isn't alphanumeric, dash, underscore, or dot
    $filename = preg_replace('/[^a-zA-Z0-9\-_\.]/', '_', $filename);
    // Remove multiple consecutive underscores
    $filename = preg_replace('/_+/', '_', $filename);
    // Trim underscores from start/end
    return trim($filename, '_');
}

/**
 * Generate receipt filename
 */
function generateReceiptFilename($date, $type, $party, $amount, $txnId, $ext) {
    $date = date('Ymd', strtotime($date));
    $type = sanitizeFilename(substr($type, 0, 10));
    $party = sanitizeFilename(substr($party ?? 'unknown', 0, 20));
    $amount = number_format(abs($amount), 2, '', '');
    $ext = strtolower(sanitizeFilename($ext));
    
    return "{$date}_{$type}_{$party}_{$amount}_{$txnId}.{$ext}";
}

/**
 * Get receipt storage path
 */
function getReceiptPath($date) {
    $year = date('Y', strtotime($date));
    $month = date('m', strtotime($date));
    return RECEIPTS_PATH . "{$year}/{$month}/";
}

/**
 * Get available currencies
 */
function getCurrencies() {
    return [
        'USD' => ['symbol' => '$', 'name' => 'US Dollar'],
        'CNY' => ['symbol' => '¥', 'name' => 'Chinese Yuan'],
        'INR' => ['symbol' => '₹', 'name' => 'Indian Rupee'],
        'JPY' => ['symbol' => '¥', 'name' => 'Japanese Yen'],
        'EUR' => ['symbol' => '€', 'name' => 'Euro'],
        'GBP' => ['symbol' => '£', 'name' => 'British Pound'],
        'LKR' => ['symbol' => 'Rs', 'name' => 'Sri Lankan Rupee'],
    ];
}

/**
 * Format currency
 */
function formatMoney($amount, $currency = 'USD') {
    $currencies = getCurrencies();
    $symbol = $currencies[$currency]['symbol'] ?? $currency . ' ';
    
    // JPY typically doesn't use decimals
    if ($currency === 'JPY') {
        return $symbol . number_format((float)$amount, 0);
    }
    
    return $symbol . number_format((float)$amount, 2);
}

/**
 * JSON response helper
 */
function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Error JSON response
 */
function jsonError($message, $code = 400) {
    jsonResponse(['error' => $message], $code);
}

/**
 * Success JSON response
 */
function jsonSuccess($data = [], $message = 'Success') {
    jsonResponse(array_merge(['success' => true, 'message' => $message], $data));
}

/**
 * Get current financial year
 */
function getFinancialYear($date = null, $startMonth = 1) {
    $date = $date ? strtotime($date) : time();
    $year = (int)date('Y', $date);
    $month = (int)date('n', $date);
    
    if ($month < $startMonth) {
        $year--;
    }
    
    return $year;
}

/**
 * Get financial year date range
 * Returns ['start' => 'YYYY-MM-DD', 'end' => 'YYYY-MM-DD']
 */
function getFinancialYearRange($year = null, $startMonth = 1) {
    $startMonth = (int)$startMonth;
    if ($startMonth < 1 || $startMonth > 12) {
        $startMonth = 1;
    }
    
    if ($year === null) {
        $year = getFinancialYear(null, $startMonth);
    }
    
    $startYear = $year;
    $endYear = $year;
    
    // If fiscal year doesn't start in January, it spans two calendar years
    if ($startMonth > 1) {
        $endYear = $year + 1;
    }
    
    $startDate = sprintf('%04d-%02d-01', $startYear, $startMonth);
    
    // End date is last day of month before start month in next year
    $endMonth = $startMonth - 1;
    if ($endMonth < 1) {
        $endMonth = 12;
    }
    $endDate = date('Y-m-t', strtotime(sprintf('%04d-%02d-01', $endYear, $endMonth)));
    
    return [
        'start' => $startDate,
        'end' => $endDate,
        'label' => $startMonth == 1 
            ? "FY $year" 
            : "FY $startYear-" . substr($endYear, 2)
    ];
}

/**
 * Get available financial year options for dropdowns
 */
function getFinancialYearOptions() {
    return [
        1 => ['month' => 'January', 'countries' => 'CN, US Corporate'],
        4 => ['month' => 'April', 'countries' => 'IN, JP, UK'],
        7 => ['month' => 'July', 'countries' => 'AU, NZ'],
        10 => ['month' => 'October', 'countries' => 'US Federal'],
    ];
}

/**
 * Validate required fields
 */
function validateRequired($data, $fields) {
    $errors = [];
    foreach ($fields as $field) {
        if (!isset($data[$field]) || trim($data[$field]) === '') {
            $errors[] = ucfirst(str_replace('_', ' ', $field)) . ' is required';
        }
    }
    return $errors;
}

/**
 * Get pagination info
 */
function paginate($total, $perPage = 50, $currentPage = 1) {
    $totalPages = max(1, ceil($total / $perPage));
    $currentPage = max(1, min($currentPage, $totalPages));
    $offset = ($currentPage - 1) * $perPage;
    
    return [
        'total' => $total,
        'per_page' => $perPage,
        'current_page' => $currentPage,
        'total_pages' => $totalPages,
        'offset' => $offset,
        'has_prev' => $currentPage > 1,
        'has_next' => $currentPage < $totalPages
    ];
}

/**
 * Build WHERE clause from filters
 */
function buildWhereClause($filters, $businessId, $departmentId = null) {
    $where = ['t.business_id = ?'];
    $params = [$businessId];
    
    // Filter by department if specified (not null means specific department selected)
    if ($departmentId !== null && $departmentId > 0) {
        $where[] = 't.department_id = ?';
        $params[] = $departmentId;
    }
    
    if (!empty($filters['date_from'])) {
        $where[] = 't.date >= ?';
        $params[] = $filters['date_from'];
    }
    
    if (!empty($filters['date_to'])) {
        $where[] = 't.date <= ?';
        $params[] = $filters['date_to'];
    }
    
    if (!empty($filters['type'])) {
        $where[] = 't.type = ?';
        $params[] = $filters['type'];
    }
    
    if (!empty($filters['payment_method'])) {
        $where[] = 't.payment_method = ?';
        $params[] = $filters['payment_method'];
    }
    
    if (!empty($filters['status'])) {
        $where[] = 't.status = ?';
        $params[] = $filters['status'];
    }
    
    if (!empty($filters['category_id'])) {
        $where[] = 't.category_id = ?';
        $params[] = $filters['category_id'];
    }
    
    if (!empty($filters['search'])) {
        $search = '%' . $filters['search'] . '%';
        $where[] = '(t.party LIKE ? OR t.description LIKE ? OR t.invoice_or_bill_ref LIKE ?)';
        $params[] = $search;
        $params[] = $search;
        $params[] = $search;
    }
    
    return [implode(' AND ', $where), $params];
}

/**
 * Get transaction types with their effect
 */
function getTransactionTypes() {
    return [
        'Sale' => ['label' => 'Sale', 'effect' => 'income'],
        'Purchase' => ['label' => 'Purchase', 'effect' => 'expense'],
        'Expense' => ['label' => 'Expense', 'effect' => 'expense'],
        'Receive' => ['label' => 'Receive Payment', 'effect' => 'receive'],
        'Pay' => ['label' => 'Make Payment', 'effect' => 'pay'],
        'Transfer' => ['label' => 'Transfer', 'effect' => 'neutral'],
        'Owner' => ['label' => 'Owner Transaction', 'effect' => 'neutral']
    ];
}

/**
 * Get payment methods
 */
function getPaymentMethods() {
    return ['Cash', 'Bank', 'Card', 'Online', 'Credit'];
}

/**
 * Get status options
 */
function getStatusOptions() {
    return ['Paid', 'Part', 'Unpaid'];
}

/**
 * Calculate totals from transactions
 */
function calculateTotals($transactions) {
    $totals = [
        'total' => 0,
        'by_type' => [],
        'by_payment_method' => [],
        'income' => 0,
        'expense' => 0
    ];
    
    foreach ($transactions as $t) {
        $amount = (float)$t['amount'];
        $totals['total'] += $amount;
        
        if (!isset($totals['by_type'][$t['type']])) {
            $totals['by_type'][$t['type']] = 0;
        }
        $totals['by_type'][$t['type']] += $amount;
        
        if (!isset($totals['by_payment_method'][$t['payment_method']])) {
            $totals['by_payment_method'][$t['payment_method']] = 0;
        }
        $totals['by_payment_method'][$t['payment_method']] += $amount;
        
        if (in_array($t['type'], ['Sale', 'Receive'])) {
            $totals['income'] += $amount;
        } elseif (in_array($t['type'], ['Purchase', 'Expense', 'Pay'])) {
            $totals['expense'] += $amount;
        }
    }
    
    return $totals;
}

/**
 * Security headers
 */
function setSecurityHeaders() {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('X-XSS-Protection: 1; mode=block');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('X-Robots-Tag: noindex, nofollow');
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Pragma: no-cache");
}

/**
 * Get categories for select dropdown
 */
function getCategories($businessId, $type = null) {
    $sql = "SELECT id, name, type FROM categories WHERE business_id = ? AND active = 1";
    $params = [$businessId];
    
    if ($type) {
        $sql .= " AND type = ?";
        $params[] = $type;
    }
    
    $sql .= " ORDER BY type, name";
    return db()->fetchAll($sql, $params);
}

/**
 * Get departments for select dropdown
 */
function getDepartments($businessId) {
    return db()->fetchAll(
        "SELECT id, name FROM departments WHERE business_id = ? AND active = 1 ORDER BY name",
        [$businessId]
    );
}

/**
 * Get businesses for admin
 */
function getBusinesses() {
    return db()->fetchAll("SELECT id, name FROM businesses WHERE active = 1 ORDER BY name");
}

/**
 * Log activity (optional, can be extended)
 */
function logActivity($action, $details = []) {
    // Implement if needed - can log to file or database
    // For now, just a placeholder
}

/**
 * Clean old sessions
 */
function cleanOldSessions($maxAge = 86400) {
    db()->query(
        "DELETE FROM sessions WHERE last_activity < ?",
        [time() - $maxAge]
    );
}

/**
 * Format date for display
 */
function formatDate($date, $format = 'Y-m-d') {
    return $date ? date($format, strtotime($date)) : '';
}

/**
 * Get input value with default
 */
function input($key, $default = '') {
    return $_POST[$key] ?? $_GET[$key] ?? $default;
}

/**
 * Check if request is POST
 */
function isPost() {
    return $_SERVER['REQUEST_METHOD'] === 'POST';
}

/**
 * Redirect helper
 */
function redirect($url) {
    header('Location: ' . $url);
    exit;
}
