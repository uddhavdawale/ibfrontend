# Shop Owner Subscription Features Report

## Executive summary

To make shop owners want to subscribe and continue using the platform, prioritize features that help them collect money faster, understand their actual profitability, and avoid stock-outs. The product already has foundations for billing, inventory, customer records and dues, dashboard reporting, GST, staff roles, and audit history. The strongest opportunity is to connect these workflows into clear, reliable outcomes for the owner.

Recommended first priorities:

1. Customer credit and payment follow-ups
2. Profit and cash-flow insights
3. Supplier and purchase-order workflows

Validate these priorities with shop owners before committing to a broad build or fixed subscription prices.

## Existing product foundations

The current frontend includes:

- Billing and invoice workflows in `src/Billing/BillingPage.jsx`
- Inventory management, low-stock thresholds, and import/export in `src/Inventory/Inventory.jsx`
- Dashboard metrics and low-stock and pending-payment cards in `src/Dashboard/DashboardEntry.jsx`
- Customer records and due-balance display in `src/Customers/CustomerPage.jsx`
- A GST dashboard in `src/GSTFiling/GSTDashboard.jsx`
- Staff roles, access controls, and audit features in the Security and Audit areas

These are useful foundations, but should not be marketed as complete paid capabilities until their end-to-end behavior, data accuracy, and backend support are verified. In particular, the GST dashboard currently indicates that it is under development.

## Feature opportunities

### 1. Customer credit and payment follow-ups

**Owner value:** Reduce forgotten dues and make it easier to collect money.

- Maintain a customer ledger with opening balance, invoices, payments, and remaining balance.
- Support full and partial payments with payment method and date.
- Show overdue balances and aging summaries.
- Prepare configurable WhatsApp/SMS payment reminders and track reminder status.
- Show customer purchase history and outstanding balance during checkout.

**MVP outcome:** The owner can quickly see who owes money, record a payment, and follow up on overdue balances.

### 2. Profit and cash-flow insights

**Owner value:** Understand whether the shop is making money, not only how much it sold.

- Show sales, cost of goods, gross profit, expenses, and estimated net profit.
- Break down margin by product, category, and date range.
- Summarize cash, UPI, card, and credit sales alongside collections and outstanding dues.
- Compare periods and highlight meaningful changes.
- Clearly label estimates and explain which data is missing when costs or expenses are incomplete.

**MVP outcome:** A daily and monthly owner summary with sales, estimated gross profit, collections, and dues.

### 3. Supplier and purchasing workflows

**Owner value:** Replenish stock in time and keep supplier costs organized.

- Store supplier contacts and product-specific supplier details.
- Create purchase orders from low-stock items.
- Record received quantities and supplier bills.
- Track purchase costs, supplier payment due dates, and purchase history.
- Show suggested reorder quantities based on recent sales and current stock.

**MVP outcome:** Convert selected low-stock products into a purchase order and update inventory when goods are received.

### 4. Faster checkout and payments

**Owner value:** Serve customers faster and reduce checkout errors.

- Support barcode scanning and a favorites/quick-add product list.
- Find repeat customers quickly and show relevant credit information.
- Generate UPI QR codes or payment links and record payment status.
- Make invoice printing/sharing and returns or corrections straightforward.

**MVP outcome:** Reduce time to complete a typical sale without compromising invoice accuracy.

### 5. Repeat-customer tools

**Owner value:** Encourage customers to return and make promotions easier.

- Provide customer purchase history and simple segmentation.
- Support opt-in reorder or offer reminders.
- Offer basic loyalty points or store credit with a clear transaction history.
- Create a shareable product catalogue and promotional messages.

**MVP outcome:** Let the shop owner identify repeat customers and share a small set of current offers.

### 6. Reliable GST workflow

**Owner value:** Reduce manual preparation and avoid preventable filing mistakes.

- Validate invoice and tax data before report generation.
- Provide period-based sales and tax summaries with traceable source invoices.
- Export accountant-friendly return data and flag missing or inconsistent fields.
- Clearly distinguish preparation support from actual filing; do not imply filing is complete unless an authorized integration confirms it.

**MVP outcome:** Produce a reliable, reconciled period export that an owner or accountant can review.

### 7. Multi-user and multi-branch controls

**Owner value:** Delegate daily tasks while maintaining visibility and control.

- Give staff role-based access to billing, inventory, and reports.
- Track sensitive actions such as discounts, voids, stock changes, and payment edits.
- Provide branch-wise sales and stock views with an owner-level summary.
- Make it easy to add, suspend, and review staff access.

**MVP outcome:** The owner can delegate routine operations and review important changes.

### 8. Backup, recovery, and support

**Owner value:** Trust the platform with important business records.

- Provide automatic backups and a documented restore process.
- Make data export and account portability easy to find.
- Explain sync status and surface backup or sync failures clearly.
- Provide onboarding guidance and accessible support for operational issues.

**MVP outcome:** Owners can confirm their data is current and understand how to recover or export it.

## Suggested rollout

### Phase 1: Prove immediate value

1. Improve customer balances, payment entry, and overdue visibility.
2. Add owner-focused sales, margin, collection, and dues summaries.
3. Pilot with a small group of shops and observe actual weekly use.

### Phase 2: Improve daily operations

1. Add supplier records and purchase orders.
2. Add checkout speed improvements such as barcode scanning and quick-add products.
3. Improve customer reorder and offer workflows, with consent and opt-out controls.

### Phase 3: Expand for growing businesses

1. Mature GST reconciliation and exports.
2. Add multi-branch reporting and stronger owner controls.
3. Strengthen backup, recovery, onboarding, and support workflows.

## Subscription packaging hypothesis

Use plans to communicate increasing business value; confirm the boundaries with customer research and cost analysis before setting prices.

| Plan concept | Suitable for | Potential included value |
|---|---|---|
| Starter | Single-shop owner | Billing, inventory, customer records, essential reports |
| Growth | Shop focused on collections and business insights | Customer ledger, payment follow-ups, profit summaries, supplier workflows |
| Business | Shops with staff or multiple locations | Additional staff, role controls, branch views, advanced reporting, priority support |

Avoid charging for basic data access, exports, or recovery in ways that make owners feel their business records are being held hostage. Paid tiers should charge for meaningful time savings, automation, scale, and support.

## Validation and success measures

Before broad rollout, interview shop owners across different shop types and test a working prototype. Ask what they currently do, how often the problem occurs, what it costs them, and whether they would pay for the proposed solution.

Track:

- Activation: shops that complete setup and create their first invoice or record a payment.
- Weekly active shops and usage of the prioritized paid features.
- Time to complete checkout and common workflows.
- Dues collected or overdue balances followed up, where reliably measurable.
- Inventory stock-out frequency and purchase-order usage.
- Trial-to-paid conversion, renewal, and cancellation reasons.
- Support requests, failed syncs, and data-recovery incidents.

Do not treat feature clicks alone as proof of value. Prefer outcomes such as faster checkout, payments recorded, fewer stock-outs, or continued paid use.

## Recommendation

Start with **customer credit and payment follow-ups**, **profit and cash-flow insights**, and **supplier purchasing workflows**. These extend existing platform foundations and address recurring owner concerns. Keep the first release focused, make financial calculations transparent, and use pilot feedback and retention data to determine what belongs in each subscription plan.
