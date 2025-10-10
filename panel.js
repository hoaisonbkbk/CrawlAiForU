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
    const resultContainer = document.getElementById('result-container');
    const resultTable = document.getElementById('result-table');

    // --- State Variables ---
    let areaSelector = null;
    let paginationSelector = null;
    let allCrawledProducts = [];

    // --- Event Listeners ---
    changeAreaBtn.addEventListener('click', () => {
        statusDiv.textContent = 'Inspecting page...';
        // Send a message to the parent window (content.js) to start the inspector
        window.parent.postMessage({ type: 'INIT_INSPECTOR', mode: 'AREA' }, '*');
    });

    saveAreaBtn.addEventListener('click', () => {
        areaStatusText.textContent = `Selected Area: ${areaSelector.substring(0, 20)}...`;
        areaStatusText.style.fontWeight = 'bold';
        step1Detection.classList.add('hidden');
        step2Pagination.classList.remove('hidden');
        // Trigger change event to ensure the correct state is shown
        document.querySelector('input[name="pagination"]:checked').dispatchEvent(new Event('change'));
    });

    paginationRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            // Visually select the label
            document.querySelectorAll('.radio-group label').forEach(label => label.classList.remove('selected'));
            e.target.parentElement.classList.add('selected');

            if (e.target.value === 'next') {
                nextBtnFinder.classList.remove('hidden');
            } else {
                nextBtnFinder.classList.add('hidden');
            }
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

        // Reset previous results
        allCrawledProducts = [];
        renderTable();
        resultContainer.classList.remove('hidden');
        crawlBtn.disabled = true;
        crawlBtn.textContent = 'Crawling...';
        statusDiv.textContent = '';
        
        // Send crawl command to content.js
        window.parent.postMessage({
            type: 'START_CRAWL',
            data: {
                areaSelector: areaSelector,
                paginationMethod: paginationMethod,
                paginationSelector: paginationSelector,
                maxPages: maxPages,
            }
        }, '*');
    });

    // --- Listen for messages from content.js ---
    window.addEventListener('message', (event) => {
        const request = event.data;
        // Check for the source can be added here for security if needed
        // if (event.origin !== "chrome-extension://...") return;

        if (request.type === 'AREA_SELECTED') {
            areaSelector = request.selector;
            statusDiv.textContent = 'Area selection confirmed. Please save the area.';
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
    let maxImageCount = 0;
    function displayProducts(products) {
        products.forEach(product => {
            // Only add products that have a name
            if (product.productName) {
                allCrawledProducts.push(product);
                // Update the maximum number of images found in any product
                if (product.media && product.media.length > maxImageCount) {
                    maxImageCount = product.media.length;
                }
            }
        });
        renderTable();
    }

    function renderTable() {
        const thead = resultTable.querySelector('thead');
        const tbody = resultTable.querySelector('tbody');

        // Build table header dynamically based on maxImageCount
        let headerHTML = '<tr><th>#</th><th>Product Name</th><th>Price</th><th>URL</th>';
        for (let i = 1; i <= maxImageCount; i++) {
            headerHTML += `<th>Image ${i}</th>`;
        }
        headerHTML += '<th>Action</th></tr>';
        thead.innerHTML = headerHTML;

        // Clear previous results and build new rows
        tbody.innerHTML = '';
        allCrawledProducts.forEach((product, index) => {
            const row = document.createElement('tr');
            row.dataset.index = index; // Store original index for deletion

            let rowHTML = `<td>${index + 1}</td>
                           <td><div style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${product.productName || ''}</div></td>
                           <td>${product.price || ''}</td>
                           <td><a href="${product.url}" target="_blank">Link</a></td>`;
            
            // Add image cells
            for (let i = 0; i < maxImageCount; i++) {
                const imageUrl = product.media && product.media[i] ? product.media[i].src : '';
                rowHTML += `<td>${imageUrl ? `<a href="${imageUrl}" target="_blank"><img src="${imageUrl}" width="40" alt="product image" style="display:block; margin:auto;"></a>` : ''}</td>`;
            }

            rowHTML += `<td><button class="delete-btn">🗑️</button></td>`;
            row.innerHTML = rowHTML;
            tbody.appendChild(row);
        });
    }
    
    // Add a single event listener to the table for deleting rows
    resultTable.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('delete-btn')) {
            const row = e.target.closest('tr');
            const indexToRemove = parseInt(row.dataset.index, 10);
            
            // Remove the product from the array and re-render the table
            allCrawledProducts.splice(indexToRemove, 1);
            renderTable();
        }
    });

    // Initial state setup
    document.querySelector('input[name="pagination"]:checked').parentElement.classList.add('selected');
});

