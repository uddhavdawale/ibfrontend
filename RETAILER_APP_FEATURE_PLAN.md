# Retailer App Feature and Implementation Plan

## Implementation Status

The following cost-friendly WhatsApp workflows are implemented in the current frontend:

- Invoice sharing from billing and sell-order detail screens
- Prefilled customer payment reminders
- Optional browser notification for a daily customer due-payment queue
- Daily sales-summary sharing to the configured shop owner phone
- A WhatsApp order dialog that validates customer details and saves recent order drafts locally
- WhatsApp requests converted into billing drafts with automatic product-name matching
- Repeat-order actions that restore the previous customer and item quantities in billing

Automatic sending is not performed silently: WhatsApp messages open for staff review, preserving consent and avoiding paid WhatsApp API charges. Reliable cloud delivery, when required, should be added later through the backend as an opt-in, tenant-authorized workflow.

## Purpose

This plan describes the features currently available in the application and prioritizes additional capabilities that provide immediate operational value to retailers. It also documents realistic examples of how each feature would be used during an ordinary working day.

## 1. Features Already Available

### Dashboard

- Today's sales summary
- Pending-payment summary
- Low-stock alerts
- Today's order count
- Light, dark, and aurora themes
- Role-based navigation
- Quick access for customer, inventory, dealer, and helper actions

**Real-time use:** A shop owner opens the dashboard at 9:00 AM and immediately identifies pending customer payments, low-stock products, and today's sales.

### Billing

- GST and Non-GST bills
- Product search and catalog sorting
- MRP, HSN, quantity, and GST calculations
- UPI, card, cash, and wallet payment methods
- Paid, pending, and partial payment states
- Optional payment screenshot
- Walk-in and named customers
- PDF invoice generation
- Invoice sharing through WhatsApp or email

**Real-time use:** At the counter, staff add products, select the payment method, record a partial payment if needed, and send the PDF invoice to the customer through WhatsApp.

### Inventory

- Add, edit, and delete products
- MRP, selling price, quantity, SKU/HSN, and minimum-stock fields
- Low-stock identification
- Inventory search
- Bulk inventory upload
- CSV and Excel export
- Stock count and estimated inventory value

**Real-time use:** Before opening the store, the retailer reviews products nearing minimum stock and prepares a purchase list. The team also bulk-uploads a supplier catalog.

### Customer and Ledger Management

- Customer list and search
- Customer profile details
- Customer ledger navigation
- Due-balance information
- Pending-payment lookup

**Real-time use:** Before accepting another credit purchase, staff search for the customer's outstanding balance and decide whether the account is within the approved limit.

### Sell Orders

- Order list and status management
- Payment report access
- Quick creation of a new order through billing

**Real-time use:** Staff receive a phone or store order, create the order, collect payment, and generate a bill without restarting the workflow.

### Payment Collection

- Payment collection interface
- Paid, pending, and partial statuses
- Payment reports

**Real-time use:** A collection employee visits customers, records a received amount, and updates the invoice or customer ledger immediately.

### GST

- GST filing dashboard
- GST and Non-GST bill selection
- HSN and GST calculations

**Real-time use:** At month-end, the owner compares GST bill data while preparing filing and reconciliation.

### Audit and Administration

- Audit page
- Platform-admin dashboard
- Retailer approvals and reports
- Store user management
- User and role creation
- Role-based feature access
- MFA and password recovery

**Real-time use:** The owner creates a billing-only account for a cashier while retaining inventory and audit access for senior staff.

## 2. High-Priority Features

### 2.1 WhatsApp Payment and Invoice Automation

- Automatically send invoices after payment or partial payment
- Send an itemized outstanding-balance reminder
- Schedule daily sales summaries
- Send low-stock alerts to the owner
- Include a secure payment or due-payment link

**Real-time use:** When an invoice is marked paid, WhatsApp automatically sends the invoice and payment confirmation. The next morning, the app sends a consolidated sales report to the owner.

**Priority:** Immediate

**Suggested first release:** Manual WhatsApp sharing, then delivery receipts and scheduled reminders.

### 2.2 Customer Credit and Udhaar Management

- Customer credit limit
- Bill-by-bill due balance
- Due dates and overdue age
- Partial-payment allocation
- Credit/debit ledger export
- Credit stop or approval workflow
- WhatsApp due reminders

**Real-time use:** A customer purchases merchandise for ₹8,000 and pays ₹5,000. The app keeps ₹3,000 due against the customer and automatically includes it in future ledger summaries.

**Priority:** Immediate

**Suggested first release:** Complete invoice balance tracking, credit limits, overdue status, and reminder actions.

### 2.3 Offline Billing and Synchronization

- Continue billing without internet
- Local invoice numbering
- Store draft and completed invoices locally
- Retry and reconcile with the server
- Clearly show unsynced transaction counts
- Prevent duplicate invoices during synchronization

**Real-time use:** Broadband becomes unavailable during a busy evening. Staff continue creating bills, and the app synchronizes them after the connection returns.

**Priority:** Immediate

**Suggested first release:** Offline invoice drafts and a synchronization queue; add stock and customer updates after stable testing.

### 2.4 Barcode and QR Product Scanning

- Camera and USB barcode scanning
- Barcode/SKU association
- Fast cart addition
- Inventory lookup
- Print or generate product labels
- Detect duplicate or unknown codes

**Real-time use:** A cashier scans a product instead of searching. The stock and GST configuration load instantly and the item is added to the bill.

**Priority:** High

### 2.5 Smart Inventory and Purchasing

- Supplier and purchase-order management
- Automatic reorder quantities
- Supplier pending payments
- Purchase GST and invoice entry
- Stock transfer between stores
- Fast-moving and dead-stock reports
- Batch and expiry tracking

**Real-time use:** The app predicts that 30 units of a fast-moving item are required for the next week, shows the preferred supplier, and creates a purchase draft.

**Priority:** High

### 2.6 Profit and Margin Analytics

- Gross profit and net profit
- Product-level margin
- Category and brand performance
- Hourly, daily, weekly, and monthly trends
- Sales comparison periods
- Staff sales performance
- Discount and return impact
- Best-selling and low-margin products

**Real-time use:** The owner discovers that high sales in one category have the lowest margin and adjusts product pricing or promotion strategy.

**Priority:** High

### 2.7 Expense and Supplier Accounting

- Expense categories
- Daily petty cash
- Supplier invoices
- Supplier advances and balances
- Recurring expenses
- Purchase versus sales analysis
- Supplier payment reminders

**Real-time use:** The owner records rent, delivery charges, and electricity payments from one screen and compares them against gross sales.

**Priority:** Medium to high

### 2.8 Returns, Replacements, and Cancellations

- Full or partial invoice returns
- Restocking with stock adjustment
- Replacement tracking
- Refund and credit-note records
- Cancellation approval
- Reason and staff attribution

**Real-time use:** A customer returns one damaged item. Staff select it from the original invoice, record the reason, update stock, and create the correct refund or credit.

**Priority:** High

### 2.9 Customer Loyalty and Promotions

- Loyalty points
- Membership tiers
- Coupon codes
- Birthday and festival campaigns
- Store credits
- Repeat-purchase offers
- Customer purchase history

**Real-time use:** At checkout, the app applies an eligible loyalty coupon and announces earned points before the customer leaves.

**Priority:** Medium

### 2.10 Digital Store Operations

- Staff attendance and shifts
- Staff sales targets
- Cash opening and closing
- Shift handover and cash variance
- Store-specific stock and reports
- Multi-store user access
- Inter-store transfers

**Real-time use:** Every shift starts with a recorded cash opening. At closing, the app compares collected payments with the entered cash and shows variances.

**Priority:** Medium

### 2.11 Audit and Security Enhancements

- Complete change history
- Invoice and payment cancellation approval
- Price-change approval
- Stock adjustment reasons
- Suspicious activity alerts
- Scheduled backup
- Data export

**Real-time use:** An unusually large discount or stock adjustment triggers approval and records the user, reason, device, and time.

**Priority:** High

### 2.12 Local Language and Accessibility

- Marathi, Hindi, and English interface options
- Local-language invoices
- Voice or image product search
- Large-text and keyboard-friendly controls
- Simple read-only role views

**Real-time use:** A Marathi-speaking owner changes the interface language and generates an invoice while staff continue using English or another available language.

**Priority:** High for regional adoption

## 3. Recommended Implementation Roadmap

### Phase 1: Stabilize Daily Retail Workflows

1. Offline billing and synchronization
2. WhatsApp invoice and due reminders
3. Customer credit limits and ledger
4. Returns, replacements, and credit notes
5. Invoice and stock audit improvements

**Target outcome:** The app becomes reliable for daily opening-to-closing operations, including internet interruptions.

### Phase 2: Improve Inventory and Purchasing

1. Barcode/QR scanning
2. Supplier purchase records
3. Purchase orders
4. Reorder recommendations
5. Batch and expiry support
6. Inter-store stock transfer

**Target outcome:** Retailers can maintain correct stock while reducing overstock and emergency purchasing.

### Phase 3: Strengthen Financial Insights

1. Product and category profit reports
2. Expense tracking
3. Supplier accounting
4. Cash shift reconciliation
5. Sales target and staff performance reports

**Target outcome:** Owners move from viewing sales totals to making pricing, purchasing, and staffing decisions.

### Phase 4: Grow Customer Retention

1. Loyalty points
2. Promotions and coupons
3. Repeat-customer reminders
4. Festival and birthday campaigns
5. WhatsApp product catalog

**Target outcome:** The app helps retailers retain existing buyers and increase repeat sales.

### Phase 5: Add Intelligent Assistance

1. Demand forecasting
2. Recommended reorder quantities
3. Fraud and anomaly detection
4. Product bundling suggestions
5. Pricing recommendations

**Target outcome:** The system provides practical recommendations using accumulated sales and inventory history.

## 4. Features to Launch First

The first five feature additions should be:

1. Offline billing
2. Customer credit and WhatsApp due reminders
3. Barcode/QR scanning
4. Purchase and supplier management
5. Profit, margin, and sales reports

These additions use the existing billing, inventory, customer, payment, role, and invoice foundations already in the application.

## 5. Real-Time Retail Use Cases

| Retailer's action | Current or planned app behavior | Business benefit |
|---|---|---|
| Opens shop | Dashboard shows today's sales, pending dues, and low stock | Faster daily planning |
| Adds a customer | Invoice and ledger record customer information | Repeat customers and accurate credit tracking |
| Handles credit purchase | App records partial or full dues | Fewer lost balances |
| Gives customer a bill | PDF invoice is generated and shared on WhatsApp | Less paperwork and faster communication |
| Internet disconnects | Billing continues locally and syncs later | No lost sales |
| Receives stock | Inventory quantity and purchase cost are updated | Accurate stock and GST records |
| Scans a product | The item is added to the bill instantly | Faster checkout and fewer entry errors |
| Customer returns an item | Return, refund, and stock adjustment are linked to the invoice | Accurate audit trail |
| Ends the shift | Staff records cash closing and expected versus actual cash | Detects shortages promptly |
| Month-end arrives | GST, sales, profit, expense, and purchase reports are available | Faster reconciliation and filing |

## 6. Suggested Success Measures

- Billing time per transaction
- Number of synchronization failures
- Percentage of dues collected through reminders
- Low-stock purchases avoided through reorder alerts
- Stock discrepancy between billing and physical inventory
- Repeat-customer growth
- Gross and net profit accuracy
- Invoice sharing completion rate
- Staff billing and collection errors
- Average collection delay for credit customers

## 7. Implementation Principles

- Preserve role-based access for billing, inventory, and administration
- Keep invoice and payment updates idempotent
- Link every stock change to a source transaction
- Never lose unsynced invoices or payments
- Add reason and attribution to refunds, cancellations, and stock adjustments
- Keep mobile and low-bandwidth use in mind
- Validate tenant/shop ownership on every backend request
- Test partial payment and return workflows before introducing loyalty or forecasting features
