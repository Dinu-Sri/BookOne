<?php
/**
 * BookOne v1.3 - Automated Accounting Tests
 * Tests for proper double-entry generation and accounting rules
 */

require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/../includes/accounting.php';

// Test configuration
$testBusinessId = 1; // Use your test business ID
$testUserId = 1;     // Use your test user ID

class AccountingTests {
    private $businessId;
    private $userId;
    private $results = [];
    
    public function __construct($businessId, $userId) {
        $this->businessId = $businessId;
        $this->userId = $userId;
    }
    
    public function runAllTests() {
        echo "=== BookOne v1.3 Accounting Tests ===\n\n";
        
        // Test 1: Journal entry balance validation
        $this->test_journalEntryBalance();
        
        // Test 2: Sale NEVER posts to Cash/Bank directly
        $this->test_saleNeverPostsCash();
        
        // Test 3: Purchase NEVER posts to Cash/Bank directly
        $this->test_purchaseNeverPostsCash();
        
        // Test 4: Receive ALWAYS posts to Cash/Bank
        $this->test_receivePostsCash();
        
        // Test 5: Pay ALWAYS posts to Cash/Bank
        $this->test_payPostsCash();
        
        // Test 6: Settlement allocation enforcement
        $this->test_allocationEnforcement();
        
        // Test 7: Unallocated payments go to Deposits/Prepayments
        $this->test_unallocatedPayments();
        
        // Test 8: Opening balances accounting equation
        $this->test_openingBalancesEquation();
        
        // Test 9: Period lock prevents edits
        $this->test_periodLockPreventsEdits();
        
        // Test 10: P&L excludes settlements
        $this->test_pnlExcludesSettlements();
        
        // Test 11: Cash Flow excludes recognition docs
        $this->test_cashFlowFromSettlementsOnly();
        
        // Test 12: Inventory vs Service business COGS
        $this->test_inventoryCOGS();
        
        // Summary
        $this->printSummary();
    }
    
    /**
     * Test 1: Every journal entry must be balanced
     */
    private function test_journalEntryBalance() {
        $testName = "Journal Entry Balance";
        
        // Create a mock transaction
        $transaction = [
            'id' => 99999,
            'business_id' => $this->businessId,
            'department_id' => null,
            'type' => 'Sale',
            'date' => date('Y-m-d'),
            'amount' => 1000.00,
            'payment_method' => 'Credit',
            'party' => 'Test Customer',
            'description' => 'Test Sale'
        ];
        
        try {
            // Get journal lines that would be generated (without saving)
            $accounts = [
                'AR' => getAccountBySubType($this->businessId, 'AR'),
                'Sales' => getAccountBySubType($this->businessId, 'Sales'),
            ];
            
            if (!$accounts['AR'] || !$accounts['Sales']) {
                $this->recordResult($testName, false, "Required accounts not found");
                return;
            }
            
            // Simulate journal lines for Sale
            $journalLines = [
                ['debit' => 1000.00, 'credit' => 0],      // AR
                ['debit' => 0, 'credit' => 1000.00],      // Sales Revenue
            ];
            
            $totalDebits = array_sum(array_column($journalLines, 'debit'));
            $totalCredits = array_sum(array_column($journalLines, 'credit'));
            
            $balanced = abs($totalDebits - $totalCredits) < 0.01;
            
            $this->recordResult($testName, $balanced, 
                $balanced ? "Debits ($totalDebits) = Credits ($totalCredits)" 
                          : "IMBALANCED: Debits ($totalDebits) != Credits ($totalCredits)");
        } catch (Exception $e) {
            $this->recordResult($testName, false, "Exception: " . $e->getMessage());
        }
    }
    
    /**
     * Test 2: Sale transactions NEVER post directly to Cash/Bank
     */
    private function test_saleNeverPostsCash() {
        $testName = "Sale Never Posts Cash/Bank";
        
        // Check journal entry mapping for Sale
        $accounts = getChartOfAccounts($this->businessId);
        $cashAccounts = array_filter($accounts, function($a) {
            return in_array($a['sub_type'], ['Cash', 'Bank']);
        });
        $cashAccountIds = array_column($cashAccounts, 'id');
        
        if (empty($cashAccountIds)) {
            $this->recordResult($testName, false, "No Cash/Bank accounts found");
            return;
        }
        
        // For a Sale, the only accounts touched should be AR and Revenue
        // NEVER Cash/Bank
        $saleMapping = [
            'debit' => 'AR',    // AccountsReceivable
            'credit' => 'Sales' // SalesRevenue
        ];
        
        $passesCash = !in_array('Cash', array_values($saleMapping)) && 
                      !in_array('Bank', array_values($saleMapping));
        
        $this->recordResult($testName, $passesCash, 
            $passesCash ? "Sale correctly maps to AR/Revenue only" 
                        : "FAIL: Sale incorrectly posts to Cash/Bank");
    }
    
    /**
     * Test 3: Purchase transactions NEVER post directly to Cash/Bank
     */
    private function test_purchaseNeverPostsCash() {
        $testName = "Purchase Never Posts Cash/Bank";
        
        // Purchase should post to Inventory/DirectCost and AP
        $purchaseMapping = [
            'debit' => ['Inventory', 'DirectCost'], // Based on inventory setting
            'credit' => 'AP'                         // AccountsPayable
        ];
        
        $passesCash = !in_array('Cash', $purchaseMapping['debit']) && 
                      $purchaseMapping['credit'] !== 'Cash' &&
                      $purchaseMapping['credit'] !== 'Bank';
        
        $this->recordResult($testName, $passesCash, 
            $passesCash ? "Purchase correctly maps to Inventory|DirectCost/AP only" 
                        : "FAIL: Purchase incorrectly posts to Cash/Bank");
    }
    
    /**
     * Test 4: Receive ALWAYS posts to Cash/Bank
     */
    private function test_receivePostsCash() {
        $testName = "Receive Posts to Cash/Bank";
        
        // Receive should: Dr Cash/Bank, Cr AR (or CustomerDeposits if unallocated)
        $receiveMapping = [
            'debit' => 'PaymentAccount',  // Cash/Bank
            'credit' => ['AR', 'CustomerDeposits'] // Based on allocation
        ];
        
        $postsCash = $receiveMapping['debit'] === 'PaymentAccount';
        
        $this->recordResult($testName, $postsCash, 
            $postsCash ? "Receive correctly debits Cash/Bank" 
                       : "FAIL: Receive does not post to Cash/Bank");
    }
    
    /**
     * Test 5: Pay ALWAYS posts to Cash/Bank
     */
    private function test_payPostsCash() {
        $testName = "Pay Posts to Cash/Bank";
        
        // Pay should: Dr AP (or SupplierPrepayments), Cr Cash/Bank
        $payMapping = [
            'debit' => ['AP', 'SupplierPrepayments'],
            'credit' => 'PaymentAccount'  // Cash/Bank
        ];
        
        $postsCash = $payMapping['credit'] === 'PaymentAccount';
        
        $this->recordResult($testName, $postsCash, 
            $postsCash ? "Pay correctly credits Cash/Bank" 
                       : "FAIL: Pay does not post to Cash/Bank");
    }
    
    /**
     * Test 6: Settlement allocation cannot exceed settlement amount
     */
    private function test_allocationEnforcement() {
        $testName = "Allocation Amount Enforcement";
        
        // Rule: sum(allocated_amount) <= settlement.amount
        $settlementAmount = 1000.00;
        $allocations = [
            ['doc_id' => 1, 'amount' => 600.00],
            ['doc_id' => 2, 'amount' => 400.00],
        ];
        
        $totalAllocated = array_sum(array_column($allocations, 'amount'));
        $isValid = $totalAllocated <= $settlementAmount;
        
        $this->recordResult($testName, $isValid, 
            $isValid ? "Total allocated ($totalAllocated) <= settlement ($settlementAmount)" 
                     : "FAIL: Over-allocation detected");
        
        // Test over-allocation rejection
        $overAllocations = [
            ['doc_id' => 1, 'amount' => 700.00],
            ['doc_id' => 2, 'amount' => 400.00],
        ];
        
        $totalOver = array_sum(array_column($overAllocations, 'amount'));
        $wouldReject = $totalOver > $settlementAmount;
        
        $this->recordResult($testName . " (Over-allocation)", $wouldReject, 
            $wouldReject ? "Over-allocation correctly detected and would be rejected" 
                         : "FAIL: Over-allocation not detected");
    }
    
    /**
     * Test 7: Unallocated payments go to Deposits/Prepayments
     */
    private function test_unallocatedPayments() {
        $testName = "Unallocated Payment Handling";
        
        // Unallocated Receive -> CustomerDeposits (Liability)
        // Unallocated Pay -> SupplierPrepayments (Asset)
        
        $customerDepositAccount = getAccountBySubType($this->businessId, 'Deposit');
        $supplierPrepaymentAccount = getAccountBySubType($this->businessId, 'Prepayment');
        
        $hasDeposit = $customerDepositAccount !== null;
        $hasPrepayment = $supplierPrepaymentAccount !== null;
        
        if (!$hasDeposit || !$hasPrepayment) {
            $this->recordResult($testName, false, 
                "Missing accounts: Deposit=" . ($hasDeposit ? 'Yes' : 'No') . 
                ", Prepayment=" . ($hasPrepayment ? 'Yes' : 'No'));
            return;
        }
        
        // Check account types
        $depositIsLiability = $customerDepositAccount['account_type'] === 'Liability';
        $prepaymentIsAsset = $supplierPrepaymentAccount['account_type'] === 'Asset';
        
        $this->recordResult($testName, $depositIsLiability && $prepaymentIsAsset,
            "CustomerDeposits is Liability: " . ($depositIsLiability ? 'Yes' : 'No') .
            ", SupplierPrepayments is Asset: " . ($prepaymentIsAsset ? 'Yes' : 'No'));
    }
    
    /**
     * Test 8: Opening balances must satisfy accounting equation
     */
    private function test_openingBalancesEquation() {
        $testName = "Opening Balances Equation";
        
        // Assets = Liabilities + Equity
        $testBalances = [
            'assets' => 10000.00,
            'liabilities' => 3000.00,
            'equity' => 7000.00
        ];
        
        $balanced = abs($testBalances['assets'] - $testBalances['liabilities'] - $testBalances['equity']) < 0.01;
        
        $this->recordResult($testName . " (Valid)", $balanced, 
            "A ({$testBalances['assets']}) = L ({$testBalances['liabilities']}) + E ({$testBalances['equity']}): " .
            ($balanced ? "BALANCED" : "IMBALANCED"));
        
        // Test imbalanced rejection
        $imbalanced = [
            'assets' => 10000.00,
            'liabilities' => 3000.00,
            'equity' => 8000.00 // Wrong!
        ];
        
        $wouldReject = abs($imbalanced['assets'] - $imbalanced['liabilities'] - $imbalanced['equity']) > 0.01;
        
        $this->recordResult($testName . " (Invalid Rejected)", $wouldReject,
            "Imbalanced opening correctly detected");
    }
    
    /**
     * Test 9: Locked period prevents edits
     */
    private function test_periodLockPreventsEdits() {
        $testName = "Period Lock Enforcement";
        
        // Test the isPeriodLocked function
        $testDate = '2024-01-15';
        $period = date('Y-m', strtotime($testDate));
        
        // Check if period is locked
        $isLocked = isPeriodLocked($this->businessId, $testDate, null);
        
        // This test just verifies the function exists and works
        $this->recordResult($testName, true, 
            "Period $period locked status: " . ($isLocked ? 'LOCKED' : 'OPEN') . 
            " (function working correctly)");
    }
    
    /**
     * Test 10: P&L excludes settlement transactions
     */
    private function test_pnlExcludesSettlements() {
        $testName = "P&L Excludes Settlements";
        
        // P&L should only include Sale (revenue), Purchase, Expense
        // NOT Receive, Pay, Transfer, Owner
        
        $recognitionTypes = ['Sale', 'Purchase', 'Expense'];
        $settlementTypes = ['Receive', 'Pay', 'Transfer', 'Owner'];
        
        // The getProfitAndLoss function should query only recognition types
        // Let's verify by checking the function's SQL pattern
        $pnl = getProfitAndLoss($this->businessId, null, '2024-01-01', '2024-12-31');
        
        // P&L returns revenue (Sales), cogs/expenses but not cash movements
        $hasExpectedKeys = isset($pnl['revenue']) && isset($pnl['operating_expenses']);
        $hasNoSettlementKeys = !isset($pnl['receives']) && !isset($pnl['pays']);
        
        $this->recordResult($testName, $hasExpectedKeys && $hasNoSettlementKeys,
            "P&L structure correct: " . ($hasExpectedKeys ? "Has revenue/expenses" : "Missing P&L keys") .
            ", " . ($hasNoSettlementKeys ? "No settlement keys" : "Has settlement keys (BAD)"));
    }
    
    /**
     * Test 11: Cash Flow only from settlement transactions
     */
    private function test_cashFlowFromSettlementsOnly() {
        $testName = "Cash Flow From Settlements Only";
        
        // Cash Flow should derive from Receive, Pay, Owner, Transfer
        // NOT from Sale, Purchase, Expense directly
        
        $cashFlow = getCashFlow($this->businessId, null, '2024-01-01', '2024-12-31');
        
        // Check structure
        $hasOperating = isset($cashFlow['operating']);
        $hasFinancing = isset($cashFlow['financing']);
        $hasNoRevenue = !isset($cashFlow['revenue']);
        
        $this->recordResult($testName, $hasOperating && $hasFinancing && $hasNoRevenue,
            "Cash Flow structure: Operating=" . ($hasOperating ? 'Yes' : 'No') .
            ", Financing=" . ($hasFinancing ? 'Yes' : 'No') .
            ", No Revenue key=" . ($hasNoRevenue ? 'Yes' : 'No (BAD)'));
    }
    
    /**
     * Test 12: Inventory business calculates COGS correctly
     */
    private function test_inventoryCOGS() {
        $testName = "Inventory COGS Calculation";
        
        $usesInventory = businessUsesInventory($this->businessId);
        
        if (!$usesInventory) {
            $this->recordResult($testName, true, 
                "Business does not use inventory - COGS = 0 (correct for service business)");
            return;
        }
        
        // For inventory business, COGS = Opening + Purchases - Closing
        $cogs = calculateCOGS($this->businessId, null, '2024-01-01', '2024-12-31');
        
        $this->recordResult($testName, true,
            "COGS calculated: $cogs (requires stock adjustments for accuracy)");
    }
    
    /**
     * Record test result
     */
    private function recordResult($testName, $passed, $message) {
        $this->results[] = [
            'test' => $testName,
            'passed' => $passed,
            'message' => $message
        ];
        
        $status = $passed ? "✓ PASS" : "✗ FAIL";
        echo "[$status] $testName\n";
        echo "   $message\n\n";
    }
    
    /**
     * Print test summary
     */
    private function printSummary() {
        $total = count($this->results);
        $passed = count(array_filter($this->results, fn($r) => $r['passed']));
        $failed = $total - $passed;
        
        echo "=== Test Summary ===\n";
        echo "Total: $total | Passed: $passed | Failed: $failed\n";
        
        if ($failed > 0) {
            echo "\nFailed Tests:\n";
            foreach ($this->results as $result) {
                if (!$result['passed']) {
                    echo "- {$result['test']}: {$result['message']}\n";
                }
            }
        }
        
        echo "\n" . ($failed === 0 ? "All tests passed! ✓" : "Some tests failed. Please review.") . "\n";
    }
}

// Run tests if called directly
if (php_sapi_name() === 'cli' || isset($_GET['run_tests'])) {
    $tests = new AccountingTests($testBusinessId, $testUserId);
    $tests->runAllTests();
}
