// utils.js is loaded alongside content.js in manifest.json
// scrapeProductInfo function is available globally
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
    panelFrame.src = chrome.runtime.getURL('popup/panel.html');
    panelFrame.style.cssText = `
        position: fixed;
        top: 15px;
        right: 15px;
        width: 800px;
        height: 98vh;
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
    if (event.source !== panelFrame.contentWindow) return;

    const request = event.data;
    if (request.type === 'INIT_INSPECTOR') {
        startInspector(request.mode);
        panelFrame.style.display = 'none';
    } else if (request.type === 'START_CRAWL') {
        startCrawlingLoop(request.data);
    }
});

// --- Inspector Logic ---
function startInspector(mode) {
    if (inspectorActive) return;
    inspectorActive = true;
    inspectorMode = mode;
    document.body.appendChild(highlightElement);
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('click', onInspectorClick, true);
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

    panelFrame.contentWindow.postMessage({ type: messageType, selector: xpath }, '*');
    stopInspector();
    panelFrame.style.display = 'block';
}

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




async function startCrawlingLoop(data) {
    const { areaSelector, paginationMethod, maxPages, paginationSelector } = data;

    for (let i = 1; i <= maxPages; i++) {
        let crawlArea = document;
        if (areaSelector) {
            const areaNode = document.evaluate(areaSelector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (areaNode) { crawlArea = areaNode; }
        }

        const productsOnPage = [];
        // EXPANDED ITEM SELECTORS
        const itemSelectors = [
            'li.product', // WooCommerce
            '.products > .product', // WooCommerce
            '.product-item', '.s-result-item', '[class*="product-card"]', 'li[class*="item"]', '[data-component-type="s-search-result"]',
            'div.product' // Generic
        ];
        let productNodes = [];
        for (const selector of itemSelectors) {
            productNodes = crawlArea.querySelectorAll(selector);
            if (productNodes.length > 0) break;
        }

        if (productNodes.length > 0) {
            productNodes.forEach(node => productsOnPage.push(scrapeProductInfo(node)));
        } else {
            productsOnPage.push(scrapeProductInfo(crawlArea));
        }

        panelFrame.contentWindow.postMessage({ type: 'CRAWL_PROGRESS', data: { currentPage: i, totalPages: maxPages, products: productsOnPage } }, '*');

        if (i < maxPages && paginationMethod === 'next' && paginationSelector) {
            const nextButton = document.evaluate(paginationSelector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (nextButton && typeof nextButton.click === 'function') {
                nextButton.click();
                await new Promise(resolve => setTimeout(resolve, 3500)); // Increased wait time
            } else {
                panelFrame.contentWindow.postMessage({ type: 'CRAWL_ERROR', message: 'Could not find or click the pagination button.' }, '*');
                break;
            }
        } else if (i >= maxPages) {
            break;
        }
    }
    panelFrame.contentWindow.postMessage({ type: 'CRAWL_COMPLETE' }, '*');
}

