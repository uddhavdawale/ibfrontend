# Spring Boot Inventory Upload Backend Report

## Overview
This report defines the backend contract for bulk inventory upload from a CSV or Excel file. It is designed for a Spring Boot application and matches the frontend contract already defined in the project.

The frontend expects a REST endpoint that accepts a multipart file and stores validated inventory rows into the database.

---

## API Contract

### Endpoint
POST /api/inventory/upload

### Content-Type
multipart/form-data

### Request Parameters
- file: MultipartFile (required)
- source: String (optional; frontend sends `inventory-upload`)
- records: String (optional; frontend may also send JSON rows as a convenience field)

### Example request
```bash
curl -X POST "http://localhost:8080/api/inventory/upload" \
  -H "Authorization: Bearer <token>" \
  -F "file=@inventory.xlsx" \
  -F "source=inventory-upload" \
  -F 'records=[{"product":"Rice","sku":"RICE-001","qty":20,"minStock":5,"price":250,"category":"Groceries"}]'
```

### Acceptable file formats
- CSV
- XLS
- XLSX

### Required columns in uploaded file
The upload parser should accept files containing these columns:
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

---

## Expected Row Schema
Each row should be normalized into this object before persistence:

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

---

## Validation Rules
The backend must validate every row before saving:

- `product` is required and cannot be blank
- `sku` is required and must be unique
- `qty` must be a non-negative number
- `minStock` must be a non-negative number
- `price` must be a positive number
- `category` is optional; default to `General` if missing
- Duplicate rows in the same uploaded file should be handled by upsert or skipped based on business rule
- Reject the entire upload if required headers are missing

### Required header mapping
The Excel/CSV parser should normalize headers like these:
- Product / product / Name / name
- SKU / sku / Product SKU
- Qty / qty / Quantity
- Min Stock / minStock / MinStock
- Price / price / Unit Price
- Category / category / Categories

---

## Success Response
Status: 200 OK or 201 Created

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

---

## Error Response
Status: 400 Bad Request or 422 Unprocessable Entity

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

---

## Suggested Spring Boot Structure

### 1. Controller
```java
@RestController
@RequestMapping("/api/inventory")
public class InventoryController {

    private final InventoryUploadService inventoryUploadService;

    public InventoryController(InventoryUploadService inventoryUploadService) {
        this.inventoryUploadService = inventoryUploadService;
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadInventory(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "source", required = false) String source,
            @RequestParam(value = "records", required = false) String recordsJson) {

        try {
            InventoryUploadResult result = inventoryUploadService.processUpload(file, source, recordsJson);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Inventory uploaded successfully",
                "created", result.getCreatedCount(),
                "updated", result.getUpdatedCount(),
                "skipped", result.getSkippedCount(),
                "records", result.getRecords()
            ));
        } catch (ValidationException ex) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "message", ex.getMessage(),
                "errors", ex.getErrors()
            ));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "success", false,
                "message", "Inventory upload failed",
                "error", ex.getMessage()
            ));
        }
    }
}
```

### 2. Service
```java
@Service
public class InventoryUploadService {

    private final InventoryRepository inventoryRepository;

    public InventoryUploadResult processUpload(MultipartFile file, String source, String recordsJson) {
        if (file == null || file.isEmpty()) {
            throw new ValidationException("No file uploaded");
        }

        List<InventoryUploadRow> rows = parseFile(file);
        validateRows(rows);

        int created = 0;
        int updated = 0;
        int skipped = 0;
        List<Map<String, Object>> savedRecords = new ArrayList<>();

        for (InventoryUploadRow row : rows) {
            Optional<Inventory> existing = inventoryRepository.findBySku(row.getSku());

            if (existing.isPresent()) {
                Inventory inventory = existing.get();
                inventory.setProduct(row.getProduct());
                inventory.setQty(row.getQty());
                inventory.setMinStock(row.getMinStock());
                inventory.setPrice(row.getPrice());
                inventory.setCategory(row.getCategory());
                inventoryRepository.save(inventory);
                updated++;
            } else {
                Inventory inventory = new Inventory();
                inventory.setProduct(row.getProduct());
                inventory.setSku(row.getSku());
                inventory.setQty(row.getQty());
                inventory.setMinStock(row.getMinStock());
                inventory.setPrice(row.getPrice());
                inventory.setCategory(row.getCategory());
                inventoryRepository.save(inventory);
                created++;
            }

            savedRecords.add(Map.of(
                "product", row.getProduct(),
                "sku", row.getSku(),
                "qty", row.getQty(),
                "minStock", row.getMinStock(),
                "price", row.getPrice(),
                "category", row.getCategory()
            ));
        }

        return new InventoryUploadResult(created, updated, skipped, savedRecords);
    }
}
```

### 3. DTO / Row model
```java
public class InventoryUploadRow {
    private String product;
    private String sku;
    private Integer qty;
    private Integer minStock;
    private BigDecimal price;
    private String category;

    // getters and setters
}
```

### 4. Entity
```java
@Entity
@Table(name = "inventory")
public class Inventory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String product;

    @Column(nullable = false, unique = true)
    private String sku;

    @Column(nullable = false)
    private Integer qty;

    @Column(nullable = false)
    private Integer minStock;

    @Column(nullable = false)
    private BigDecimal price;

    @Column(nullable = false)
    private String category = "General";

    // getters and setters
}
```

### 5. Repository
```java
public interface InventoryRepository extends JpaRepository<Inventory, Long> {
    Optional<Inventory> findBySku(String sku);
    boolean existsBySku(String sku);
}
```

---

## File Parsing Strategy
Use Apache POI for Excel import and a CSV parser for CSV files.

### Maven dependencies
```xml
<dependency>
  <groupId>org.apache.poi</groupId>
  <artifactId>poi-ooxml</artifactId>
  <version>5.2.5</version>
</dependency>

<dependency>
  <groupId>com.opencsv</groupId>
  <artifactId>opencsv</artifactId>
  <version>5.9</version>
</dependency>
```

### Parser approach
- For .xlsx / .xls: use `WorkbookFactory.create(file.getInputStream())`
- For .csv: use `CSVReader` and map header names to model fields
- Normalize headers to lowercase and remove non-alphanumeric characters before matching

### Example parser outline
```java
public List<InventoryUploadRow> parseFile(MultipartFile file) {
    String originalName = file.getOriginalFilename();
    String ext = StringUtils.getFilenameExtension(originalName);

    if (ext == null) {
        throw new ValidationException("Unsupported file type");
    }

    switch (ext.toLowerCase()) {
        case "csv":
            return parseCsv(file);
        case "xls":
        case "xlsx":
            return parseExcel(file);
        default:
            throw new ValidationException("Only CSV, XLS, and XLSX files are supported");
    }
}
```

---

## Validation and Error Handling
Recommended validation flow:

1. Check file exists and type is allowed
2. Parse rows from file
3. Ensure required columns are present
4. Normalize and trim all values
5. Validate each row
6. Reject the entire request if critical validation fails
7. Save in a transaction

### Recommended custom exception
```java
public class ValidationException extends RuntimeException {
    private final List<String> errors;

    public ValidationException(String message) {
        super(message);
        this.errors = List.of(message);
    }

    public ValidationException(String message, List<String> errors) {
        super(message);
        this.errors = errors;
    }

    public List<String> getErrors() {
        return errors;
    }
}
```

---

## Database Transaction Guidance
The import should be wrapped in a single transaction for consistency.

```java
@Transactional
public InventoryUploadResult processUpload(MultipartFile file, String source, String recordsJson) {
    List<InventoryUploadRow> rows = parseFile(file);
    validateRows(rows);
    // save rows here
    return new InventoryUploadResult(...);
}
```

This ensures:
- no partial inventory import if a row fails validation
- integrity of SKU uniqueness
- predictable behavior during bulk operations

---

## Optional Helper Endpoint
### GET /api/inventory/upload-template
Returns a CSV template file for bulk upload.

Example response: downloadable `inventory-upload-template.csv`

```csv
Product,SKU,Qty,Min Stock,Price,Category
Rice,RICE-001,20,5,250,Groceries
```

---

## Notes for the Backend Agent
- The frontend already sends `MultipartFile` and optional `records` JSON.
- Keep the import logic isolated in a dedicated service and controller rather than embedding it in existing product CRUD code.
- Use transaction-based bulk save for clean rollback.
- If the project already has an inventory entity, reuse it rather than creating a separate upload table unless a staging table is required.
- Reject invalid rows with explanatory errors and return a clean JSON payload.

---

## Final Implementation Recommendation
Create the feature as a dedicated module with:
- `InventoryController`
- `InventoryUploadService`
- `InventoryRepository`
- `InventoryUploadRow` DTO
- custom validation logic
- Excel/CSV parsing utilities

This keeps the feature easy to maintain and aligned with the frontend module structure.
