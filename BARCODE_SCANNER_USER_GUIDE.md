# Barcode Scanner User Guide

## What you need

- A USB or Bluetooth barcode scanner that works as a keyboard (also called HID or keyboard-wedge mode).
- The product must already exist in your store's product catalogue with its barcode or product code recorded.
- The scanner must send **Enter** after each scan. If it does not, configure its suffix to Enter/Return.

The billing page does not use the camera and does not create or assign product barcodes. If a product has no barcode/code in the catalogue, ask your administrator or support team to update the product data.

## Scan products during billing

1. Sign in and open **POS Billing**.
2. Click the **Search products or scan barcode** box.
3. Scan the product. The scanner types its code into the box and sends Enter.
4. The matching product is added to the cart. Scan it again to add another unit.
5. Review the cart, quantities, and stock, then continue with the normal billing process.

Scans are matched to products in the signed-in store's catalogue. If a product is not in the initially loaded list, billing searches the catalogue before adding it. A scan that is still being looked up is queued.

## Check the connection and test a scan

The app does not show a permanent **Connected** indicator. In keyboard/HID mode, the scanner sends keystrokes to whichever field is focused. Use the billing page's test mode to safely check it without adding test items to a bill.

1. Open **POS Billing** and click **Test scanner**. The search box is focused and the page confirms that test mode is on.
2. Scan a known, in-stock product.
3. Read the message below the search box:
   - If the product is found, the scanner sent its code and the code matched. The cart is not changed.
   - If the code was received but no product was found, the scanner is communicating with the app; check the product code in the catalogue.
   - If the lookup fails, check the internet connection.
4. Click **Stop scanner test** before starting a real bill. Scans in test mode do not add items to the cart.

If no message appears after a scan, make sure test mode is on, the search box is focused, and the scanner sends Enter. You can also scan into a plain-text editor to check whether the computer receives the scanner's keystrokes.

## Search without a scanner

- Type a product name and click its product card to add it.
- To add by code, type the complete barcode or product code and press Enter.

Pressing Enter after typing a product name does not add that product; choose its product card instead.

## If a scan does not add a product

- **Nothing appears in the search box:** Click the search box and scan again.
- **The code appears, but no product is added:** Confirm the code is saved in the product catalogue and that the scanner sends Enter.
- **More than one product uses the code:** The code must be made unique before it can be used for billing.
- **The lookup fails:** Check the internet connection and scan again.
- **The product is out of stock:** Billing will prevent adding it; check the product's stock in inventory.
