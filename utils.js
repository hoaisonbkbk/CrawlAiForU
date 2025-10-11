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
