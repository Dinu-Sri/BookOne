<?php
/**
 * Receipt Download/View
 */
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

Auth::requireAuth();

$businessId = Auth::user('business_id');
$txnId = (int)($_GET['id'] ?? 0);

if (!$txnId) {
    http_response_code(400);
    die('Invalid request');
}

// Get transaction and verify ownership
$transaction = db()->fetch(
    "SELECT receipt_file FROM transactions WHERE id = ? AND business_id = ?",
    [$txnId, $businessId]
);

if (!$transaction || !$transaction['receipt_file']) {
    http_response_code(404);
    die('Receipt not found');
}

$filePath = RECEIPTS_PATH . $transaction['receipt_file'];

if (!file_exists($filePath)) {
    http_response_code(404);
    die('File not found');
}

// Determine MIME type
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($filePath);

// Security check - only allow specific MIME types
$allowedMimes = [
    'image/jpeg',
    'image/png', 
    'image/gif',
    'image/webp',
    'application/pdf'
];

if (!in_array($mimeType, $allowedMimes)) {
    http_response_code(403);
    die('File type not allowed');
}

// Output file
header('Content-Type: ' . $mimeType);
header('Content-Length: ' . filesize($filePath));
header('Content-Disposition: inline; filename="' . basename($transaction['receipt_file']) . '"');
header('Cache-Control: private, max-age=3600');
header('X-Robots-Tag: noindex, nofollow');

readfile($filePath);
exit;
