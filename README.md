# Clossyan Basic Books - Accounting Web Application

A lightweight, fast, China-accessible accounting web application for small/medium businesses, designed for shared hosting (cPanel) with MySQL/MariaDB.

## Features

- **Single Transactions Table** - All data entry through one Master Journal screen
- **Responsive UI** - Works on mobile and desktop
- **Real-time Totals** - Income, expense, and net calculations
- **Comprehensive Reports** - Sales, Purchases, Expenses, Cash/Bank balances, Receivables, Payables
- **Receipt Management** - Upload and attach receipts to transactions
- **Multi-user Support** - Roles: Admin, Manager, User
- **Multi-business Support** - Manage multiple businesses and departments
- **CSV Export** - Export filtered transaction data

## Security Features

- Password hashing (bcrypt)
- Session management with regeneration
- CSRF protection
- SQL injection prevention (prepared statements)
- XSS protection (output escaping)
- No external dependencies (China-accessible)
- Search engine blocking (robots.txt, X-Robots-Tag, meta tags)
- Protected receipt uploads

## Installation

### 1. Upload Files

Upload all files to your cPanel hosting account's public directory (e.g., `public_html/` or a subdomain folder).

### 2. Create Database

1. Log into cPanel
2. Go to MySQL® Databases
3. Create a new database (e.g., `your_db_name`)
4. Create a new user with a strong password
5. Add user to database with ALL PRIVILEGES

### 3. Configure Application

1. Copy `config.template.php` to `config.php`
2. Edit `config.php` with your database credentials:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');
```

3. Update `APP_URL` with your domain
4. Optionally configure `RECEIPTS_PATH` for storing uploads outside web root

### 4. Import Database Schema

1. Go to phpMyAdmin in cPanel
2. Select your database
3. Click Import tab
4. Upload and run `schema.sql`

### 5. Set Permissions

```
chmod 755 /path/to/your/app/
chmod 755 /path/to/your/app/receipts/
chmod 644 /path/to/your/app/config.php
```

### 6. Login

- URL: `https://yourdomain.com/`
- Default username: `admin`
- Default password: `admin123`

**⚠️ CHANGE THE DEFAULT PASSWORD IMMEDIATELY!**

## File Structure

```
/
├── api/                    # API endpoints
│   ├── export.php          # CSV export
│   ├── receipt.php         # Receipt download
│   ├── reports.php         # Reports API
│   ├── settings.php        # Settings CRUD
│   └── transactions.php    # Transactions CRUD
├── assets/                 # Static assets
│   ├── app.js              # JavaScript
│   └── style.css           # Styles
├── includes/               # PHP includes
│   ├── auth.php            # Authentication
│   ├── db.php              # Database
│   ├── footer.php          # HTML footer
│   ├── functions.php       # Utilities
│   └── header.php          # HTML header
├── receipts/               # Upload storage (protected)
│   ├── .htaccess           # Deny access
│   └── index.php           # Deny access
├── .htaccess               # Apache config
├── config.template.php     # Config template
├── config.php              # Your config (create this)
├── index.php               # Transactions page
├── login.php               # Login page
├── logout.php              # Logout handler
├── reports.php             # Reports page
├── robots.txt              # Block crawlers
├── schema.sql              # Database schema
└── settings.php            # Settings page
```

## Transaction Types

| Type | Description | Effect |
|------|-------------|--------|
| Sale | Sales to customers | Income |
| Purchase | Purchases from vendors | Expense |
| Expense | Business expenses | Expense |
| Receive | Receive payment | Cash In |
| Pay | Make payment | Cash Out |
| Transfer | Account transfers | Neutral |
| Owner | Owner contributions/withdrawals | Neutral |

## User Roles

| Role | Permissions |
|------|-------------|
| Admin | Full access, manage businesses |
| Manager | Manage users, departments, categories |
| User | Create/edit own transactions |

## Reports

All reports are generated from the single `transactions` table:

- **Summary** - Overview of sales, purchases, expenses, balances
- **Sales** - All sales transactions
- **Purchases** - All purchase transactions
- **Expenses** - Expenses with category breakdown
- **Cash/Bank** - Cash and bank balances with movement details
- **Receivables** - Outstanding customer invoices
- **Payables** - Outstanding vendor bills

## Receipt Storage

Receipts are stored in:
```
/receipts/{year}/{month}/{date}_{type}_{party}_{amount}_{txnId}.{ext}
```

Example: `/receipts/2026/01/20260126_Sale_CustomerA_10000_123.pdf`

For better security, configure `RECEIPTS_PATH` in `config.php` to store files outside the web root (e.g., `/home/username/receipts/`).

## Performance Tips

1. **Enable Caching** - The `.htaccess` file includes caching rules for static assets
2. **Use Pagination** - Default 50 items per page, adjustable
3. **Index Important Columns** - Database schema includes optimized indexes
4. **Compress Output** - GZIP compression enabled via `.htaccess`

## Troubleshooting

### "Database connection failed"
- Verify database credentials in `config.php`
- Check database user has proper permissions
- Ensure database server is running

### "Invalid security token"
- Clear browser cookies
- Session may have expired, login again

### "File upload failed"
- Check `receipts/` folder permissions (755)
- Verify PHP upload settings in `.htaccess`
- Check file size (max 5MB)

### Receipts not displaying
- Ensure `receipts/.htaccess` is in place
- Check receipts are accessed via `api/receipt.php`

## Support

This is a self-contained application designed for reliability on shared hosting. All dependencies are bundled locally - no external CDNs or resources required.

## License

Private/proprietary software for internal business use.
