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
        width: 800px;
        height: 75vh;
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
    const messageType = inspectorMode === 'AREA' ? 'AREA_SELECTED' : 'PAGINATION_SELECTED';
    
    panelFrame.contentWindow.postMessage({ type: messageType, selector: xpath }, '*');
    stopInspector();
    panelFrame.style.display = 'block';
}

// --- Crawl Logic (UPGRADED) ---
function scrapeProductInfo(productNode) {
    // EXPANDED SELECTORS for better compatibility
    const nameSelectors = [
        'h1.product_title.entry-title', // WooCommerce single product
        '.product-name', '.item-title', '[class*="title"] a', 'a[title]', 'h1', 'h2', 'h3',
        '[itemprop="name"]' // Schema.org
    ];
    const priceSelectors = [
        '.price .woocommerce-Price-amount.amount', // WooCommerce
        'p.price', // WooCommerce
        '[itemprop="price"]', // Schema.org
        '.price', '[class*="price"]', '.product-price', '[class*="amount"]'
    ];
    
    let name = null;
    for (const selector of nameSelectors) {
        const element = productNode.querySelector(selector);
        if (element && element.innerText.trim()) { name = element.innerText.trim(); break; }
    }

    let price = null;
    for (const selector of priceSelectors) {
        const element = productNode.querySelector(selector);
        if (element && element.innerText.trim()) { 
            // Get text from the element and its children, excluding nested price tags (e.g., sale price)
            price = Array.from(element.childNodes)
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent.trim())
                .join('');
            if (price) break;
            price = element.innerText.trim();
            break;
        }
    }

    const media = [];
    const foundMediaUrls = new Set();

    // Find images (UPGRADED to handle data URIs and validate file types)
    productNode.querySelectorAll('img').forEach(img => {
        // Create a priority list of attributes to check for the image URL
        const potentialSrcs = [
            img.getAttribute('data-src'),
            img.getAttribute('data-lazy-src'),
            img.getAttribute('data-srcset'), // Some lazy loaders use this
            img.getAttribute('data-original'),
            img.src,
            img.getAttribute('srcset')
        ];

        for (const srcAttr of potentialSrcs) {
            // Skip if the attribute is empty or a data URI
            if (!srcAttr || srcAttr.startsWith('data:image/')) {
                continue;
            }

            // Handle srcset by taking the first URL candidate
            const finalSrc = srcAttr.includes(',') ? srcAttr.split(',')[0].trim().split(' ')[0] : srcAttr;

            // Validate the image file extension and ensure it's unique
            const isValidImageType = /\.(webp|png|jpg|jpeg)(\?.*)?$/i.test(finalSrc);
            if (isValidImageType && !foundMediaUrls.has(finalSrc)) {
                media.push({ type: 'image', src: finalSrc });
                foundMediaUrls.add(finalSrc);
                break; // Once a valid source is found for this image tag, move to the next one
            }
        }
    });

    // Find videos
    productNode.querySelectorAll('video').forEach(video => {
        const videoSrc = video.src || video.querySelector('source')?.src;
        if (videoSrc && !foundMediaUrls.has(videoSrc)) {
            media.push({ type: 'video', src: videoSrc });
            foundMediaUrls.add(videoSrc);
        }
    });

    // Find the product detail page link
    let url = window.location.href;
    const linkSelectors = [
        'a.woocommerce-LoopProduct-link', // WooCommerce
        'a.product-card__link', // Shopify
        'a.product-link', 'a.item-link', 'a[href*="/dp/"]', 'a[href*="/product/"]', 'h3 a', 'h2 a', 'div > a[title]'
    ];
    for (const selector of linkSelectors) {
        const linkElement = productNode.querySelector(selector);
        if(linkElement && linkElement.href) {
            url = linkElement.href;
            break;
        }
    }
    if (url === window.location.href) {
        const closestLink = productNode.closest('a');
        if (closestLink && closestLink.href) { url = closestLink.href; }
    }

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

