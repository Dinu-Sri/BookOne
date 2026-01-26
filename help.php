<?php
/**
 * Help & Documentation Page
 */
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';

Auth::requireAuth();

$pageTitle = 'Help & Documentation - ' . APP_NAME;
$currentPage = 'help';

include __DIR__ . '/includes/header.php';

// Read markdown files
$beginnersGuide = file_exists(__DIR__ . '/BEGINNERS_GUIDE.md') 
    ? file_get_contents(__DIR__ . '/BEGINNERS_GUIDE.md') 
    : 'Guide not found.';

$accountingLogic = file_exists(__DIR__ . '/ACCOUNTING_LOGIC.md') 
    ? file_get_contents(__DIR__ . '/ACCOUNTING_LOGIC.md') 
    : 'Documentation not found.';
?>

<style>
/* Help Page Styles */
.help-tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--gray-200);
    margin-bottom: 1rem;
}
.help-tab {
    padding: 0.6rem 1.25rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--gray-600);
    cursor: pointer;
    transition: all 0.2s;
}
.help-tab:hover {
    color: var(--primary);
    background: var(--gray-50);
}
.help-tab.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
}
.help-tab-icon {
    margin-right: 0.4rem;
}

.help-content {
    background: white;
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 1.5rem 2rem;
    width: 100%;
}
.help-pane {
    display: none;
}
.help-pane.active {
    display: block;
}

/* Two-column layout for content sections */
.content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1.5rem;
}
.content-card {
    background: var(--gray-50);
    border-radius: var(--radius);
    padding: 1rem 1.25rem;
    border: 1px solid var(--gray-200);
}
.content-card h3 {
    margin-top: 0 !important;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--gray-200);
    margin-bottom: 0.75rem !important;
}

/* Markdown Styling - Compact */
.markdown-body {
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--gray-700);
}
.markdown-body h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--gray-900);
    margin: 0 0 0.5rem 0;
    padding-bottom: 0.4rem;
    border-bottom: 2px solid var(--primary);
}
.markdown-body h2 {
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--primary);
    margin: 1.25rem 0 0.6rem 0;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--gray-200);
}
.markdown-body h3 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--gray-800);
    margin: 1rem 0 0.5rem 0;
}
.markdown-body h4 {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--gray-600);
    margin: 0.75rem 0 0.4rem 0;
}
.markdown-body p {
    margin: 0.5rem 0;
}
.markdown-body ul, .markdown-body ol {
    margin: 0.5rem 0;
    padding-left: 1.25rem;
}
.markdown-body li {
    margin: 0.25rem 0;
}
.markdown-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.85rem;
}
.markdown-body th {
    background: var(--primary);
    color: white;
    padding: 0.5rem 0.6rem;
    text-align: left;
    font-weight: 500;
    border: 1px solid var(--primary);
}
.markdown-body td {
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--gray-200);
}
.markdown-body tr:nth-child(even) {
    background: var(--gray-50);
}
.markdown-body code {
    background: #fef3c7;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 0.8em;
    color: #92400e;
}
.markdown-body pre {
    background: var(--gray-800);
    color: #f8f8f2;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    overflow-x: auto;
    margin: 0.75rem 0;
    font-size: 0.8rem;
}
.markdown-body pre code {
    background: none;
    color: inherit;
    padding: 0;
}
.markdown-body blockquote {
    border-left: 3px solid var(--primary);
    margin: 0.75rem 0;
    padding: 0.4rem 0.75rem;
    background: #eff6ff;
    color: var(--gray-700);
    font-size: 0.85rem;
}
.markdown-body hr {
    border: none;
    border-top: 1px solid var(--gray-200);
    margin: 1.25rem 0;
}
.markdown-body strong {
    font-weight: 600;
    color: var(--gray-800);
}
.markdown-body a {
    color: var(--primary);
    text-decoration: none;
}
.markdown-body a:hover {
    text-decoration: underline;
}

/* Info boxes - Compact */
.info-box {
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius);
    margin: 0.6rem 0;
    font-size: 0.85rem;
}
.info-box.tip {
    background: #ecfdf5;
    border-left: 3px solid #10b981;
}
.info-box.warning {
    background: #fffbeb;
    border-left: 3px solid #f59e0b;
}
.info-box.important {
    background: #fef2f2;
    border-left: 3px solid #ef4444;
}

/* Summary/intro section */
.intro-text {
    background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    margin-bottom: 1rem;
    font-size: 0.9rem;
    color: var(--gray-600);
    border: 1px solid var(--gray-200);
}

@media (max-width: 900px) {
    .content-grid {
        grid-template-columns: 1fr;
    }
}

/* Print styles */
@media print {
    .help-tabs, .sidebar, .header { display: none !important; }
    .help-content { box-shadow: none; padding: 0; }
    .main-content { margin: 0; padding: 0; }
}

/* Page header compact */
.help-page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
}
.help-page-header h2 {
    font-size: 1.25rem;
    margin: 0;
}
</style>

<div class="help-page-header">
    <h2>📖 Help & Documentation</h2>
    <button class="btn btn-sm btn-outline" onclick="window.print()">🖨️ Print</button>
</div>

<div class="help-tabs">
    <button class="help-tab active" data-tab="guide">
        <span class="help-tab-icon">📚</span>Beginner's Guide <small style="color:var(--gray-400);font-weight:normal">(For New Users)</small>
    </button>
    <button class="help-tab" data-tab="accounting">
        <span class="help-tab-icon">📊</span>Accounting Logic <small style="color:var(--gray-400);font-weight:normal">(For Accountants)</small>
    </button>
</div>

<div class="help-content">
    <div class="help-pane active" id="pane-guide">
        <div class="markdown-body" id="guide-content">
            Loading...
        </div>
    </div>
    <div class="help-pane" id="pane-accounting">
        <div class="markdown-body" id="accounting-content">
            Loading...
        </div>
    </div>
</div>

<!-- Store markdown content -->
<script id="beginners-guide-md" type="text/markdown">
<?= htmlspecialchars($beginnersGuide, ENT_QUOTES, 'UTF-8') ?>
</script>

<script id="accounting-logic-md" type="text/markdown">
<?= htmlspecialchars($accountingLogic, ENT_QUOTES, 'UTF-8') ?>
</script>

<script>
document.addEventListener('DOMContentLoaded', function() {
    // Simple markdown parser with improved formatting
    function parseMarkdown(md) {
        let html = md;
        
        // Escape HTML first
        html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Code blocks (``` ... ```)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
            return '<pre><code class="language-' + lang + '">' + code.trim() + '</code></pre>';
        });
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Headers
        html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        
        // Bold and italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Blockquotes - handle > 💡 style tips
        html = html.replace(/^&gt; 💡 \*\*Tip:\*\* (.+)$/gm, '<div class="info-box tip">💡 <strong>Tip:</strong> $1</div>');
        html = html.replace(/^&gt; ⚠️(.+)$/gm, '<div class="info-box warning">⚠️$1</div>');
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
        
        // Horizontal rules
        html = html.replace(/^---+$/gm, '<hr>');
        
        // Tables - improved handling
        const tableRegex = /(\|.+\|[\r\n]+)+/g;
        html = html.replace(tableRegex, function(tableBlock) {
            const rows = tableBlock.trim().split('\n').filter(r => r.trim());
            if (rows.length < 2) return tableBlock;
            
            let tableHtml = '<table>';
            rows.forEach((row, idx) => {
                // Skip separator row (contains only dashes and pipes)
                if (row.match(/^\|[\s\-:|]+\|$/)) return;
                
                const cells = row.split('|').filter((c, i) => i > 0 && i < row.split('|').length - 1);
                const tag = idx === 0 ? 'th' : 'td';
                const wrapper = idx === 0 ? 'thead' : '';
                
                if (idx === 0) tableHtml += '<thead>';
                if (idx === 2) tableHtml += '<tbody>';
                
                tableHtml += '<tr>' + cells.map(c => '<' + tag + '>' + c.trim() + '</' + tag + '>').join('') + '</tr>';
                
                if (idx === 0) tableHtml += '</thead>';
            });
            tableHtml += '</tbody></table>';
            return tableHtml;
        });
        
        // Lists - unordered
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        
        // Lists - ordered
        html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>');
        html = html.replace(/(<oli>.*<\/oli>\n?)+/g, function(match) {
            return '<ol>' + match.replace(/oli>/g, 'li>') + '</ol>';
        });
        
        // Paragraphs (lines not already wrapped)
        html = html.split('\n\n').map(para => {
            para = para.trim();
            if (!para) return '';
            if (para.startsWith('<')) return para;
            return '<p>' + para.replace(/\n/g, '<br>') + '</p>';
        }).join('\n');
        
        // Clean up empty elements
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<ul><\/ul>/g, '');
        html = html.replace(/<ol><\/ol>/g, '');
        
        // Fix nested lists issue
        html = html.replace(/<\/ul>\s*<ul>/g, '');
        html = html.replace(/<\/ol>\s*<ol>/g, '');
        
        return html;
    }
    
    // Load content
    const guideContent = document.getElementById('beginners-guide-md').textContent;
    const accountingContent = document.getElementById('accounting-logic-md').textContent;
    
    document.getElementById('guide-content').innerHTML = parseMarkdown(guideContent);
    document.getElementById('accounting-content').innerHTML = parseMarkdown(accountingContent);
    
    // Tab switching
    document.querySelectorAll('.help-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // Update tabs
            document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Update panes
            const tabId = this.dataset.tab;
            document.querySelectorAll('.help-pane').forEach(p => p.classList.remove('active'));
            document.getElementById('pane-' + tabId).classList.add('active');
        });
    });
});
</script>

<?php include __DIR__ . '/includes/footer.php'; ?>
