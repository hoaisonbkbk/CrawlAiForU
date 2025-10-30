document.addEventListener('DOMContentLoaded', function () {
    // --- Get UI Elements ---
    const changeAreaBtn = document.getElementById('changeAreaBtn');
    const areaStatus = document.getElementById('areaStatus');
    const selectNextBtn = document.getElementById('selectNextBtn');
    const nextButtonSelector = document.getElementById('nextButtonSelector');
    const selectLoadMoreBtn = document.getElementById('selectLoadMoreBtn');
    const loadMoreSelector = document.getElementById('loadMoreSelector');
    const startCrawlBtn = document.getElementById('startCrawlBtn');
    const crawlStatus = document.getElementById('crawlStatus');
    const resultWrapper = document.getElementById('result-wrapper');
    const resultTable = document.getElementById('result-table');
    const exportBtn = document.getElementById('exportBtn');

    // --- State Variables ---
    let areaSelector = null;
    let nextBtnSelector = null;
    let loadMoreBtnSelector = null;
    let allProducts = new Map(); // Use a Map to prevent duplicates
    
    // --- Event Listeners ---

    // Inspector buttons
    changeAreaBtn.addEventListener('click', () => {
        window.parent.postMessage({ type: 'INIT_INSPECTOR', mode: 'AREA' }, '*');
    });

    selectNextBtn.addEventListener('click', () => {
        window.parent.postMessage({ type: 'INIT_INSPECTOR', mode: 'PAGINATION' }, '*');
    });
    
    selectLoadMoreBtn.addEventListener('click', () => {
        window.parent.postMessage({ type: 'INIT_INSPECTOR', mode: 'LOAD_MORE' }, '*');
    });

    // Main crawl button
    startCrawlBtn.addEventListener('click', () => {
        // Reset previous results and UI state
        allProducts.clear();
        resultTable.querySelector('thead').innerHTML = '';
        resultTable.querySelector('tbody').innerHTML = '';
        resultWrapper.style.display = 'none';
        exportBtn.style.display = 'none';
        startCrawlBtn.disabled = true;
        startCrawlBtn.querySelector('span').textContent = 'Running...';
        setStatus('Starting crawl...', 'normal');

        // Gather configuration from the UI
        const selectedMethod = document.querySelector('input[name="pagination"]:checked').value;
        const crawlData = {
            areaSelector: areaSelector,
            paginationMethod: selectedMethod,
            // Get values for each method from their input fields
            maxPages: parseInt(document.getElementById('maxPages').value, 10),
            paginationSelector: nextBtnSelector,
            scrollCount: parseInt(document.getElementById('scrollCount').value, 10),
            loadMoreClicks: parseInt(document.getElementById('loadMoreClicks').value, 10),
            loadMoreSelector: loadMoreBtnSelector,
        };
        
        // Send crawl command to the content script
        window.parent.postMessage({ type: 'START_CRAWL', data: crawlData }, '*');
    });
    
    // Export button
    exportBtn.addEventListener('click', exportToCSV);

    // Listen for all messages from the content script
    window.addEventListener('message', (event) => {
        const request = event.data;
        switch (request.type) {
            case 'AREA_SELECTED':
                areaSelector = request.selector;
                areaStatus.textContent = `Selected Area Confirmed`;
                areaStatus.className = 'status-message success';
                break;
            case 'PAGINATION_SELECTED':
                nextBtnSelector = request.selector;
                nextButtonSelector.value = `XPath Selected`;
                break;
            case 'LOAD_MORE_SELECTED':
                loadMoreBtnSelector = request.selector;
                loadMoreSelector.value = `XPath Selected`;
                break;
            case 'CRAWL_PROGRESS':
                const progressMsg = `Found ${request.data.newProductsCount} new items... (Total: ${request.data.totalProducts})`;
                setStatus(progressMsg, 'normal');
                processAndDisplayProducts(request.data.products);
                break;
            case 'CRAWL_COMPLETE':
                setStatus(`Crawl finished! Found ${allProducts.size} unique products.`, 'success');
                startCrawlBtn.disabled = false;
                startCrawlBtn.querySelector('span').textContent = 'Save and Run';
                break;
            case 'CRAWL_ERROR':
                setStatus(`Error: ${request.message}`, 'error');
                startCrawlBtn.disabled = false;
                startCrawlBtn.querySelector('span').textContent = 'Save and Run';
                break;
        }
    });

    // --- Helper Functions ---
    function setStatus(message, type) {
        crawlStatus.textContent = message;
        crawlStatus.className = `status-message ${type}`;
    }

    function processAndDisplayProducts(products) {
        if (products.length === 0) return;
        
        // Add new unique products to our master list
        products.forEach(product => {
            // A valid product must have a URL and a name
            if (product.url && product.productName && !allProducts.has(product.url)) {
                allProducts.set(product.url, product);
            }
        });

        // Determine the maximum number of media columns needed
        let maxMedia = 0;
        allProducts.forEach(p => {
            if (p.media && p.media.length > maxMedia) {
                maxMedia = p.media.length;
            }
        });

        // Update the results table
        updateTable(maxMedia);

        // Show the results section if there's data
        if (allProducts.size > 0) {
            resultWrapper.style.display = 'block';
            exportBtn.style.display = 'inline-flex';
        }
    }
    
    function updateTable(maxMedia) {
        const thead = resultTable.querySelector('thead');
        const tbody = resultTable.querySelector('tbody');

        // Build Table Header
        let headerHTML = '<tr><th>Product Name</th><th>Price</th><th>URL</th>';
        for (let i = 1; i <= maxMedia; i++) {
            headerHTML += `<th>Media ${i}</th>`;
        }
        headerHTML += '<th>Action</th></tr>';
        thead.innerHTML = headerHTML;

        // Build Table Body
        tbody.innerHTML = ''; // Clear previous rows
        allProducts.forEach((product, url) => {
            const row = document.createElement('tr');
            row.dataset.url = url; // Store URL for easy deletion

            let rowHTML = `
                <td title="${product.productName || ''}">${(product.productName || 'N/A').substring(0, 40)}...</td>
                <td>${product.price || 'N/A'}</td>
                <td><a href="${product.url}" target="_blank" title="${product.url}">Link</a></td>
            `;

            for (let i = 0; i < maxMedia; i++) {
                const mediaItem = product.media[i];
                rowHTML += `<td>${mediaItem ? `<a href="${mediaItem.src}" target="_blank" title="${mediaItem.src}">${mediaItem.type}</a>` : ''}</td>`;
            }
            
            rowHTML += `<td><span class="trash-icon" title="Delete row">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </span></td>`;
            row.innerHTML = rowHTML;
            tbody.appendChild(row);
        });
        
        // Add event listeners to the new trash icons
        tbody.querySelectorAll('.trash-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const rowToDelete = e.target.closest('tr');
                const urlToDelete = rowToDelete.dataset.url;
                allProducts.delete(urlToDelete);
                rowToDelete.remove();
                // Optionally, redraw the table to adjust media columns
                processAndDisplayProducts([]);
            });
        });
    }

    function exportToCSV() {
        if (allProducts.size === 0) return;

        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = Array.from(resultTable.querySelectorAll('thead th')).map(th => `"${th.textContent}"`).slice(0, -1).join(',');
        csvContent += headers + "\r\n";

        allProducts.forEach(product => {
            const maxMedia = resultTable.querySelectorAll('thead th').length - 4; // Total headers minus non-media ones
            let row = [
                `"${(product.productName || '').replace(/"/g, '""')}"`,
                `"${(product.price || '').replace(/"/g, '""')}"`,
                `"${product.url || ''}"`
            ];
            for (let i = 0; i < maxMedia; i++) {
                row.push(`"${product.media[i] ? product.media[i].src : ''}"`);
            }
            csvContent += row.join(',') + "\r\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "products_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});

