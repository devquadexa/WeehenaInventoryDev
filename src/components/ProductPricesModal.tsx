import React, { useState, useEffect } from 'react'
import { X, Save, DollarSign } from 'lucide-react'
import { supabase, Product } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

interface ProductPricesModalProps {
  product: Product
  onClose: () => void
  onPricesUpdated: () => void
}

interface PriceAuditInfo {
  username: string;
  changedAt: string;
}

export const ProductPricesModal: React.FC<ProductPricesModalProps> = ({
  product,
  onClose,
  onPricesUpdated
}) => {
  const [prices, setPrices] = useState({
    price_dealer_cash: product.price_dealer_cash || 0,
    price_dealer_credit: product.price_dealer_credit || 0,
    price_hotel_cash: product.price_hotel_cash || 0,
    price_hotel_credit: product.price_hotel_credit || 0
  })
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const canEditPrices = user?.role === 'Admin' || user?.role === 'Super Admin'
  const [auditInfo, setAuditInfo] = useState<Record<string, PriceAuditInfo | null>>({
    price_dealer_cash: null,
    price_dealer_credit: null,
    price_hotel_cash: null,
    price_hotel_credit: null,
  })

  useEffect(() => {
    setPrices({
      price_dealer_cash: product.price_dealer_cash || 0,
      price_dealer_credit: product.price_dealer_credit || 0,
      price_hotel_cash: product.price_hotel_cash || 0,
      price_hotel_credit: product.price_hotel_credit || 0
    })
  }, [product])

  // Format date without using date-fns
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (error) {
      return 'Unknown date';
    }
  }

  // Fetch audit information for each price field
  useEffect(() => {
    const fetchAuditInfo = async () => {
      const priceFields = ['price_dealer_cash', 'price_dealer_credit', 'price_hotel_cash', 'price_hotel_credit'];
      const newAuditInfo: Record<string, PriceAuditInfo | null> = {};

      for (const field of priceFields) {
        try {
          // Query from products_audit table
          const { data, error } = await supabase
            .from('products_audit')
            .select('changed_by_username, modified_at')
            .eq('product_id', product.id)
            .contains('changed_columns', [field])
            .order('modified_at', { ascending: false })
            .limit(1);

          if (error) {
            console.error(`Error fetching audit info for ${field}:`, error);
            newAuditInfo[field] = null;
          } else if (data && data.length > 0) {
            // Use the first record if we get any results
            newAuditInfo[field] = {
              username: data[0].changed_by_username || 'Unknown',
              changedAt: data[0].modified_at,
            };
          } else {
            newAuditInfo[field] = null;
          }
        } catch (err) {
          console.error(`Unexpected error fetching audit info for ${field}:`, err);
          newAuditInfo[field] = null;
        }
      }
      setAuditInfo(newAuditInfo);
    };

    if (product.id) {
      fetchAuditInfo();
    }
  }, [product.id]);

  const handleSave = async () => {
    if (!canEditPrices) {
      alert('You do not have permission to edit prices.')
      return
    }

    setLoading(true)
    try {
      // First set the user context for trigger-based auditing
      const { error: sessionError } = await supabase.rpc('set_current_user_info', {
        user_id: user?.id,
        username: user?.username
      });

      if (sessionError) {
        console.error('Error setting user context:', sessionError);
        // Continue with manual audit approach as fallback
        await handleSaveWithManualAudit();
      } else {
        // Use trigger-based approach
        await handleSaveWithTrigger();
      }
    } catch (error) {
      console.error('Error updating prices:', error)
      alert('Failed to update prices. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Fallback: Manual audit approach
  const handleSaveWithManualAudit = async () => {
    // First update the product prices
    const { error } = await supabase
      .from('products')
      .update(prices)
      .eq('id', product.id)

    if (error) throw error

    // Determine which price fields actually changed
    const changedPriceFields = Object.keys(prices).filter(key => {
      const priceKey = key as keyof typeof prices;
      const productKey = key as keyof Product;
      return prices[priceKey] !== product[productKey];
    });

    // Only create audit record if there are actual changes
    if (changedPriceFields.length > 0) {
      // Then manually create an audit record with the correct user info
      const { error: auditError } = await supabase
        .from('products_audit')
        .insert({
          product_id: product.id,
          action: 'UPDATED',
          changed_by_user_id: user?.id,
          changed_by_username: user?.username,
          changed_columns: changedPriceFields,
          old_name: product.name,
          old_sku: product.sku,
          old_quantity: product.quantity,
          old_price_dealer_cash: product.price_dealer_cash,
          old_price_dealer_credit: product.price_dealer_credit,
          old_price_hotel_cash: product.price_hotel_cash,
          old_price_hotel_credit: product.price_hotel_credit,
          new_name: product.name, // Name doesn't change in price modal
          new_sku: product.sku, // SKU doesn't change in price modal
          new_quantity: product.quantity, // Quantity doesn't change in price modal
          new_price_dealer_cash: prices.price_dealer_cash,
          new_price_dealer_credit: prices.price_dealer_credit,
          new_price_hotel_cash: prices.price_hotel_cash,
          new_price_hotel_credit: prices.price_hotel_credit,
        })

      if (auditError) {
        console.error('Error creating audit record:', auditError)
        console.log('Product prices updated, but audit record creation failed. This is non-critical.');
      } else {
        console.log('Manual audit record created successfully for price changes:', changedPriceFields);
      }
    } else {
      console.log('No price changes detected, skipping audit record creation.');
    }

    onPricesUpdated()
    onClose()
    alert('Prices updated successfully!')
  }

  // Primary: Trigger-based approach
  const handleSaveWithTrigger = async () => {
    // Update product prices (this will use the trigger with session context)
    const { error } = await supabase
      .from('products')
      .update(prices)
      .eq('id', product.id)

    if (error) throw error

    onPricesUpdated()
    onClose()
    alert('Prices updated successfully! (Trigger-based audit)')
  }

  const handlePriceChange = (field: keyof typeof prices, value: string) => {
    const numValue = parseFloat(value) || 0
    setPrices(prev => ({
      ...prev,
      [field]: numValue
    }))
  }

  const formatPriceLabel = (key: string) => {
    return key
      .replace('price_', '')
      .replace('_', ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Product Prices
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Product: {product.name}</h4>
            <p className="text-xs text-gray-500">SKU: {product.sku}</p>
          </div>
          
          <div className="space-y-4">
            {Object.entries(prices).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formatPriceLabel(key)} (Rs)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">Rs</span>
                  <input
                    type="number"
                    step="0.01"
                    value={value}
                    onChange={(e) => handlePriceChange(key as keyof typeof prices, e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    min="0"
                    required
                    disabled={!canEditPrices}
                  />
                </div>
                {auditInfo[key] && (
                  <p className="text-xs text-gray-500 mt-1">
                    Last modified: {formatDate(auditInfo[key]!.changedAt)} by {auditInfo[key]!.username}
                  </p>
                )}
                {!auditInfo[key] && (
                  <p className="text-xs text-gray-400 mt-1 italic">
                    No modification history available
                  </p>
                )}
              </div>
            ))}
          </div>

          {!canEditPrices && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-700">
                You have view-only access to prices. Contact an administrator to make changes.
              </p>
            </div>
          )}
        </div>
        
        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Close
          </button>
          {canEditPrices && (
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Prices'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}