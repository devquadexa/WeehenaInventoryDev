import React, { useState, useEffect } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import { supabase, Product, Category } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

interface EditProductModalProps {
  product: Product
  onClose: () => void
  onProductUpdated: () => void
}

export const EditProductModal: React.FC<EditProductModalProps> = ({ 
  product, 
  onClose, 
  onProductUpdated 
}) => {
  const { isOnline } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: product.name,
    category_id: product.category_id || '',
    quantity: product.quantity,
    price_dealer_cash: product.price_dealer_cash,
    price_dealer_credit: product.price_dealer_credit,
    price_hotel_cash: product.price_hotel_cash,
    price_hotel_credit: product.price_hotel_credit,
    threshold: product.threshold
  })

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const cacheKey = 'edit_product_modal_categories'
      if (!isOnline) {
        const cachedData = localStorage.getItem(cacheKey)
        if (cachedData) {
          setCategories(JSON.parse(cachedData))
          return
        }
      }

      const { data, error } = await supabase
        .from('categories')
        .select('category_id, category_name, status')
        .eq('status', true)
        .order('category_name')

      if (error) throw error

      localStorage.setItem(cacheKey, JSON.stringify(data))
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
      const cachedData = localStorage.getItem('edit_product_modal_categories')
      if (cachedData) {
        setCategories(JSON.parse(cachedData))
      } else {
        setCategories([])
      }
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Validation
      if (!formData.name.trim()) {
        throw new Error('Product name is required')
      }
      if (!formData.category_id) {
        throw new Error('Category is required')
      }
      if (formData.price_dealer_cash <= 0 || formData.price_dealer_credit <= 0 ||
          formData.price_hotel_cash <= 0 || formData.price_hotel_credit <= 0) {
        throw new Error('All prices must be greater than 0');
      }
      if (formData.quantity < 0) {
        throw new Error('Quantity cannot be negative')
      }
      if (formData.threshold < 0) {
        throw new Error('Threshold cannot be negative')
      }

      const { error } = await supabase
        .from('products')
        .update({
          name: formData.name,
          category_id: formData.category_id,
          quantity: formData.quantity,
          price_dealer_cash: formData.price_dealer_cash,
          price_dealer_credit: formData.price_dealer_credit,
          price_hotel_cash: formData.price_hotel_cash,
          price_hotel_credit: formData.price_hotel_credit,
          threshold: formData.threshold,
        })
        .eq('id', product.id)

      if (error) throw error

      onProductUpdated()
      onClose()
    } catch (error: any) {
      console.error('Error updating product:', error)
      setError(error.message || 'Failed to update product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Edit Product</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              required
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.category_id} value={category.category_id}>
                  {category.category_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity (kg) *
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              min="0"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dealer Cash Price (Rs) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.price_dealer_cash}
              onChange={(e) => setFormData({ ...formData, price_dealer_cash: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              min="0"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dealer Credit Price (Rs) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.price_dealer_credit}
              onChange={(e) => setFormData({ ...formData, price_dealer_credit: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              min="0"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hotel Cash Price (Rs) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.price_hotel_cash}
              onChange={(e) => setFormData({ ...formData, price_hotel_cash: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              min="0"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hotel Credit Price (Rs) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.price_hotel_credit}
              onChange={(e) => setFormData({ ...formData, price_hotel_credit: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              min="0"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Threshold (kg) *
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.threshold}
              onChange={(e) => setFormData({ ...formData, threshold: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              min="0"
              required
            />
          </div>

          {error && (
            <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? (
                'Saving...'
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}