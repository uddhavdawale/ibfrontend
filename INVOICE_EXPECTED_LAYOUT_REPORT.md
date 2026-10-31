# Expected Invoice PDF Layout Report

## Goal
The exported invoice PDF must match the expected customer-facing invoice format used by the sell screen and the reference layout shown in the design review.

## Expected invoice appearance
The generated PDF should look like a polished retail invoice, not a generic or internal-heavy document.

### Layout structure
1. Top header band
   - Dark navy background
   - Brand name: `IB ENTERPRISES`
   - Small invoice label: `TAX INVOICE`

2. Company metadata row
   - GSTIN on the left
   - Location on the right
   - Keep the spacing clean and minimal

3. Invoice meta row
   - Invoice No. on the left
   - Date on the right
   - Tight, balanced layout

4. Bill-to panel
   - Customer name
   - Phone number
   - Payment method
   - Status shown as a compact pill

5. Product table
   - Columns: `#`, `Item`, `HSN`, `Qty`, `Rate`, `Amount`, `GST`, `Total`
   - Header with a teal/green fill
   - Clean grid lines and simple rows

6. Totals summary box
   - Positioned on the right side of the page
   - Contains subtotal, GST, and total
   - Well aligned and easy to read

## Expected final behavior
- The downloaded PDF must match the sell-page invoice structure closely.
- No extra decorative sections or unnecessary layout blocks.
- The invoice must remain professional, compact, and customer-facing.
- The exported invoice should be printable and consistent across sales and billing flows.

## Current mismatch identified
The previous PDF version diverged from the expected layout in a few ways:
- spacing did not match the reference composition
- table structure was not aligned to the expected invoice style
- the totals block did not sit in the correct premium arrangement
- some metadata placement did not mirror the sell-page design

## Required fix
The PDF generation logic must be revised to mirror the expected form exactly:
- same header style
- same invoice metadata order
- same customer info layout
- same table structure and values
- same premium compact totals area

## Acceptance criteria
The invoice is accepted only when:
- the exported PDF visually matches the expected invoice structure
- the values are correct and consistent with the sell screen
- the invoice is clean, professional, and ready for end-user sharing or print
