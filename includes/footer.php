    </main>
    
    <div class="toast-container" id="toastContainer"></div>
    
    <script>
        window.AppConfig = {
            currencySymbol: '<?= addslashes($currencySymbol ?? '$') ?>',
            currencyCode: '<?= addslashes($businessCurrency ?? 'USD') ?>',
            csrfToken: '<?= addslashes(Auth::csrfToken()) ?>'
        };
    </script>
    <script src="assets/app.js?v=<?= filemtime(__DIR__ . '/../assets/app.js') ?>"></script>
    <?php if (isset($pageScript)): ?>
    <script><?= $pageScript ?></script>
    <?php endif; ?>
</body>
</html>
