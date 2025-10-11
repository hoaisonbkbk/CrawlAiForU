// --- Panel State ---
let panelFrame = null;
let isPanelVisible = false;

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
function createPanel() {
    if (panelFrame) return;

    panelFrame = document.createElement('iframe');
    panelFrame.src = chrome.runtime.getURL('popup/panel.html');
    panelFrame.style.cssText = `
        position: fixed;
        top: 15px;
        right: 15px;
        width: 600px;
        height: 95vh;
        border: none;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
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
    let messageType = '';
    if (inspectorMode === 'AREA') messageType = 'AREA_SELECTED';
    else if (inspectorMode === 'PAGINATION') messageType = 'PAGINATION_SELECTED';
    else if (inspectorMode === 'LOAD_MORE') messageType = 'LOAD_MORE_SELECTED';
    
    panelFrame.contentWindow.postMessage({ type: messageType, selector: xpath }, '*');
    stopInspector();
    panelFrame.style.display = 'block';
}

// --- Crawl Logic (UPGRADED) ---
function scrapeProductInfo(productNode) {
    const nameSelectors = ['h1.product_title.entry-title', 'h1', 'h2', 'h3', '.product-name', '.item-title', '[class*="title"] a', 'a[title]', '[itemprop="name"]'];
    const priceSelectors = ['.price .woocommerce-Price-amount.amount', 'p.price', '[itemprop="price"]', '.price', '[class*="price"]', '.product-price', '[class*="amount"]'];
    
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
    const foundMediaUrls = new Set();
    productNode.querySelectorAll('img').forEach(img => {
        const potentialSrcs = [img.getAttribute('data-src'), img.getAttribute('data-lazy-src'), img.getAttribute('data-srcset'), img.getAttribute('data-original'), img.src, img.getAttribute('srcset')];
        for (const srcAttr of potentialSrcs) {
            if (!srcAttr || srcAttr.startsWith('data:image/')) continue;
            const finalSrc = srcAttr.includes(',') ? srcAttr.split(',')[0].trim().split(' ')[0] : srcAttr;
            const isValidImageType = /\.(webp|png|jpg|jpeg)(\?.*)?$/i.test(finalSrc);
            if (isValidImageType && !foundMediaUrls.has(finalSrc)) {
                media.push({ type: 'image', src: new URL(finalSrc, window.location.href).href });
                foundMediaUrls.add(finalSrc);
                break;
            }
        }
    });

    let url = window.location.href;
    const linkSelectors = ['a.woocommerce-LoopProduct-link', 'a.product-card__link', 'a.product-link', 'a.item-link', 'a[href*="/dp/"]', 'a[href*="/product/"]', 'h3 a', 'h2 a', 'div > a[title]'];
    for (const selector of linkSelectors) {
        const linkElement = productNode.querySelector(selector);
        if(linkElement && linkElement.href) { url = new URL(linkElement.href, window.location.href).href; break; }
    }
    if (url === window.location.href) {
        const closestLink = productNode.closest('a');
        if (closestLink && closestLink.href) { url = new URL(closestLink.href, window.location.href).href; }
    }

    return { productName: name, price: price, media: media, url: url };
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
                const productInfo = scrapeProductInfo(node);
                if (productInfo.url && productInfo.productName && !knownProductUrls.has(productInfo.url)) {
                    newProducts.push(productInfo);
                    knownProductUrls.add(productInfo.url);
                }
            });
        } else { // Single product page case
            const productInfo = scrapeProductInfo(crawlArea);
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

