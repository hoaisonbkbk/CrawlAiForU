// --- CSV Export Logic ---
export function exportToCsv() {
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

// --- Crawl Logic (UPGRADED) ---
export function scrapeProductInfo(productNode) {
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