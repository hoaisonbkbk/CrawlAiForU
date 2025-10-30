class Helper {
    // --- CSV Export Logic ---
    exportToCsv = () => {
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
    // --- Function to create and inject the panel iframe ---
    createPanel = () => {
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
    togglePanel = () => {
        if (!panelFrame) {
            this.createPanel();
        } else {
            isPanelVisible = !isPanelVisible;
            panelFrame.style.display = isPanelVisible ? 'block' : 'none';
        }
    }

}

