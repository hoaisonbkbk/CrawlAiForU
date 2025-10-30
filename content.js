// --- Panel State ---
let panelFrame = null;
let isPanelVisible = false;
let clsCrapper = new Scrapper();
let clsHelper = new Helper();
// --- Inspector State ---
let inspectorActive = false;
let inspectorMode = null; // Can be 'AREA', 'PAGINATION', or 'LOAD_MORE'
const highlightElement = document.createElement('div');
highlightElement.style.cssText = `
    position: absolute;
    background-color: rgba(0, 122, 255, 0.4);
    border: 2px solid #007AFF;
    border-radius: 4px;
    z-index: 99999999;
    pointer-events: none;
    transition: all 0.1s ease-in-out;
`;

// --- Function to create and inject the panel iframe ---
// function createPanel() {
//     if (panelFrame) return;

//     panelFrame = document.createElement('iframe');
//     panelFrame.src = chrome.runtime.getURL('popup/panel.html');
//     panelFrame.style.cssText = `
//         position: fixed;
//         top: 15px;
//         right: 15px;
//         width: 600px;
//         height: 95vh;
//         border: none;
//         border-radius: 12px;
//         box-shadow: 0 10px 30px rgba(0,0,0,0.15);
//         z-index: 9999999;
//         background-color: white;
//     `;
//     document.body.appendChild(panelFrame);
//     isPanelVisible = true;
// }

// --- Function to toggle panel visibility ---
// function togglePanel() {
//     if (!panelFrame) {
//         createPanel();
//     } else {
//         isPanelVisible = !isPanelVisible;
//         panelFrame.style.display = isPanelVisible ? 'block' : 'none';
//     }
// }

// --- Listen for messages from the background script (icon click) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'TOGGLE_PANEL') {
        clsHelper.togglePanel();
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
    const xpath = clsCrapper.getXPath(e.target);
    let messageType = '';
    if (inspectorMode === 'AREA') messageType = 'AREA_SELECTED';
    else if (inspectorMode === 'PAGINATION') messageType = 'PAGINATION_SELECTED';
    else if (inspectorMode === 'LOAD_MORE') messageType = 'LOAD_MORE_SELECTED';
    
    panelFrame.contentWindow.postMessage({ type: messageType, selector: xpath }, '*');
    stopInspector();
    panelFrame.style.display = 'block';
}



// --- Main Crawling Loop (UPGRADED) ---
async function startCrawlingLoop(data) {
    const { areaSelector, paginationMethod, maxPages, paginationSelector, scrollCount, loadMoreClicks, loadMoreSelector } = data;
    let knownProductUrls = new Set();

    const scrapeCurrentView = () => {
        let crawlArea = document;
        if (areaSelector) {
            const areaNode = document.evaluate(areaSelector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (areaNode) { crawlArea = areaNode; }
        }
        
        const newProducts = [];
        const itemSelectors = ['li.product', '.products > .product', '.product-item', '.s-result-item', '[class*="product-card"]', 'li[class*="item"]', '[data-component-type="s-search-result"]', 'div.product'];
        let productNodes = [];
        for (const selector of itemSelectors) {
            productNodes = crawlArea.querySelectorAll(selector);
            if (productNodes.length > 0) break;
        }

        if (productNodes.length > 0) {
            productNodes.forEach(node => {
                const productInfo = clsCrapper.scrapeProductInfo(node);
                if (productInfo.url && productInfo.productName && !knownProductUrls.has(productInfo.url)) {
                    newProducts.push(productInfo);
                    knownProductUrls.add(productInfo.url);
                }
            });
        } else { // Single product page case
            const productInfo = clsCrapper.scrapeProductInfo(crawlArea);
            if (productInfo.url && productInfo.productName && !knownProductUrls.has(productInfo.url)) {
                newProducts.push(productInfo);
                knownProductUrls.add(productInfo.url);
            }
        }
        return newProducts;
    };

    // --- Execute pagination method ---
    let initialProducts = scrapeCurrentView();
    panelFrame.contentWindow.postMessage({ type: 'CRAWL_PROGRESS', data: { products: initialProducts, newProductsCount: initialProducts.length, totalProducts: knownProductUrls.size } }, '*');

    switch (paginationMethod) {
        case 'next':
            for (let i = 1; i < maxPages; i++) {
                const nextButton = document.evaluate(paginationSelector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                if (nextButton && typeof nextButton.click === 'function') {
                    nextButton.click();
                    await new Promise(resolve => setTimeout(resolve, 3500));
                    let products = scrapeCurrentView();
                    panelFrame.contentWindow.postMessage({ type: 'CRAWL_PROGRESS', data: { products: products, newProductsCount: products.length, totalProducts: knownProductUrls.size } }, '*');
                } else {
                    panelFrame.contentWindow.postMessage({ type: 'CRAWL_ERROR', message: 'Could not find or click the "Next" button.' }, '*');
                    i = maxPages; // End the loop
                }
            }
            break;

        case 'scroll':
            let lastHeight = document.body.scrollHeight;
            for (let i = 0; i < scrollCount; i++) {
                window.scrollTo(0, document.body.scrollHeight);
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                let newHeight = document.body.scrollHeight;
                if (newHeight === lastHeight) {
                    // Stop if no more content is loaded after a scroll
                    break; 
                }
                lastHeight = newHeight;
                
                let products = scrapeCurrentView();
                panelFrame.contentWindow.postMessage({ type: 'CRAWL_PROGRESS', data: { products: products, newProductsCount: products.length, totalProducts: knownProductUrls.size } }, '*');
            }
            break;

        case 'loadMore':
            const loadMoreButton = document.evaluate(loadMoreSelector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (!loadMoreButton || typeof loadMoreButton.click !== 'function') {
                panelFrame.contentWindow.postMessage({ type: 'CRAWL_ERROR', message: 'Could not find the "Load More" button.' }, '*');
            } else {
                for (let i = 0; i < loadMoreClicks; i++) {
                    if (loadMoreButton.offsetParent === null) {
                        // Stop if the button becomes invisible/removed
                        break; 
                    }
                    loadMoreButton.click();
                    await new Promise(resolve => setTimeout(resolve, 3500));
                    let products = scrapeCurrentView();
                    panelFrame.contentWindow.postMessage({ type: 'CRAWL_PROGRESS', data: { products: products, newProductsCount: products.length, totalProducts: knownProductUrls.size } }, '*');
                }
            }
            break;
    }

    panelFrame.contentWindow.postMessage({ type: 'CRAWL_COMPLETE' }, '*');
}

