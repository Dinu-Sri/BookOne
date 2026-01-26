<?php
/**
 * BookOne v1.3 - Transaction API
 * Fixed: Recognition vs Settlement handling with proper GL auto-generation
 */

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/accounting.php';

Auth::init();
Auth::requireAuth();

header('Content-Type: application/json; charset=UTF-8');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    switch ($method) {
        case 'GET':
            if ($action === 'list') {
                echo json_encode(listTransactions());
            } elseif ($action === 'get' && isset($_GET['id'])) {
                echo json_encode(getTransaction((int)$_GET['id']));
            } elseif ($action === 'outstanding') {
                echo json_encode(getOutstandingDocuments());
            } elseif ($action === 'settlements') {
                echo json_encode(getSettlementsForDoc((int)$_GET['doc_id']));
            } elseif ($action === 'allocations') {
                echo json_encode(getAllocationsForSettlement((int)$_GET['settlement_id']));
            } elseif ($action === 'accounts') {
                echo json_encode(getPaymentAccounts());
            } else {
                throw new Exception('Invalid action');
            }
            break;
            
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            
            // CSRF check
            if (!isset($data['csrf_token']) || $data['csrf_token'] !== ($_SESSION['csrf_token'] ?? '')) {
                throw new Exception('Invalid security token');
            }
            
            if ($action === 'create' || $action === 'save') {
                echo json_encode(createTransaction($data));
            } elseif ($action === 'update' || $action === 'edit') {
                echo json_encode(updateTransaction($data));
            } elseif ($action === 'delete') {
                echo json_encode(deleteTransaction($data));
            } elseif ($action === 'void') {
                echo json_encode(voidTransactionApi($data));
            } elseif ($action === 'reverse') {
                echo json_encode(reverseTransactionApi($data));
            } elseif ($action === 'settle') {
                echo json_encode(createSettlement($data));
            } elseif ($action === 'allocate') {
                echo json_encode(allocateSettlement($data));
            } else {
                throw new Exception('Invalid action');
            }
            break;
            
        default:
            throw new Exception('Method not allowed');
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

/**
 * List transactions with filtering
 */
function listTransactions() {
    $businessId = Auth::user('business_id');
    $departmentId = Auth::user('department_id');
    
    $where = "t.business_id = ? AND t.voided = 0";
    $params = [$businessId];
    
    // Department filter
    if ($departmentId) {
        $where .= " AND t.department_id = ?";
        $params[] = $departmentId;
    }
    
    // Type filter
    if (!empty($_GET['type'])) {
        $where .= " AND t.type = ?";
        $params[] = $_GET['type'];
    }
    
    // Date range
    if (!empty($_GET['from'])) {
        $where .= " AND t.date >= ?";
        $params[] = $_GET['from'];
    }
    if (!empty($_GET['to'])) {
        $where .= " AND t.date <= ?";
        $params[] = $_GET['to'];
    }
    
    // Category filter
    if (!empty($_GET['category_id'])) {
        $where .= " AND t.category_id = ?";
        $params[] = $_GET['category_id'];
    }
    
    // Party filter
    if (!empty($_GET['party'])) {
        $where .= " AND t.party LIKE ?";
        $params[] = '%' . $_GET['party'] . '%';
    }
    
    // Payment method filter
    if (!empty($_GET['payment_method'])) {
        $where .= " AND t.payment_method = ?";
        $params[] = $_GET['payment_method'];
    }
    
    // Status filter
    if (!empty($_GET['status'])) {
        $where .= " AND t.status = ?";
        $params[] = $_GET['status'];
    }
    
    // Hide auto-settlements by default (unless show_auto=1)
    if (empty($_GET['show_auto'])) {
        $where .= " AND t.is_auto_settlement = 0";
    }
    
    // Include voided if requested
    if (!empty($_GET['show_voided'])) {
        $where = str_replace("AND t.voided = 0", "", $where);
    }
    
    // Pagination
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(10, min(100, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;
    
    // Get count
    $countSql = "SELECT COUNT(*) as total FROM transactions t WHERE $where";
    $total = db()->fetch($countSql, $params)['total'];
    
    // Get transactions with linked doc info
    $sql = "SELECT t.*, 
            c.name as category_name,
            d.name as department_name,
            pa.name as payment_account_name,
            sd.party as source_doc_party,
            sd.invoice_or_bill_ref as source_doc_ref,
            sd.amount as source_doc_amount,
            sd.type as source_doc_type
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN departments d ON t.department_id = d.id
            LEFT JOIN chart_of_accounts pa ON t.payment_account_id = pa.id
            LEFT JOIN transactions sd ON t.source_doc_id = sd.id
            WHERE $where
            ORDER BY t.date DESC, t.id DESC
            LIMIT $limit OFFSET $offset";
    
    $transactions = db()->fetchAll($sql, $params);
    
    // Enrich with outstanding info and receipt URLs
    foreach ($transactions as &$txn) {
        if (isRecognitionDoc($txn['type'])) {
            $outstanding = getDocumentOutstanding($txn['id']);
            $txn['outstanding'] = $outstanding['outstanding'];
            $txn['derived_status'] = $outstanding['derived_status'];
        }
        
        if ($txn['receipt_path']) {
            $txn['receipt_url'] = '/acc/uploads/' . basename($txn['receipt_path']);
        }
    }
    
    return [
        'success' => true,
        'data' => $transactions,
        'pagination' => [
            'total' => (int)$total,
            'page' => $page,
            'limit' => $limit,
            'pages' => ceil($total / $limit)
        ]
    ];
}

/**
 * Get single transaction with full details
 */
function getTransaction($id) {
    $businessId = Auth::user('business_id');
    
    $txn = db()->fetch(
        "SELECT t.*, c.name as category_name, d.name as department_name,
                pa.name as payment_account_name
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         LEFT JOIN departments d ON t.department_id = d.id
         LEFT JOIN chart_of_accounts pa ON t.payment_account_id = pa.id
         WHERE t.id = ? AND t.business_id = ?",
        [$id, $businessId]
    );
    
    if (!$txn) {
        throw new Exception('Transaction not found');
    }
    
    // Get settlements if recognition doc
    if (isRecognitionDoc($txn['type'])) {
        $txn['settlements'] = getDocumentSettlements($id);
        $outstanding = getDocumentOutstanding($id);
        $txn['outstanding'] = $outstanding['outstanding'];
        $txn['derived_status'] = $outstanding['derived_status'];
    }
    
    // Get allocations if settlement
    if (isSettlement($txn['type'])) {
        $txn['allocations'] = db()->fetchAll(
            "SELECT sa.*, t.party, t.invoice_or_bill_ref, t.amount as doc_amount
             FROM settlement_allocations sa
             INNER JOIN transactions t ON sa.source_doc_id = t.id
             WHERE sa.settlement_id = ?",
            [$id]
        );
        $txn['unallocated_amount'] = $txn['amount'] - getAllocatedAmount($id);
    }
    
    // Get source doc if settlement
    if (isSettlement($txn['type']) && $txn['source_doc_id']) {
        $txn['source_doc'] = db()->fetch(
            "SELECT id, type, party, amount, invoice_or_bill_ref, date 
             FROM transactions WHERE id = ?",
            [$txn['source_doc_id']]
        );
    }
    
    // Get journal entries
    $txn['journal_entries'] = db()->fetchAll(
        "SELECT je.*, 
                (SELECT GROUP_CONCAT(CONCAT(a.name, ':', jl.debit, ':', jl.credit) SEPARATOR '|')
                 FROM journal_lines jl 
                 INNER JOIN chart_of_accounts a ON jl.account_id = a.id
                 WHERE jl.journal_entry_id = je.id) as lines
         FROM journal_entries je
         WHERE je.transaction_id = ?",
        [$id]
    );
    
    return ['success' => true, 'data' => $txn];
}

/**
 * Get outstanding documents for settlement
 */
function getOutstandingDocuments() {
    $businessId = Auth::user('business_id');
    $departmentId = Auth::user('department_id');
    $type = $_GET['doc_type'] ?? 'Sale';
    
    $deptFilter = $departmentId ? " AND t.department_id = ?" : "";
    $params = [$businessId];
    if ($departmentId) $params[] = $departmentId;
    
    if ($type === 'Sale') {
        $typeFilter = "AND t.type = 'Sale'";
    } else {
        $typeFilter = "AND t.type IN ('Purchase', 'Expense')";
    }
    
    // Use allocation-based outstanding calculation
    $sql = "SELECT t.id, t.type, t.party, t.date, t.due_date, t.invoice_or_bill_ref,
                   t.amount as doc_amount,
                   t.amount - COALESCE((
                       SELECT SUM(sa.allocated_amount) 
                       FROM settlement_allocations sa 
                       INNER JOIN transactions s ON sa.settlement_id = s.id AND s.voided = 0
                       WHERE sa.source_doc_id = t.id
                   ), 0) as outstanding
            FROM transactions t
            WHERE t.business_id = ? $deptFilter $typeFilter AND t.voided = 0
            HAVING outstanding > 0.01
            ORDER BY t.date ASC";
    
    $docs = db()->fetchAll($sql, $params);
    
    return ['success' => true, 'data' => $docs];
}

/**
 * Get settlements for a document
 */
function getSettlementsForDoc($docId) {
    $settlements = getDocumentSettlements($docId);
    return ['success' => true, 'data' => $settlements];
}

/**
 * Get allocations for a settlement
 */
function getAllocationsForSettlement($settlementId) {
    $allocations = db()->fetchAll(
        "SELECT sa.*, t.party, t.invoice_or_bill_ref, t.date as doc_date, t.amount as doc_amount
         FROM settlement_allocations sa
         INNER JOIN transactions t ON sa.source_doc_id = t.id
         WHERE sa.settlement_id = ?",
        [$settlementId]
    );
    
    $settlement = db()->fetch("SELECT amount FROM transactions WHERE id = ?", [$settlementId]);
    $totalAllocated = array_sum(array_column($allocations, 'allocated_amount'));
    
    return [
        'success' => true, 
        'data' => $allocations,
        'total_allocated' => $totalAllocated,
        'unallocated' => $settlement['amount'] - $totalAllocated
    ];
}

/**
 * Get payment accounts
 */
function getPaymentAccounts() {
    $businessId = Auth::user('business_id');
    $accounts = db()->fetchAll(
        "SELECT id, code, name, sub_type 
         FROM chart_of_accounts 
         WHERE business_id = ? AND sub_type IN ('Cash', 'Bank') AND is_active = 1
         ORDER BY code",
        [$businessId]
    );
    
    return ['success' => true, 'data' => $accounts];
}

/**
 * Create transaction with proper handling
 */
function createTransaction($data) {
    $businessId = Auth::user('business_id');
    $userId = Auth::user('id');
    $departmentId = Auth::user('department_id');
    
    // Validate required fields
    $required = ['type', 'date', 'amount'];
    foreach ($required as $field) {
        if (empty($data[$field])) {
            throw new Exception("Missing required field: $field");
        }
    }
    
    $type = $data['type'];
    $amount = (float)$data['amount'];
    
    if ($amount <= 0) {
        throw new Exception('Amount must be positive');
    }
    
    // Check period lock
    if (isPeriodLocked($businessId, $data['date'], $departmentId)) {
        throw new Exception('Cannot create transaction in locked period');
    }
    
    // Resolve payment account
    $paymentAccountId = null;
    if (!empty($data['payment_account_id'])) {
        $paymentAccountId = (int)$data['payment_account_id'];
    } elseif (!empty($data['payment_method']) && $data['payment_method'] !== 'Credit') {
        // Auto-resolve payment account from payment_method for backward compatibility
        $account = resolvePaymentAccount($businessId, null, $data['payment_method']);
        if ($account) {
            $paymentAccountId = $account['id'];
        }
    }
    
    // Validate settlement requirements
    if (isSettlement($type)) {
        // Settlement can now be created without source_doc_id (for unallocated payments)
        // But if source_doc_id provided, validate it
        if (!empty($data['source_doc_id'])) {
            $sourceDoc = db()->fetch(
                "SELECT * FROM transactions WHERE id = ? AND business_id = ? AND voided = 0",
                [$data['source_doc_id'], $businessId]
            );
            
            if (!$sourceDoc) {
                throw new Exception('Source document not found');
            }
            
            // Validate matching type
            if ($type === 'Receive' && $sourceDoc['type'] !== 'Sale') {
                throw new Exception('Receive must be linked to a Sale');
            }
            if ($type === 'Pay' && !in_array($sourceDoc['type'], ['Purchase', 'Expense'])) {
                throw new Exception('Pay must be linked to a Purchase or Expense');
            }
            
            // Check outstanding (only for single-doc allocation)
            if (empty($data['allocations'])) {
                $outstanding = getDocumentOutstanding($data['source_doc_id']);
                if ($amount > $outstanding['outstanding'] + 0.01) {
                    throw new Exception("Settlement amount ({$amount}) exceeds outstanding ({$outstanding['outstanding']})");
                }
            }
            
            // Inherit party from source doc if not provided
            if (empty($data['party'])) {
                $data['party'] = $sourceDoc['party'];
            }
        }
        
        // Payment account required for settlement
        if (!$paymentAccountId) {
            throw new Exception('Payment account required for settlement');
        }
    }
    
    // Validate Transfer
    if ($type === 'Transfer') {
        if (empty($data['from_account']) || empty($data['to_account'])) {
            throw new Exception('Transfer requires from_account and to_account');
        }
        if ($data['from_account'] === $data['to_account']) {
            throw new Exception('Cannot transfer to same account');
        }
    }
    
    // Build insert data
    $insertData = [
        'business_id' => $businessId,
        'department_id' => $departmentId,
        'user_id' => $userId,
        'date' => $data['date'],
        'due_date' => $data['due_date'] ?? null,
        'type' => $type,
        'party' => $data['party'] ?? null,
        'amount' => $amount,
        'category_id' => $data['category_id'] ?? null,
        'payment_method' => $data['payment_method'] ?? null,
        'payment_account_id' => $paymentAccountId,
        'description' => $data['description'] ?? null,
        'invoice_or_bill_ref' => $data['invoice_or_bill_ref'] ?? null,
        'status' => 'Draft'
    ];
    
    // Settlement-specific fields
    if (isSettlement($type)) {
        $insertData['source_doc_id'] = $data['source_doc_id'] ?? null;
        $insertData['status'] = 'Complete';
    }
    
    // Transfer-specific fields
    if ($type === 'Transfer') {
        $insertData['from_account'] = $data['from_account'];
        $insertData['to_account'] = $data['to_account'];
        $insertData['status'] = 'Complete';
    }
    
    // Recognition documents
    if (isRecognitionDoc($type)) {
        if (empty($data['payment_method']) || $data['payment_method'] === 'Credit') {
            $insertData['payment_method'] = 'Credit';
            $insertData['status'] = 'Pending';
        } else {
            // Paid at creation - will auto-create settlement
            $insertData['status'] = 'Draft';
        }
    }
    
    db()->beginTransaction();
    
    try {
        // Insert main transaction
        $id = db()->insert('transactions', $insertData);
        
        // Handle receipt upload
        if (!empty($_FILES['receipt']) && $_FILES['receipt']['error'] === UPLOAD_ERR_OK) {
            $receiptPath = handleReceiptUpload($_FILES['receipt'], $businessId, $id);
            if ($receiptPath) {
                db()->update('transactions', ['receipt_path' => $receiptPath], 'id = ?', [$id]);
            }
        }
        
        // Generate journal entry for the transaction
        $transaction = array_merge($insertData, ['id' => $id]);
        
        // For settlements, handle allocations
        if (isSettlement($type)) {
            if (!empty($data['allocations'])) {
                // Multi-invoice allocation
                $totalAllocated = 0;
                foreach ($data['allocations'] as $alloc) {
                    if ($alloc['amount'] > 0) {
                        createAllocation($id, $alloc['doc_id'], $alloc['amount'], $userId);
                        $totalAllocated += $alloc['amount'];
                    }
                }
                
                if ($totalAllocated > $amount + 0.01) {
                    throw new Exception("Total allocations ({$totalAllocated}) exceed settlement amount ({$amount})");
                }
            } elseif (!empty($data['source_doc_id'])) {
                // Single-doc allocation (backward compatible)
                createAllocation($id, $data['source_doc_id'], $amount, $userId);
            }
            // If no source_doc_id and no allocations, this is an unallocated payment
            
            // Generate journal entry
            generateJournalEntry($transaction, $userId);
        } elseif (isRecognitionDoc($type)) {
            // Generate journal entry (Dr AR/Inventory, Cr Revenue/AP - NEVER Cash)
            generateJournalEntry($transaction, $userId);
            
            // Create auto-settlement for immediate payment
            if (!empty($data['payment_method']) && $data['payment_method'] !== 'Credit') {
                $settlementId = createAutoSettlementV13($id, $userId, $paymentAccountId);
                if ($settlementId) {
                    db()->update('transactions', ['status' => 'Paid'], 'id = ?', [$id]);
                }
            }
        } elseif ($type === 'Transfer' || $type === 'Owner') {
            generateJournalEntry($transaction, $userId);
        }
        
        // Log audit
        logAuditAction($businessId, $userId, 'Create', 'transactions', $id, null, $insertData);
        
        db()->commit();
        
        return ['success' => true, 'id' => $id, 'message' => 'Transaction created'];
        
    } catch (Exception $e) {
        db()->rollBack();
        throw $e;
    }
}

/**
 * Create auto-settlement for paid-at-creation documents (v1.3)
 * CRITICAL: This creates a proper settlement with journal entries
 */
function createAutoSettlementV13($docId, $userId, $paymentAccountId) {
    $doc = db()->fetch("SELECT * FROM transactions WHERE id = ?", [$docId]);
    if (!$doc || !isRecognitionDoc($doc['type'])) {
        return false;
    }
    
    if ($doc['payment_method'] === 'Credit') {
        return false;
    }
    
    $settlementType = ($doc['type'] === 'Sale') ? 'Receive' : 'Pay';
    
    $settlementData = [
        'business_id' => $doc['business_id'],
        'department_id' => $doc['department_id'],
        'date' => $doc['date'],
        'type' => $settlementType,
        'party' => $doc['party'],
        'amount' => $doc['amount'],
        'payment_method' => $doc['payment_method'],
        'payment_account_id' => $paymentAccountId,
        'description' => "Auto-settlement for " . $doc['type'] . " #" . $doc['id'],
        'source_doc_id' => $doc['id'],
        'is_auto_settlement' => 1,
        'user_id' => $userId,
        'status' => 'Complete'
    ];
    
    $settlementId = db()->insert('transactions', $settlementData);
    
    // Create allocation
    createAllocation($settlementId, $docId, $doc['amount'], $userId);
    
    // Generate journal entry for settlement (Dr/Cr Cash/Bank)
    generateJournalEntry(array_merge($settlementData, ['id' => $settlementId]), $userId);
    
    return $settlementId;
}

/**
 * Create settlement for existing document(s)
 */
function createSettlement($data) {
    if (!in_array($data['type'] ?? '', ['Receive', 'Pay'])) {
        throw new Exception('Invalid settlement type');
    }
    
    return createTransaction($data);
}

/**
 * Allocate settlement to documents
 */
function allocateSettlement($data) {
    $businessId = Auth::user('business_id');
    $userId = Auth::user('id');
    
    if (empty($data['settlement_id']) || empty($data['allocations'])) {
        throw new Exception('Settlement ID and allocations required');
    }
    
    $settlement = db()->fetch(
        "SELECT * FROM transactions WHERE id = ? AND business_id = ? AND voided = 0",
        [$data['settlement_id'], $businessId]
    );
    
    if (!$settlement || !isSettlement($settlement['type'])) {
        throw new Exception('Invalid settlement');
    }
    
    // Check period lock
    if (isPeriodLocked($businessId, $settlement['date'], $settlement['department_id'])) {
        throw new Exception('Cannot modify allocations in locked period');
    }
    
    // Calculate current allocations
    $currentAllocated = getAllocatedAmount($settlement['id']);
    $newAllocations = 0;
    
    foreach ($data['allocations'] as $alloc) {
        $newAllocations += (float)$alloc['amount'];
    }
    
    if ($currentAllocated + $newAllocations > $settlement['amount'] + 0.01) {
        throw new Exception('Total allocations would exceed settlement amount');
    }
    
    db()->beginTransaction();
    
    try {
        foreach ($data['allocations'] as $alloc) {
            if ((float)$alloc['amount'] > 0) {
                // Validate document exists and has sufficient outstanding
                $doc = db()->fetch(
                    "SELECT * FROM transactions WHERE id = ? AND business_id = ? AND voided = 0",
                    [$alloc['doc_id'], $businessId]
                );
                
                if (!$doc) {
                    throw new Exception("Document {$alloc['doc_id']} not found");
                }
                
                $outstanding = getDocumentOutstanding($alloc['doc_id']);
                if ((float)$alloc['amount'] > $outstanding['outstanding'] + 0.01) {
                    throw new Exception("Allocation amount exceeds outstanding for document {$alloc['doc_id']}");
                }
                
                createAllocation($settlement['id'], $alloc['doc_id'], $alloc['amount'], $userId);
            }
        }
        
        // Regenerate journal entries to reflect new allocations
        // First void old journal
        db()->query("UPDATE journal_entries SET is_voided = 1 WHERE transaction_id = ?", [$settlement['id']]);
        
        // Generate new journal
        generateJournalEntry($settlement, $userId);
        
        db()->commit();
        
        return ['success' => true, 'message' => 'Allocations created'];
        
    } catch (Exception $e) {
        db()->rollBack();
        throw $e;
    }
}

/**
 * Update transaction
 */
function updateTransaction($data) {
    $businessId = Auth::user('business_id');
    $userId = Auth::user('id');
    
    if (empty($data['id'])) {
        throw new Exception('Transaction ID required');
    }
    
    $txn = db()->fetch(
        "SELECT * FROM transactions WHERE id = ? AND business_id = ? AND voided = 0",
        [$data['id'], $businessId]
    );
    
    if (!$txn) {
        throw new Exception('Transaction not found');
    }
    
    // Check period lock
    if (isPeriodLocked($businessId, $txn['date'], $txn['department_id'])) {
        throw new Exception('Cannot update transaction in locked period. Use Reverse instead.');
    }
    
    // Cannot change type
    if (!empty($data['type']) && $data['type'] !== $txn['type']) {
        throw new Exception('Cannot change transaction type. Void and create new.');
    }
    
    // Check if settlement has allocations
    if (isSettlement($txn['type']) && !empty($data['amount']) && (float)$data['amount'] !== (float)$txn['amount']) {
        $allocated = getAllocatedAmount($txn['id']);
        if ($allocated > 0 && (float)$data['amount'] < $allocated) {
            throw new Exception("Cannot reduce amount below allocated amount ({$allocated})");
        }
    }
    
    // Cannot update auto-settlement directly
    if ($txn['is_auto_settlement']) {
        throw new Exception('Cannot update auto-settlement. Update the original document.');
    }
    
    // Build update data
    $updateData = [];
    $allowedFields = ['date', 'due_date', 'party', 'amount', 'category_id', 'payment_method', 
                      'payment_account_id', 'description', 'invoice_or_bill_ref'];
    
    foreach ($allowedFields as $field) {
        if (isset($data[$field])) {
            $updateData[$field] = $data[$field];
        }
    }
    
    if (empty($updateData)) {
        throw new Exception('No fields to update');
    }
    
    // Check if date change crosses to locked period
    if (!empty($updateData['date']) && $updateData['date'] !== $txn['date']) {
        if (isPeriodLocked($businessId, $updateData['date'], $txn['department_id'])) {
            throw new Exception('Cannot move transaction to locked period');
        }
    }
    
    // Increment version
    $updateData['version'] = $txn['version'] + 1;
    
    db()->beginTransaction();
    
    try {
        // Log audit before update
        logAuditAction($businessId, $userId, 'Update', 'transactions', $txn['id'], $txn, $updateData);
        
        db()->update('transactions', $updateData, 'id = ?', [$txn['id']]);
        
        // Regenerate journal entries
        $updatedTxn = db()->fetch("SELECT * FROM transactions WHERE id = ?", [$txn['id']]);
        
        // Void old journal and create new
        db()->query("UPDATE journal_entries SET is_voided = 1 WHERE transaction_id = ?", [$txn['id']]);
        generateJournalEntry($updatedTxn, $userId);
        
        // Handle receipt upload
        if (!empty($_FILES['receipt']) && $_FILES['receipt']['error'] === UPLOAD_ERR_OK) {
            $receiptPath = handleReceiptUpload($_FILES['receipt'], $businessId, $txn['id']);
            if ($receiptPath) {
                db()->update('transactions', ['receipt_path' => $receiptPath], 'id = ?', [$txn['id']]);
            }
        }
        
        db()->commit();
        
        return ['success' => true, 'message' => 'Transaction updated'];
        
    } catch (Exception $e) {
        db()->rollBack();
        throw $e;
    }
}

/**
 * Delete (void) transaction
 */
function deleteTransaction($data) {
    if (empty($data['id'])) {
        throw new Exception('Transaction ID required');
    }
    
    $result = voidTransaction((int)$data['id'], Auth::user('id'), $data['reason'] ?? 'Deleted by user');
    
    if (!$result['success']) {
        throw new Exception($result['error']);
    }
    
    return ['success' => true, 'message' => 'Transaction voided'];
}

/**
 * Void transaction API wrapper
 */
function voidTransactionApi($data) {
    if (empty($data['id'])) {
        throw new Exception('Transaction ID required');
    }
    
    $reason = $data['reason'] ?? '';
    if (empty($reason)) {
        throw new Exception('Void reason required');
    }
    
    $result = voidTransaction((int)$data['id'], Auth::user('id'), $reason);
    
    if (!$result['success']) {
        throw new Exception($result['error']);
    }
    
    return ['success' => true, 'message' => 'Transaction voided'];
}

/**
 * Reverse transaction API wrapper
 */
function reverseTransactionApi($data) {
    if (empty($data['id'])) {
        throw new Exception('Transaction ID required');
    }
    
    $reversalDate = $data['reversal_date'] ?? date('Y-m-d');
    $reason = $data['reason'] ?? 'Reversed by user';
    
    $result = reverseTransaction((int)$data['id'], $reversalDate, Auth::user('id'), $reason);
    
    if (!$result['success']) {
        throw new Exception($result['error']);
    }
    
    return ['success' => true, 'message' => 'Transaction reversed', 'reversal_id' => $result['reversal_id']];
}

/**
 * Handle receipt upload
 */
function handleReceiptUpload($file, $businessId, $transactionId) {
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    $maxSize = 5 * 1024 * 1024; // 5MB
    
    if (!in_array($file['type'], $allowedTypes)) {
        return null;
    }
    
    if ($file['size'] > $maxSize) {
        return null;
    }
    
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = "receipt_{$businessId}_{$transactionId}_" . time() . ".$ext";
    $path = $uploadDir . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $path)) {
        return $filename;
    }
    
    return null;
}
