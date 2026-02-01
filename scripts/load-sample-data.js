import { ingestionService } from '../src/services/ingest/index.js';
import { logger } from '../src/lib/logger.js';
const sampleDocuments = [
    {
        documentId: 'customer-handbook-001',
        customerId: 'cust-123',
        content: `
Customer Service Handbook

Contact Information:
- Primary support email: support@example.com
- Phone: 1-800-555-0123
- Hours: Monday-Friday, 9 AM - 5 PM EST

Returns Policy:
All items can be returned within 30 days of purchase for a full refund. 
Items must be in original condition with tags attached. 
Shipping costs are non-refundable unless the item is defective.

Warranty Information:
All products come with a standard 1-year warranty covering manufacturing defects.
Extended warranties are available for purchase at checkout.

Shipping Times:
- Standard shipping: 5-7 business days
- Express shipping: 2-3 business days
- Overnight shipping: Next business day
    `.trim(),
        metadata: {
            type: 'handbook',
            version: '1.0',
            lastUpdated: '2024-01-15',
        },
    },
    {
        documentId: 'product-catalog-001',
        customerId: 'cust-123',
        content: `
Product Catalog - Electronics

Premium Wireless Headphones (SKU: WH-1000)
Price: $299.99
Features:
- Active noise cancellation
- 30-hour battery life
- Bluetooth 5.0 connectivity
- Premium sound quality
- Foldable design with carrying case

Smart Watch Pro (SKU: SW-2000)
Price: $399.99
Features:
- Heart rate monitoring
- GPS tracking
- Water resistant up to 50m
- 5-day battery life
- Compatible with iOS and Android

4K Webcam (SKU: WC-3000)
Price: $149.99
Features:
- 4K video at 30fps
- Auto-focus
- Built-in microphone
- USB-C connectivity
- Works with all major video conferencing platforms
    `.trim(),
        metadata: {
            type: 'catalog',
            category: 'electronics',
            year: '2024',
        },
    },
    {
        documentId: 'faq-general-001',
        content: `
Frequently Asked Questions

Q: How do I track my order?
A: You can track your order by logging into your account and viewing the order history. 
A tracking number will be emailed to you once your order ships.

Q: What payment methods do you accept?
A: We accept all major credit cards (Visa, MasterCard, American Express, Discover), 
PayPal, Apple Pay, and Google Pay.

Q: Do you ship internationally?
A: Yes, we ship to most countries worldwide. International shipping rates vary by 
destination and will be calculated at checkout.

Q: How do I cancel my order?
A: Orders can be cancelled within 1 hour of placement by contacting customer service. 
After that, the order may have already been processed for shipping.

Q: What if I receive a damaged item?
A: Please contact customer service immediately with photos of the damage. 
We will arrange for a replacement or full refund, including return shipping costs.
    `.trim(),
        metadata: {
            type: 'faq',
            category: 'general',
        },
    },
    {
        documentId: 'account-info-001',
        customerId: 'cust-456',
        content: `
Account Information for Enterprise Customer

Company Name: Acme Corporation
Account ID: cust-456
Account Manager: Jane Smith (jane.smith@example.com)

Subscription Details:
- Plan: Enterprise Premium
- Users: 500
- Monthly Cost: $5,000
- Renewal Date: March 1, 2024

Support Level:
- Priority support with 1-hour response time
- Dedicated account manager
- Quarterly business reviews
- Custom integration support

Billing Contact:
- Name: John Doe
- Email: billing@acme.com
- Phone: 555-0199
    `.trim(),
        metadata: {
            type: 'account',
            tier: 'enterprise',
        },
    },
];
async function loadSampleData() {
    logger.info('Loading sample data...');
    try {
        for (const doc of sampleDocuments) {
            logger.info({ documentId: doc.documentId }, 'Ingesting document');
            const result = await ingestionService.ingestDocument(doc);
            logger.info({
                documentId: doc.documentId,
                chunksCreated: result.chunksCreated,
                success: result.success,
            }, 'Document ingested');
        }
        logger.info('Sample data loaded successfully');
    }
    catch (error) {
        logger.error({ error }, 'Failed to load sample data');
        throw error;
    }
}
loadSampleData()
    .then(() => {
    logger.info('Done');
    process.exit(0);
})
    .catch((error) => {
    logger.error({ error }, 'Script failed');
    process.exit(1);
});
//# sourceMappingURL=load-sample-data.js.map