<?php
/**
 * Export API Endpoint - CSV Export
 */
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

Auth::requireAuth();

$businessId = Auth::user('business_id');

// Verify CSRF
$token = $_GET['csrf_token'] ?? $_POST['csrf_token'] ?? '';
if (!Auth::verifyCsrf($token)) {
    die('Invalid security token');
}

$type = input('type', 'transactions');
$dateFrom = input('date_from');
$dateTo = input('date_to');

// Build date filter
$dateWhere = '';
$dateParams = [$businessId];
if ($dateFrom) {
    $dateWhere .= ' AND t.date >= ?';
    $dateParams[] = $dateFrom;
}
if ($dateTo) {
    $dateWhere .= ' AND t.date <= ?';
    $dateParams[] = $dateTo;
}

// Build type filter
$typeWhere = '';
switch ($type) {
    case 'sales':
        $typeWhere = " AND t.type = 'Sale'";
        $filename = 'sales';
        break;
    case 'purchases':
        $typeWhere = " AND t.type = 'Purchase'";
        $filename = 'purchases';
        break;
    case 'expenses':
        $typeWhere = " AND t.type = 'Expense'";
        $filename = 'expenses';
        break;
    default:
        $filename = 'transactions';
}

// Get data
$sql = "SELECT 
            t.id,
            t.date,
            t.type,
            t.party,
            t.description,
            t.payment_method,
            t.amount,
            c.name as category,
            t.invoice_or_bill_ref,
            t.status,
            t.link_id,
            d.name as department,
            t.notes,
            t.created_at
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN departments d ON t.department_id = d.id
        WHERE t.business_id = ? $dateWhere $typeWhere
        ORDER BY t.date DESC, t.id DESC";

$data = db()->fetchAll($sql, $dateParams);

// Generate filename
$dateStr = date('Ymd');
$filename = "{$filename}_{$dateStr}.csv";

// Output CSV
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: no-cache');
header('X-Robots-Tag: noindex, nofollow');

// Open output stream
$output = fopen('php://output', 'w');

// Add BOM for Excel UTF-8 compatibility
fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));

// Headers
$headers = [
    'ID',
    'Date',
    'Type',
    'Party',
    'Description',
    'Payment Method',
    'Amount',
    'Category',
    'Invoice/Bill Ref',
    'Status',
    'Link ID',
    'Department',
    'Notes',
    'Created At'
];
fputcsv($output, $headers);

// Data rows
foreach ($data as $row) {
    fputcsv($output, [
        $row['id'],
        $row['date'],
        $row['type'],
        $row['party'],
        $row['description'],
        $row['payment_method'],
        $row['amount'],
        $row['category'],
        $row['invoice_or_bill_ref'],
        $row['status'],
        $row['link_id'],
        $row['department'],
        $row['notes'],
        $row['created_at']
    ]);
}

fclose($output);
exit;
