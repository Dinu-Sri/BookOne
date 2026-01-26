<?php
/**
 * Department Switch API
 */
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

Auth::requireAuth();

$departmentId = isset($_POST['department_id']) ? (int)$_POST['department_id'] : -1;

// Handle "All Departments" option (value 0)
if ($departmentId === 0) {
    // Set department to NULL for all departments view
    db()->query("UPDATE users SET department_id = NULL WHERE id = ?", [Auth::user('id')]);
    Auth::refreshUserData();
    jsonSuccess([
        'department_id' => null,
        'department_name' => __('all_departments')
    ], 'Switched to all departments');
}

if ($departmentId < 0) {
    jsonError('Invalid department');
}

// Verify the department belongs to user's business and is active
$department = db()->fetch(
    "SELECT id, name FROM departments WHERE id = ? AND business_id = ? AND active = 1",
    [$departmentId, Auth::user('business_id')]
);

if (!$department) {
    jsonError('Department not found or access denied');
}

// Update user's department in database
db()->update('users', ['department_id' => $departmentId], 'id = ?', [Auth::user('id')]);

// Refresh session data
Auth::refreshUserData();

jsonSuccess([
    'department_id' => $departmentId,
    'department_name' => $department['name']
], 'Department switched successfully');
