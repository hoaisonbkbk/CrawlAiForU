class Scrapper {
    getXPath = (element) => {
        if (element.id !== '') return `id("${element.id}")`;
        if (element === document.body) return element.tagName.toLowerCase();
        let ix = 0;
        const siblings = element.parentNode.childNodes;
        for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) return `${this.getXPath(element.parentNode)}/${element.tagName.toLowerCase()}[${ix + 1}]`;
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
        }
        return null;
    }

    /// --- Scraper Logic ---
    scrapeProductInfo = (productNode) => {
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
            if (linkElement && linkElement.href) { url = new URL(linkElement.href, window.location.href).href; break; }
        }
        if (url === window.location.href) {
            const closestLink = productNode.closest('a');
            if (closestLink && closestLink.href) { url = new URL(closestLink.href, window.location.href).href; }
        }

        return { productName: name, price: price, media: media, url: url };
    }
}


