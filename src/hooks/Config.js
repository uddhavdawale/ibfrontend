// src/config.js
export const shopConfig = {
  shop: {
    name: "IB ENTERPRISES",
    gstin: "27ABCDE1234F1Z5",
    address: "Aurangabad, Maharashtra 431001",
    phone: "+91 98765 43210",
    email: "sales@ibenterprises.com",
    // Optional: default invoice settings
    defaultDueDays: 7,
    defaultPlaceOfSupply: "Maharashtra",
    defaultTerms:
      "Payment due within {dueInDays} days. Late payments may attract interest as per government guidelines.",
    defaultNotes:
      "Original invoice. Please keep for GST purposes.",
  },
};