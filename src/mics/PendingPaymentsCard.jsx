import { useState, useEffect } from 'react';
import { ArrowRight, AlertTriangle } from 'lucide-react';  // Or your icons

const PendingPaymentsCard = ({ onClick }) => {
  const [pending, setPending] = useState({ count: 0, amount: 0 });

  useEffect(() => {
    fetch('/api/payments/pending')  // Your backend endpoint
      .then(res => res.json())
      .then(data => setPending(data));
  }, []);

  return (
    <div className="bg-gradient-to-br from-orange-50 to-yellow-50 border-2 border-orange-200 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer group"
         onClick={onClick}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-orange-700 mb-1">Pending Payments</p>
          <p className="text-2xl font-bold text-gray-900">₹{pending.amount.toLocaleString()}</p>
          <p className="text-sm text-gray-600 mt-1">{pending.count} invoices</p>
        </div>
        <AlertTriangle className="w-8 h-8 text-orange-500 group-hover:text-orange-600" />
      </div>
      <div className="mt-3 flex items-center text-orange-600 text-sm font-medium">
        View details <ArrowRight className="w-4 h-4 ml-1" />
      </div>
    </div>
  );
};