document.addEventListener('DOMContentLoaded', function() {
    // --- Get UI Elements ---
    const changeAreaBtn = document.getElementById('changeAreaBtn');
    const areaStatusText = document.getElementById('area-status-text');
    const step1Detection = document.getElementById('step1-detection');
    const saveAreaBtn = document.getElementById('saveAreaBtn');
    const step2Pagination = document.getElementById('step2-pagination');
    const paginationRadios = document.querySelectorAll('input[name="pagination"]');
    const nextBtnFinder = document.getElementById('next-btn-finder');
    const findPaginationBtn = document.getElementById('findPaginationBtn');
    const paginationSelectorText = document.getElementById('paginationSelectorText');
    const maxPagesInput = document.getElementById('maxPagesInput');
    const step3Run = document.getElementById('step3-run');
    const crawlBtn = document.getElementById('crawlBtn');
    const statusDiv = document.getElementById('status');
    const resultWrapper = document.getElementById('result-wrapper');
    const resultTable = document.getElementById('result-table');
    const exportContainer = document.getElementById('export-container');
    const exportCsvBtn = document.getElementById('exportCsvBtn');

    // --- State Variables ---
    let areaSelector = null;
    let paginationSelector = null;
    let allCrawledProducts = [];

    // --- Event Listeners ---
    changeAreaBtn.addEventListener('click', () => {
        statusDiv.textContent = 'Inspecting page...';
        step2Pagination.classList.add('hidden');
        step3Run.classList.add('hidden');
        window.parent.postMessage({ type: 'INIT_INSPECTOR', mode: 'AREA' }, '*');
    });

    saveAreaBtn.addEventListener('click', () => {
        areaStatusText.textContent = `Selected Area: ${areaSelector.substring(0, 20)}...`;
        areaStatusText.style.fontWeight = 'bold';
        step1Detection.classList.add('hidden');
        step2Pagination.classList.remove('hidden');
        step3Run.classList.remove('hidden');
        document.querySelector('input[name="pagination"]:checked').dispatchEvent(new Event('change'));
    });

    paginationRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.radio-group label').forEach(label => label.classList.remove('selected'));
            e.target.parentElement.classList.add('selected');
            const showPaginationOptions = e.target.value === 'next';
            nextBtnFinder.classList.toggle('hidden', !showPaginationOptions);
            step3Run.classList.remove('hidden');
        });
    });
    
    findPaginationBtn.addEventListener('click', () => {
        statusDiv.textContent = 'Inspecting page...';
        window.parent.postMessage({ type: 'INIT_INSPECTOR', mode: 'PAGINATION' }, '*');
    });

    crawlBtn.addEventListener('click', () => {
        const paginationMethod = document.querySelector('input[name="pagination"]:checked').value;
        const maxPages = paginationMethod === 'none' ? 1 : parseInt(maxPagesInput.value, 10);

        if (paginationMethod === 'next' && !paginationSelector) {
            statusDiv.textContent = 'Error: Please locate the "Next" button first.';
            statusDiv.style.color = 'red';
            return;
        }

        allCrawledProducts = [];
        maxMediaCount = 0; // Reset media count for new crawl
        renderTable();
        resultWrapper.classList.remove('hidden');
        crawlBtn.disabled = true;
        crawlBtn.textContent = 'Crawling...';
        statusDiv.textContent = '';
        
        window.parent.postMessage({
            type: 'START_CRAWL',
            data: { areaSelector, paginationMethod, paginationSelector, maxPages }
        }, '*');
    });

    exportCsvBtn.addEventListener('click', exportToCsv);

    // --- Listen for messages from content.js ---
    window.addEventListener('message', (event) => {
        const request = event.data;
        if (request.type === 'AREA_SELECTED') {
            areaSelector = request.selector;
            statusDiv.textContent = 'Area selection confirmed.';
            statusDiv.style.color = 'green';
            step1Detection.classList.remove('hidden');
        } else if (request.type === 'PAGINATION_SELECTED') {
            paginationSelector = request.selector;
            paginationSelectorText.textContent = `Selected: ${paginationSelector.substring(0, 25)}...`;
            statusDiv.textContent = 'Pagination button confirmed.';
            statusDiv.style.color = 'green';
        } else if (request.type === 'CRAWL_PROGRESS') {
            const { currentPage, totalPages, products } = request.data;
            statusDiv.textContent = `Crawling page ${currentPage} of ${totalPages}...`;
            displayProducts(products);
        } else if (request.type === 'CRAWL_COMPLETE') {
            statusDiv.textContent = 'Crawl complete!';
            statusDiv.style.color = 'green';
            crawlBtn.disabled = false;
            crawlBtn.textContent = 'Save and Run';
        } else if (request.type === 'CRAWL_ERROR') {
            statusDiv.textContent = `Error: ${request.message}`;
            statusDiv.style.color = 'red';
            crawlBtn.disabled = false;
            crawlBtn.textContent = 'Save and Run';
        }
    });

    // --- Result Display Logic ---
    let maxMediaCount = 0;
    function displayProducts(products) {
        products.forEach(product => {
            if (product.productName) {
                allCrawledProducts.push(product);
                if (product.media && product.media.length > maxMediaCount) {
                    maxMediaCount = product.media.length;
                }
            }
        });
        renderTable();
    }

    function renderTable() {
        const thead = resultTable.querySelector('thead');
        const tbody = resultTable.querySelector('tbody');

        let headerHTML = '<tr><th>#</th><th>Product Name</th><th>Price</th><th>Product URL</th>';
        for (let i = 1; i <= maxMediaCount; i++) headerHTML += `<th>Media ${i}</th>`;
        headerHTML += '<th>Action</th></tr>';
        thead.innerHTML = headerHTML;

        tbody.innerHTML = '';
        allCrawledProducts.forEach((product, index) => {
            const row = document.createElement('tr');
            row.dataset.index = index;

            let rowHTML = `<td>${index + 1}</td>
                           <td><div style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${product.productName || ''}">${product.productName || ''}</div></td>
                           <td>${product.price || ''}</td>
                           <td><a href="${product.url}" target="_blank">Link</a></td>`;
            
            for (let i = 0; i < maxMediaCount; i++) {
                const mediaItem = product.media && product.media[i] ? product.media[i] : null;
                let cellContent = '';
                 if (mediaItem) {
                    if (mediaItem.type === 'image') {
                        cellContent = `<a href="${mediaItem.src}" target="_blank"><img src="${mediaItem.src}" width="40" alt="product media" style="display:block; margin:auto;"></a>`;
                    } else if (mediaItem.type === 'video') {
                        cellContent = `<a href="${mediaItem.src}" target="_blank">Video</a>`;
                    }
                }
                rowHTML += `<td>${cellContent}</td>`;
            }

            rowHTML += `<td><button class="delete-btn">🗑️</button></td>`;
            row.innerHTML = rowHTML;
            tbody.appendChild(row);
        });

        exportContainer.classList.toggle('hidden', allCrawledProducts.length === 0);
    }
    
    resultTable.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('delete-btn')) {
            const row = e.target.closest('tr');
            const indexToRemove = parseInt(row.dataset.index, 10);
            allCrawledProducts.splice(indexToRemove, 1);
            renderTable();
        }
    });

    // --- CSV Export Logic ---
    function exportToCsv() {
        if (allCrawledProducts.length === 0) return;

        const escapeCsvCell = (cell) => {
            if (cell === null || cell === undefined) return '';
            const cellString = String(cell);
            if (cellString.search(/("|,|\n)/g) >= 0) {
                return `"${cellString.replace(/"/g, '""')}"`;
            }
            return cellString;
        };
        
        let headers = ['Product Name', 'Price', 'Product URL'];
        for (let i = 1; i <= maxMediaCount; i++) headers.push(`Media ${i} URL`);
        const csvRows = [headers.join(',')];

        allCrawledProducts.forEach(product => {
            const row = [
                escapeCsvCell(product.productName),
                escapeCsvCell(product.price),
                escapeCsvCell(product.url)
            ];
            for (let i = 0; i < maxMediaCount; i++) {
                const mediaUrl = product.media && product.media[i] ? product.media[i].src : '';
                row.push(escapeCsvCell(mediaUrl));
            }
            csvRows.push(row.join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'products_export.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- Initial State Setup ---
    function initialize() {
        step2Pagination.classList.remove('hidden');
        step3Run.classList.remove('hidden');
        const defaultRadio = document.querySelector('input[name="pagination"]:checked');
        defaultRadio.parentElement.classList.add('selected');
        defaultRadio.dispatchEvent(new Event('change'));
    }

    initialize();
});

