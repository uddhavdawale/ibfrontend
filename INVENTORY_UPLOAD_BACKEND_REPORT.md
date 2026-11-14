# Inventory and Billing Backend Contract

## Goal
Support bulk inventory upload using the item-based CSV/Excel format and expose product catalog data with MRP values to the billing page.

## Frontend modules involved
- `src/modules/inventoryUpload/InventoryUploadDialog.jsx`
- `src/modules/inventoryUpload/inventoryUploadService.js`
- `src/Billing/BillingPage.jsx`

---

## 1. Bulk inventory upload contract

### Endpoint
POST `/api/inventory/upload`

### Headers
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

### Multipart payload
- `file`: CSV/XLS/XLSX file
- `source`: `inventory-upload`
- `records`: JSON array of normalized records (helper payload included by the frontend)
- `tenantId` and `userId`: optional if derived and validated server-side

### Example request
```bash
curl -X POST "http://localhost:8080/api/inventory/upload" \
  -H "Authorization: Bearer <token>" \
  -F "file=@inventory.xlsx" \
  -F "source=inventory-upload" \
  -F 'records=[{"product":"Rice","sku":"1001","qty":20,"minStock":5,"price":250,"category":"Groceries","set":1,"poNumber":"PO-1001","hsnSac":"1001","mrp":250,"pricePerQty":250}]'
```

### Accepted file columns
The frontend expects the following exact columns:

- Item
- HSN/SAC
- MRP/ Item
- QTY
- Set
- Price/QTY
- PO Number
- Min Stock
- Category

### Example CSV
```csv
Item,HSN/SAC,MRP/ Item,QTY,Set,Price/QTY,PO Number,Min Stock,Category
Rice,1001,250,20,1,250,PO-1001,5,Groceries
Wheat,1002,180,35,1,180,PO-1002,10,Groceries
Soap,1003,80,50,1,80,PO-1003,15,Personal Care
```

### Normalized row schema
The frontend normalizes each CSV row into:

```json
{
  "product": "Rice",
  "sku": "1001",
  "qty": 20,
  "minStock": 5,
  "price": 250,
  "category": "Groceries",
  "set": 1,
  "poNumber": "PO-1001",
  "hsnSac": "1001",
  "mrp": 250,
  "pricePerQty": 250
}
```

### Required backend validation rules
- Item must be present.
- HSN/SAC must be present.
- QTY must be a valid non-negative number.
- Min Stock must be a valid non-negative number.
- MRP/ Item must be a valid positive number.
- Price/QTY must be a valid positive number if provided.
- Category is optional; default to `General` if empty.
- PO Number is optional but should be persisted if present.
- Set is optional; default to `1` if missing.
- SKU/HSN/SAC should be unique per current inventory scope when applicable.

### Success response
Status: `200 OK` or `201 Created`

```json
{
  "success": true,
  "message": "Inventory uploaded successfully",
  "created": 25,
  "updated": 3,
  "skipped": 0,
  "records": [
    {
      "id": 101,
      "product": "Rice",
      "sku": "1001",
      "qty": 20,
      "minStock": 5,
      "price": 250,
      "category": "Groceries",
      "set": 1,
      "poNumber": "PO-1001",
      "hsnSac": "1001",
      "mrp": 250,
      "pricePerQty": 250
    }
  ]
}
```

### Error response
Status: `400 Bad Request` or `422 Unprocessable Entity`

```json
{
  "success": false,
  "message": "Missing required columns: Item, HSN/SAC, MRP/ Item, QTY, Set, Price/QTY, PO Number, Min Stock, Category",
  "errors": [
    "Column Item is required",
    "Column HSN/SAC is required",
    "SKU/HSN 1001 already exists"
  ]
}
```

---

## 2. Product catalog contract for billing

### Endpoint
GET `/api/products?size=1000`

### Expected backend response
The frontend accepts either:
- `data.content` as a paginated array
- or `data` as a direct array

### Required product fields
Each product item should include at least:

```json
{
  "id": 101,
  "name": "Rice",
  "sku": "RICE-001",
  "price": 250,
  "mrp": 280,
  "hsn": "1001",
  "quantity": 120,
  "salesCount": 48,
  "category": "Groceries"
}
```

### Frontend field mapping used by the billing page
The billing page reads product values with these fallbacks:

- selling price: `price`, `sellingPrice`, `salePrice`, `unitPrice`
- MRP: `mrp`, `mrpAmount`, `maximumRetailPrice`, `maxRetailPrice`
- stock: `quantity`, `stock`, `ItemQty`, `qty`
- name: `name`, `itemName`, `productName`
- HSN: `hsn`, `hsnCode`
- sku/code: `sku`, `code`
- sales count: `salesCount`, `soldQty`, `purchaseCount`, `popularity`

### Billing behavior requirement
The backend must support returning MRP so the catalog can display both:
- sale price / billing rate
- MRP / list price

The frontend renders the MRP in the product card as a secondary field and keeps the sale price as the actual billing amount.

---

## 3. Implementation checklist for backend team
1. Update the CSV import validator to accept the new item headers.
2. Persist all fields from the imported row, especially: `item`, `hsnSac`, `mrp`, `set`, `poNumber`, `minStock`, and `category`.
3. Keep `minStock` in the inventory model and return it in product read responses when applicable.
4. Expose `mrp` on each product in `/api/products` so the billing catalog can display it.
5. Ensure `quantity`/stock is returned to billing for stock validation before adding to cart.
6. Keep the API response values numerically typed (`BigDecimal`/`double`/`decimal`) to avoid client-side conversion issues.
7. Validate tenant/user ownership for inventory and product records if multi-tenant support is enabled.

---

## 4. Important note
The frontend is already aligned to this import schema and billing response contract. Any backend implementation should match these field names closely; otherwise the import parser will reject the file and the billing page will not show MRP correctly.
