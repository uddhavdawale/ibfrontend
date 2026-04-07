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
  const [editingPriceId, setEditingPriceId] = useState(null); // 👈 NEW: Editable price
  
  // 👈 DYNAMIC PRODUCTS FROM DB
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Fetch products from backend
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        //https://ibbackend-production.up.railway.app/api/signup
        const response = await fetch('https://ibbackend-production.up.railway.app/api/products?size=1000');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        // Convert price (BigDecimal → Number) + Add GST slab
        const productsWithGst = data.content.map(product => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: parseFloat(product.price),
          hsn: product.hsn || '9999',  // Default HSN
          gst: getGstSlab(product.price),  // Dynamic GST
          stock: product.quantity
        }));
        setProducts(productsWithGst);
      } catch (error) {
        console.error('Fetch products error:', error);
        // Fallback static data
        setProducts([
          { id: 1, name: 'Shirt', hsn: '6109', price: 299, gst: 5, stock: 12 },
          { id: 2, name: 'Jeans', hsn: '6203', price: 799, gst: 12, stock: 8 },
        ]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProducts();
  }, []);
  
  // 👈 INDIAN GST SLABS (Real-time)
  const getGstSlab = (price) => {
    if (price < 500) return 5;
    if (price < 1500) return 12;
    return 18;  // Default 18%
  };
  
  // Filtered products (search by name/SKU)
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchProduct.toLowerCase())
  );
  
  // Cart totals (Real GST)
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const gstAmount = cart.reduce((sum, item) => sum + (item.price * item.qty * item.gst / 100), 0);
  const grandTotal = subtotal + gstAmount;
  
  // 👈 NEW: Update price
  const updatePrice = (id, newPrice) => {
    setCart(cart.map(item => 
      item.id === id ? { ...item, price: parseFloat(newPrice) || item.price } : item
    ));
  };
  
  // Add to cart (check stock)
  const addToCart = (product) => {
    if (product.stock <= 0) {
      alert(`${product.name} - Out of stock!`);
      return;
    }
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.qty >= product.stock) {
        alert('Stock limit reached!');
        return;
      }
      setCart(cart.map(item => 
        item.id === product.id 
          ? { ...item, qty: item.qty + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };
  
  // Update quantity (stock check)
  const updateQty = (id, qty) => {
    if (qty <= 0) {
      removeFromCart(id);
      return;
    }
    setCart(cart.map(item => {
      if (item.id === id) {
        const productStock = products.find(p => p.id === id)?.stock;
        if (qty > (productStock || 0)) {
          alert('Stock exceeded!');
          return item;
        }
        return { ...item, qty };
      }
      return item;
    }));
  };
  
  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };
  
  // Generate invoice (save to DB later)
  const generateInvoice = () => {
    if (cart.length === 0) {
      alert('Add items to cart first!');
      return;
    }
    
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
    
    console.log('Invoice:', invoice);
    alert(`✅ Invoice ${invoiceNo} generated!\nTotal: ₹${grandTotal.toLocaleString()}`);
    
    // Reset
    setCart([]);
    setCustomer({ name: '', phone: '', email: '' });
    setInvoiceNo(`INV-${(parseInt(invoiceNo.split('-')[1]) + 1).toString().padStart(3, '0')}`);
  };
  
  if (loading) {
    return <div className="loading">Loading products from inventory...</div>;
  }
  
  return (
    <div className="billing-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
        <div>
          <h1>POS Billing</h1>
          <p>Invoice #{invoiceNo} | Cart: {cart.reduce((sum, i) => sum + i.qty, 0)} items</p>
        </div>
      </header>

      <div className="billing-layout">
        {/* Left: Customer + Product Search (DYNAMIC) */}
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

        {/* Right: Cart + Payment (ENHANCED) */}
        <div className="billing-right">
          <div className="cart-section">
            <h3>Cart ({cart.reduce((sum, i) => sum + i.qty, 0)} items)</h3>
            <div className="cart-items">
  {cart.map(item => {
    // 👈 Calculate per item: price + GST
    const itemGstAmount = (item.price * item.qty * item.gst / 100);
    const itemTotalWithGst = (item.price * item.qty) + itemGstAmount;
    
    return (
      <div key={item.id} className="cart-item">
        <div className="cart-item-left">
          <h4>{item.name}</h4>
          {/* 👈 NEW: Price + GST = Total */}
          <div className="cart-price-row">
            {editingPriceId === item.id ? (
              <input 
                type="number" 
                step="0.01"
                value={item.price} 
                onChange={(e) => updatePrice(item.id, e.target.value)}
                onBlur={() => setEditingPriceId(null)}
                autoFocus
                className="price-input"
              />
            ) : (
              <span 
                className="price-display"
                onClick={() => setEditingPriceId(item.id)}
              >
                ₹{item.price.toLocaleString('en-IN', {minimumFractionDigits: 2})}
              </span>
            )}
            <span className="gst-equation">+ {item.gst}% GST</span>
            <span className="item-total-equation">
              = ₹{itemTotalWithGst.toLocaleString('en-IN', {minimumFractionDigits: 2})}
            </span>
          </div>
          <p className="qty-text">Qty: {item.qty}</p>
        </div>
        <div className="cart-item-right">
          <div className="qty-controls">
            <button onClick={() => updateQty(item.id, item.qty - 1)}>-</button>
            <span>{item.qty}</span>
            <button onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
            <button className="remove" onClick={() => removeFromCart(item.id)}>✕</button>
          </div>
        </div>
      </div>
    );
  })}
</div>

            <div className="totals">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>₹{subtotal.toLocaleString()}</span>
              </div>
              <div className="total-row gst-row">
                <span>GST ({cart.length > 0 ? 
                  `${((gstAmount/subtotal)*100).toFixed(1)}%` : '0%'}):</span>
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