import React, { useState, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import { Order, OnDemandOrder, OnDemandAssignmentItem, Product, Customer } from '../lib/supabase'
import { supabase } from '../lib/supabase'

interface PaymentConfirmationModalProps {
  order: Order | (OnDemandOrder & {
    customer_details?: Customer;
    product_details?: (OnDemandAssignmentItem & { products: Product })[];
    sales_rep_username?: string;
  });
  onClose: () => void;
  onConfirm: (
    orderId: string,
    paymentMethod: 'Net' | 'Cash',
    collectedAmount: number
  ) => Promise<string>;
  onPrintBill: (
    order: Order | (OnDemandOrder & { customer_details?: Customer; product_details?: (OnDemandAssignmentItem & { products: Product })[]; sales_rep_username?: string; }),
    paymentMethod: 'Net' | 'Cash',
    receiptNo: string
  ) => void;
  loading: boolean;
  is_on_demand?: boolean;
  paymentCollectedAmount?: number | '';
  setPaymentCollectedAmount?: (amount: number | '') => void;
  paymentMethod?: 'Cash' | 'Net' | null;
  setPaymentMethod?: (method: 'Cash' | 'Net' | null) => void;
  paymentError?: string | null;
  allowPartialPayment?: boolean; // show or hide collected amount input
}

export const PaymentConfirmationModal: React.FC<PaymentConfirmationModalProps> = ({
  order,
  onClose,
  onConfirm,
  onPrintBill,
  loading,
  is_on_demand = false,
  paymentCollectedAmount = '',
  setPaymentCollectedAmount = () => {},
  paymentMethod = null,
  setPaymentMethod = () => {},
  paymentError = null,
  allowPartialPayment = true
}) => {
  const [error, setError] = useState<string | null>(null)
  const [vatRate, setVatRate] = useState(0.18); // Default to 0.18, will be fetched

  useEffect(() => {
    const fetchVatRate = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('vat_rate')
          .single();

        if (error) throw error;
        setVatRate(data.vat_rate);
      } catch (err) {
        console.error('Error fetching VAT rate, using default:', err);
        setVatRate(0.18); // Fallback to default if fetch fails
      }
    };
    fetchVatRate();
  }, []); // Run once on mount

  const calculateTotalAmount = () => {
    // Assuming order.total_amount is already VAT-inclusive if applicable
    return (order as Order).total_amount
  }

  const totalAmount = calculateTotalAmount()

  const handleConfirmAndPrint = async () => {
    if (!paymentMethod) {
      setError('Please select a payment method.')
      return
    }

    let finalCollectedAmount = allowPartialPayment ? Number(paymentCollectedAmount) : totalAmount

    if (allowPartialPayment) {
      if (isNaN(finalCollectedAmount) || finalCollectedAmount <= 0) {
        setError('Please enter a valid positive amount.')
        return
      }
      if (finalCollectedAmount > totalAmount) {
        setError('Collected amount cannot exceed total amount.')
        return
      }
    } else {
      // If partial payment is not allowed, collected amount is always the total
      finalCollectedAmount = totalAmount
    }

    setError(null)

    try {
      // Pass the determined collectedAmount to onConfirm
      const generatedReceiptNo = await onConfirm(order.id, paymentMethod, finalCollectedAmount)
      onPrintBill(order, paymentMethod, generatedReceiptNo)
      onClose()
    } catch (err: any) {
      console.error('Error confirming payment or printing:', err)
      setError(err.message || 'Failed to confirm payment and print bill.')
    }
  }

  const handleCollectedAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!allowPartialPayment) return
    const value = e.target.value
    if (value === '') {
      setPaymentCollectedAmount('')
      return
    }
    const amount = parseFloat(value)
    if (!isNaN(amount) && amount >= 0) {
      setPaymentCollectedAmount(amount)
    }
  }

  const isPartialPayment =
    allowPartialPayment && paymentCollectedAmount !== '' && Number(paymentCollectedAmount) < totalAmount

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Confirm Payment & Print Bill</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Order Summary */}
        <div className="mb-4 space-y-2 p-4 bg-gray-50 rounded-lg">
          <p className="text-gray-700 flex justify-between">
            <span>{is_on_demand ? 'On-Demand Order ID:' : 'Order ID:'}</span>
            <span className="font-medium">
              {is_on_demand
                ? (order as OnDemandOrder).on_demand_order_display_id || 'PENDING'
                : (order as Order).order_display_id}
            </span>
          </p>

          {is_on_demand ? (
            <p className="text-gray-700 flex justify-between">
              <span>Customer:</span>
              <span className="font-medium">
                {(order as OnDemandOrder & { customer_details?: Customer }).customer_name ||
                  (order as OnDemandOrder & { customer_details?: Customer }).customer_details?.name ||
                  'N/A'}
              </span>
            </p>
          ) : (
            'customers' in order && (
              <p className="text-gray-700 flex justify-between">
                <span>Customer:</span>
                <span className="font-medium">{(order as Order).customers?.name || 'N/A'}</span>
              </p>
            )
          )}

          {/* VAT Breakdown */}
          <p className="text-gray-700 flex justify-between">
            <span>Subtotal:</span>
            <span className="font-medium">Rs {((order as Order).total_amount - (order as Order).vat_amount).toFixed(2)}</span>
          </p>
          {(order as Order).is_vat_applicable && (
            <p className="text-gray-700 flex justify-between">
              <span>VAT ({(vatRate * 100).toFixed(0)}%):</span>
              <span className="font-medium">Rs {(order as Order).vat_amount.toFixed(2)}</span>
            </p>
          )}
          <p className="text-gray-700 flex justify-between">
            <span>Total Amount:</span>
            <span className="font-medium text-green-600">Rs {totalAmount.toFixed(2)}</span>
          </p>

          {!allowPartialPayment && (
            <p className="text-gray-700 flex justify-between">
              <span>Payment Type:</span>
              <span className="font-medium text-blue-600">Full Payment</span>
            </p>
          )}
        </div>

        {/* Collected Amount Input — only for partial payments */}
        {allowPartialPayment && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Collected Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">Rs</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max={totalAmount}
                value={paymentCollectedAmount}
                onChange={handleCollectedAmountChange}
                placeholder="0.00"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div className="flex justify-between text-sm text-gray-500 mt-1">
              <span>Enter amount collected from customer</span>
              <span>Max: Rs {totalAmount.toFixed(2)}</span>
            </div>
          </div>
        )}

        {!allowPartialPayment && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Full Payment:</strong> The full amount of Rs {totalAmount.toFixed(2)} will be collected and marked as paid.
            </p>
          </div>
        )}

        {/* Payment Method */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Payment Method *
          </label>
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => setPaymentMethod('Cash')}
              className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${
                paymentMethod === 'Cash'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Cash
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('Net')}
              className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${
                paymentMethod === 'Net'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Net
            </button>
          </div>
        </div>

        {(error || paymentError) && (
          <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">
            {error || paymentError}
          </div>
        )}

        {/* Buttons */}
        <div className="flex space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmAndPrint}
            disabled={
              loading ||
              !paymentMethod ||
              (allowPartialPayment && (paymentCollectedAmount === '' || Number(paymentCollectedAmount) <= 0))
            }
            className="flex-1 flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading ? (
              'Processing...'
            ) : (
              <>
                <Printer className="w-4 h-4 mr-2" />
                Confirm & Print Bill
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}