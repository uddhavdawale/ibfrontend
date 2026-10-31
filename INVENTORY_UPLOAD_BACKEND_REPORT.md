# Inventory Upload Backend Contract

## Goal
Upload inventory records in bulk from a CSV or Excel file and persist them to the backend database.

## Frontend module
The frontend module is implemented in:
- `src/modules/inventoryUpload/InventoryUploadDialog.jsx`
- `src/modules/inventoryUpload/inventoryUploadService.js`

## API endpoint

### 1. Upload inventory file
POST `/api/inventory/upload`

Headers:
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

Request body:
- `file`: CSV/XLS/XLSX file
- `source`: `inventory-upload`
- `records`: JSON array of normalized row objects (optional helper field for convenience)

Example:
```bash
curl -X POST "http://localhost:8080/api/inventory/upload" \
  -H "Authorization: Bearer <token>" \
  -F "file=@inventory.xlsx" \
  -F "source=inventory-upload" \
  -F 'records=[{"product":"Rice","sku":"RICE-001","qty":20,"minStock":5,"price":250,"category":"Groceries"}]'
```

## Expected file format
The uploaded file must contain the following columns:
- Product
- SKU
- Qty
- Min Stock
- Price
- Category

Example CSV:
```csv
Product,SKU,Qty,Min Stock,Price,Category
Rice,RICE-001,20,5,250,Groceries
Wheat,WHEAT-002,35,10,180,Groceries
Soap,SOAP-003,50,15,80,Personal Care
```

## Row schema
Each parsed row should be normalized to:
```json
{
  "product": "Rice",
  "sku": "RICE-001",
  "qty": 20,
  "minStock": 5,
  "price": 250,
  "category": "Groceries"
}
```

## Backend validation rules
- Product must be present.
- SKU must be unique in the current inventory set.
- Qty must be a non-negative number.
- Min Stock must be a non-negative number.
- Price must be a valid positive number.
- Category is optional; default to `General` if missing.

## Success response
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
      "sku": "RICE-001",
      "qty": 20,
      "minStock": 5,
      "price": 250,
      "category": "Groceries"
    }
  ]
}
```

## Error response
Status: `400 Bad Request` or `422 Unprocessable Entity`

```json
{
  "success": false,
  "message": "Missing required columns: Product, SKU, Qty, Min Stock, Price",
  "errors": [
    "Column Product is required",
    "SKU RICE-001 already exists"
  ]
}
```

## Optional helper endpoint
GET `/api/inventory/upload-template`

Returns the CSV template for bulk inventory upload.

## Notes
- Prefer using a server-side import that validates rows and stores them in a transaction.
- The frontend should continue to use `apiFetch` and `API_ENDPOINTS.inventoryBulkUpload` for the actual backend call.
