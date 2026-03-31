import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './BillingPage.css';

const BillingPage = () => {
  const navigate = useNavigate();
  
  // POS State
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [searchProduct, setSearchProduct] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('INV-001');
  const [paymentMethod, setPaymentMethod] = useState('UPI');

  // Products Catalog (from inventory)
  const products = [
    { id: 1, name: 'Shirt', hsn: '6109', price: 299, gst: 5, stock: 12 },
    { id: 2, name: 'Jeans', hsn: '6203', price: 799, gst: 12, stock: 8 },
    { id: 3, name: 'Laptop', hsn: '8471', price: 45999, gst: 18, stock: 5 },
    { id: 4, name: 'Mouse', hsn: '8471', price: 499, gst: 18, stock: 25 },
  ];

  // Filtered products
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase())
  );

  // Cart totals
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const gstAmount = cart.reduce((sum, item) => sum + (item.price * item.qty * item.gst / 100), 0);
  const grandTotal = subtotal + gstAmount;

  // Add to cart
  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.id === product.id 
          ? { ...item, qty: item.qty + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  // Update quantity
  const updateQty = (id, qty) => {
    if (qty <= 0) {
      removeFromCart(id);
      return;
    }
    setCart(cart.map(item => item.id === id ? { ...item, qty } : item));
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  // Generate invoice
  const generateInvoice = () => {
    const invoice = {
      no: invoiceNo,
      date: new Date().toISOString().split('T')[0],
      customer,
      items: cart,
      subtotal,
      gst: gstAmount,
      total: grandTotal,
      payment: paymentMethod
    };
    console.log('Invoice:', invoice); // Replace with PDF/print
    alert(`✅ Invoice ${invoiceNo} generated!\nTotal: ₹${grandTotal.toLocaleString()}\nDownload/print ready`);
    
    // Reset for next customer
    setCart([]);
    setCustomer({ name: '', phone: '', email: '' });
    setInvoiceNo(`INV-${(parseInt(invoiceNo.split('-')[1]) + 1).toString().padStart(3, '0')}`);
  };

  return (
    <div className="billing-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
        <div>
          <h1>POS Billing</h1>
          <p>Invoice #{invoiceNo} | Cart: {cart.length} items</p>
        </div>
      </header>

      <div className="billing-layout">
        {/* Left: Customer + Product Search */}
        <div className="billing-left">
          <div className="customer-section">
            <h3>Customer Details</h3>
            <input 
              placeholder="Customer Name" 
              value={customer.name}
              onChange={e => setCustomer({...customer, name: e.target.value})}
            />
            <input 
              placeholder="Phone" 
              value={customer.phone}
              onChange={e => setCustomer({...customer, phone: e.target.value})}
            />
          </div>

          <div className="products-section">
            <h3>Products ({filteredProducts.length})</h3>
            <input 
              className="search-input"
              placeholder="🔍 Search products or scan barcode..."
              value={searchProduct}
              onChange={e => setSearchProduct(e.target.value)}
            />
            <div className="products-grid">
              {filteredProducts.map(product => (
                <div key={product.id} className="product-card" onClick={() => addToCart(product)}>
                  <div className="product-info">
                    <h4>{product.name}</h4>
                    <p>₹{product.price} + {product.gst}% GST</p>
                    <small>HSN: {product.hsn} | Stock: {product.stock}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Cart + Payment */}
        <div className="billing-right">
          <div className="cart-section">
            <h3>Cart ({cart.reduce((sum, i) => sum + i.qty, 0)} items)</h3>
            <div className="cart-items">
              {cart.map(item => (
                <div key={item.id} className="cart-item">
                  <div>
                    <h4>{item.name}</h4>
                    <p>₹{item.price} x {item.qty} = ₹{(item.price * item.qty).toLocaleString()}</p>
                  </div>
                  <div className="qty-controls">
                    <button onClick={() => updateQty(item.id, item.qty - 1)}>-</button>
                    <span>{item.qty}</span>
                    <button onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                    <button className="remove" onClick={() => removeFromCart(item.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="totals">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>₹{subtotal.toLocaleString()}</span>
              </div>
              <div className="total-row">
                <span>GST ({cart.reduce((sum, i) => i.gst, 0)}%):</span>
                <span>₹{gstAmount.toLocaleString()}</span>
              </div>
              <div className="grand-total">
                <span>Grand Total:</span>
                <span>₹{grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <div className="payment-section">
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option>UPI</option>
                <option>Card</option>
                <option>Cash</option>
                <option>Wallet</option>
              </select>
              <button className="pay-btn primary" onClick={generateInvoice}>
                💳 Pay ₹{grandTotal.toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;