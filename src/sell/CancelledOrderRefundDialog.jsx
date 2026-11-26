import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import createSecureIdempotencyKey from '../utils/createSecureIdempotencyKey';

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const CancelledOrderRefundDialog = ({ order, onClose }) => {
  const navigate = useNavigate();
  const invoiceId = Number(order.id);
  const billType = String(order.billType || 'gst').toLowerCase().replace(/[_ ]/g, '-');
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState(`Refund for cancelled order ${order.invoiceNo || invoiceId}`);
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState('');
  const [confirmRefundPaid, setConfirmRefundPaid] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadRefundablePayments = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(
        API_ENDPOINTS.cancelledInvoiceRefundablePayments(invoiceId, billType),
        { headers: { Accept: 'application/json' }, signal },
      );
      const payload = await response.json().catch(() => []);
      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (response.status === 403) {
        throw new Error('Only a store admin or system admin can record a refund for a cancelled order.');
      }
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || `Unable to load refundable payments (${response.status}).`);
      }
      if (!Array.isArray(payload)) {
        throw new Error('The refund service returned an unsupported response.');
      }

      const normalized = payload.map((payment) => ({
        ...payment,
        paymentId: Number(payment.paymentId),
        amount: Number(payment.amount),
        refundableAmount: Number(payment.refundableAmount),
      }));
      if (normalized.some((payment) => !Number.isSafeInteger(payment.paymentId) || payment.paymentId <= 0
        || !Number.isFinite(payment.amount) || payment.amount <= 0
        || !Number.isFinite(payment.refundableAmount) || payment.refundableAmount <= 0)) {
        throw new Error('The refund service returned invalid payment details.');
      }
      setPayments(normalized);
    } catch (loadError) {
      if (!signal?.aborted) {
        setPayments([]);
        setError(loadError.message || 'Unable to load refundable payments.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [billType, invoiceId, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    loadRefundablePayments(controller.signal);
    return () => controller.abort();
  }, [loadRefundablePayments]);

  const selectPayment = (payment) => {
    if (selectedPayment?.paymentId === payment.paymentId) return;
    setSelectedPayment(payment);
    setRefundAmount(payment.refundableAmount.toFixed(2));
    setRefundIdempotencyKey('');
    setConfirmRefundPaid(false);
    setError('');
  };

  const submitRefund = async (event) => {
    event.preventDefault();
    setError('');
    const amount = Number(refundAmount);
    const refundableAmount = Number(selectedPayment?.refundableAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0 || Number(amount.toFixed(2)) !== amount
      || amount > refundableAmount) {
      setError('Enter an amount up to the remaining refundable balance, with no more than two decimal places.');
      return;
    }
    if (!confirmRefundPaid) {
      setError('Confirm that the customer has received the refund before recording it.');
      return;
    }

    let idempotencyKey = refundIdempotencyKey;
    if (!idempotencyKey) {
      try {
        idempotencyKey = createSecureIdempotencyKey();
        setRefundIdempotencyKey(idempotencyKey);
      } catch (keyError) {
        setError(keyError.message || 'A secure refund reference could not be created.');
        return;
      }
    }

    setSaving(true);
    try {
      const response = await apiFetch(API_ENDPOINTS.paymentRefundsById(selectedPayment.paymentId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          reason: refundReason.trim(),
          idempotencyKey: `refund-${idempotencyKey}`,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to record refund (${response.status}).`);
      }

      setSuccess(`Refund recorded. Receipt ${payload.receiptNo || 'created'}.`);
      setSelectedPayment(null);
      setRefundAmount('');
      setRefundIdempotencyKey('');
      setConfirmRefundPaid(false);
      await loadRefundablePayments();
    } catch (saveError) {
      setError(saveError.message || 'Unable to record refund. Retry with the same details or refresh to verify the result.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="payment-dialog-backdrop"
      role="presentation"
      onClick={() => !saving && onClose()}
    >
      <section
        className="payment-dialog cancelled-order-refund-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancelled-order-refund-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="payment-dialog-close"
          onClick={() => !saving && onClose()}
          aria-label="Close cancelled order refund"
        >
          ×
        </button>
        <h2 id="cancelled-order-refund-title">Refund cancelled order {order.invoiceNo || `#${invoiceId}`}</h2>
        <p>Choose an original payment receipt and record the amount returned to the customer.</p>
        <p className="cancelled-refund-warning">
          This records the refund in the system; it does not transfer money. Complete the refund through the original payment method or your store's cash process before confirming here.
        </p>

        {success && <p className="cancelled-refund-success" role="status">{success}</p>}
        {loading ? (
          <p className="cancelled-refund-empty">Loading refundable payments…</p>
        ) : payments.length === 0 ? (
          <p className="cancelled-refund-empty">
            {success
              ? 'No refundable balance remains for this order.'
              : 'No recorded refundable payments were found for this invoice. Check Payment Report before taking further action.'}
          </p>
        ) : (
          <div className="cancelled-refund-payment-list">
            <h3>Original payment receipts</h3>
            {payments.map((payment) => (
              <article key={payment.paymentId}>
                <div>
                  <strong>{payment.receiptNo || `Payment #${payment.paymentId}`}</strong>
                  <span>{payment.method} · Received {formatMoney(payment.amount)}</span>
                  <span>Remaining refundable: {formatMoney(payment.refundableAmount)}</span>
                </div>
                <button
                  type="button"
                  className="cancelled-refund-select-button"
                  disabled={saving}
                  onClick={() => selectPayment(payment)}
                >
                  Refund this receipt
                </button>
              </article>
            ))}
          </div>
        )}

        {selectedPayment && (
          <form className="payment-dialog-form" onSubmit={submitRefund}>
            <h3>Refund {selectedPayment.receiptNo || `payment #${selectedPayment.paymentId}`}</h3>
            <label>Amount (₹)
              <input
                type="number"
                min="0.01"
                max={selectedPayment.refundableAmount}
                step="0.01"
                value={refundAmount}
                onChange={(event) => {
                  setRefundAmount(event.target.value);
                  setRefundIdempotencyKey('');
                }}
                required
              />
            </label>
            <label>Reason
              <input
                type="text"
                maxLength="255"
                value={refundReason}
                onChange={(event) => {
                  setRefundReason(event.target.value);
                  setRefundIdempotencyKey('');
                }}
              />
            </label>
            <label className="cancelled-refund-confirm">
              <input
                type="checkbox"
                checked={confirmRefundPaid}
                onChange={(event) => {
                  setConfirmRefundPaid(event.target.checked);
                  setError('');
                }}
              />
              I confirm the customer has received this refund.
            </label>
            <div className="payment-dialog-actions">
              <button type="submit" className="btn-collect-payment" disabled={saving}>
                {saving ? 'Recording refund…' : 'Confirm refund'}
              </button>
              <button
                type="button"
                className="payment-dialog-cancel"
                disabled={saving}
                onClick={() => {
                  setSelectedPayment(null);
                  setRefundIdempotencyKey('');
                  setConfirmRefundPaid(false);
                  setError('');
                }}
              >
                Back
              </button>
            </div>
          </form>
        )}
        {error && <p className="payment-dialog-error" role="alert">{error}</p>}
        <div className="payment-dialog-actions">
          <button type="button" className="payment-dialog-cancel" onClick={onClose} disabled={saving}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
};

export default CancelledOrderRefundDialog;
