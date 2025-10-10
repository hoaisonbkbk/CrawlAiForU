// --- Panel State ---
let panelFrame = null;
let isPanelVisible = false;

// --- Inspector State ---
let inspectorActive = false;
let inspectorMode = null; // Can be 'AREA' or 'PAGINATION'
const highlightElement = document.createElement('div');
highlightElement.style.cssText = `
    position: absolute;
    background-color: rgba(70, 130, 180, 0.5);
    border: 2px solid #4682B4;
    z-index: 99999999;
    pointer-events: none;
    transition: all 0.1s ease-in-out;
`;

// --- Function to create and inject the panel iframe ---
function createPanel() {
    if (panelFrame) return;

    panelFrame = document.createElement('iframe');
    panelFrame.src = chrome.runtime.getURL('panel.html');
    panelFrame.style.cssText = `
        position: fixed;
        top: 15px;
        right: 15px;
        width: 430px;
        height: 95vh;
        border: 1px solid #ccc;
        border-radius: 12px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 9999999;
        background-color: white;
    `;
    document.body.appendChild(panelFrame);
    isPanelVisible = true;
}

// --- Function to toggle panel visibility ---
function togglePanel() {
    if (!panelFrame) {
        createPanel();
    } else {
        isPanelVisible = !isPanelVisible;
        panelFrame.style.display = isPanelVisible ? 'block' : 'none';
    }
}

// --- Listen for messages from the background script (icon click) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'TOGGLE_PANEL') {
        togglePanel();
    }
    return true;
});

// --- Bridge: Listen for messages from the panel.html iframe ---
window.addEventListener('message', (event) => {
    // Basic security check
    if (event.source !== panelFrame.contentWindow) return;

    const request = event.data;
    if (request.type === 'INIT_INSPECTOR') {
        startInspector(request.mode);
        // Hide panel temporarily while inspecting for a better view
        panelFrame.style.display = 'none';
    } else if (request.type === 'START_CRAWL') {
        startCrawlingLoop(request.data);
    }
});

// --- Inspector Logic ---
function getXPath(element) {
    if (element.id !== '') return `id("${element.id}")`;
    if (element === document.body) return element.tagName.toLowerCase();
    let ix = 0;
    const siblings = element.parentNode.childNodes;
    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === element) return `${getXPath(element.parentNode)}/${element.tagName.toLowerCase()}[${ix + 1}]`;
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
    }
    return null;
}

function startInspector(mode) {
    if (inspectorActive) return;
    inspectorActive = true;
    inspectorMode = mode;
    document.body.appendChild(highlightElement);
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('click', onInspectorClick, true); // Use capturing to prevent page navigation
}

function stopInspector() {
    if (!inspectorActive) return;
    inspectorActive = false;
    inspectorMode = null;
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('mouseout', onMouseOut);
    document.removeEventListener('click', onInspectorClick, true);
    if (highlightElement.parentNode) {
        highlightElement.parentNode.removeChild(highlightElement);
    }
}

function onMouseOver(e) {
    const rect = e.target.getBoundingClientRect();
    highlightElement.style.width = `${rect.width}px`;
    highlightElement.style.height = `${rect.height}px`;
    highlightElement.style.top = `${rect.top + window.scrollY}px`;
    highlightElement.style.left = `${rect.left + window.scrollX}px`;
}

function onMouseOut() {
    highlightElement.style.width = '0px';
}

function onInspectorClick(e) {
    if (!inspectorActive) return;
    e.preventDefault();
    e.stopPropagation();

    const xpath = getXPath(e.target);
    const messageType = inspectorMode === 'AREA' ? 'AREA_SELECTED' : 'PAGINATION_SELECTED';
    
    // Send message back to the iframe
    panelFrame.contentWindow.postMessage({ type: messageType, selector: xpath }, '*');
    
    stopInspector();
    
    // Show panel again after selection is made
    panelFrame.style.display = 'block';
}

// --- Crawl Logic ---
function scrapeProductInfo(productNode) {
    // More robust selectors for common e-commerce sites
    const nameSelectors = ['h1', 'h2', 'h3', '.product-name', '.item-title', '[class*="title"] a', 'a[title]'];
    const priceSelectors = ['.price', '[class*="price"]', '.product-price', '[class*="amount"]'];
    
    let name = null;
    for (const selector of nameSelectors) {
        const element = productNode.querySelector(selector);
        if (element && element.innerText.trim()) { name = element.innerText.trim(); break; }
    }

    let price = null;
    for (const selector of priceSelectors) {
        const element = productNode.querySelector(selector);
        if (element && element.innerText.trim()) { price = element.innerText.trim(); break; }
    }

    const media = [];
    // Prioritize more specific image selectors
    const imageSelectors = ['img[class*="product"]', 'img[alt]', 'img'];
    const allImages = productNode.querySelectorAll(imageSelectors.join(', '));
    allImages.forEach(img => {
        // Handle lazy-loaded images
        const imgSrc = img.src || img.getAttribute('data-src');
        if (imgSrc && !media.some(m => m.src === imgSrc)) {
            media.push({ type: 'image', src: imgSrc });
        }
    });

    // Find the link to the product detail page
    const linkElement = productNode.closest('a');
    const url = linkElement ? linkElement.href : window.location.href;

    return { productName: name, price: price, media: media, url: url };
}

async function startCrawlingLoop(data) {
    const { areaSelector, paginationMethod, maxPages, paginationSelector } = data;
    
    for (let i = 1; i <= maxPages; i++) {
        let crawlArea = document;
        if (areaSelector) {
            const areaNode = document.evaluate(areaSelector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (areaNode) { crawlArea = areaNode; }
        }
        
        const productsOnPage = [];
        // Common selectors for product list items on various sites
        const itemSelectors = ['.product-item', '.s-result-item', '[class*="product-card"]', 'li[class*="item"]', '[data-component-type="s-search-result"]'];
        let productNodes = [];
        for (const selector of itemSelectors) {
            productNodes = crawlArea.querySelectorAll(selector);
            if (productNodes.length > 0) break;
        }

        if (productNodes.length > 0) {
            productNodes.forEach(node => productsOnPage.push(scrapeProductInfo(node)));
        } else {
            // If no list items found, assume it's a single product detail page
            productsOnPage.push(scrapeProductInfo(crawlArea));
        }

        // Send progress back to the panel
        panelFrame.contentWindow.postMessage({ type: 'CRAWL_PROGRESS', data: { currentPage: i, totalPages: maxPages, products: productsOnPage } }, '*');

        // Handle pagination
        if (i < maxPages && paginationMethod === 'next' && paginationSelector) {
            const nextButton = document.evaluate(paginationSelector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (nextButton && typeof nextButton.click === 'function') {
                nextButton.click();
                // Wait for the next page to load
                await new Promise(resolve => setTimeout(resolve, 3000)); // 3-second delay
            } else {
                panelFrame.contentWindow.postMessage({ type: 'CRAWL_ERROR', message: 'Could not find or click the pagination button.' }, '*');
                break;
            }
        } else {
             if (i >= maxPages) break;
        }
    }
    panelFrame.contentWindow.postMessage({ type: 'CRAWL_COMPLETE' }, '*');
}

