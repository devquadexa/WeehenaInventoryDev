import React, { useState, useEffect } from 'react'
import { Search, Package, Plus, DollarSign } from 'lucide-react'
import { supabase, Product } from '../lib/supabase'
import { SimpleProductEntry } from './SimpleProductEntry'
import { ProductPricesModal } from './ProductPricesModal'
import { useAuth } from '../hooks/useAuth'

export const ProductList: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const { isOnline } = useAuth()
  const [showProductEntry, setShowProductEntry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [selectedProductForPrices, setSelectedProductForPrices] = useState<Product | null>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    setError(null)
    const cacheKey = 'product_list_data'
    if (!isOnline) {
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setProducts(JSON.parse(cachedData))
        setLoading(false)
        return
      }
    }

    try {
      console.log('Fetching products...')
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          name,
          price_dealer_cash,
          price_dealer_credit,
          price_hotel_cash,
          price_hotel_credit,
          product_id,
          category,
          sku,
          categories (
            category_name
          )
        `)
        .order('product_id', { ascending: true })

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }
      
      console.log('Products fetched:', data)
      localStorage.setItem(cacheKey, JSON.stringify(data))
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
      setError('Failed to load products. Please check your database connection.')
      
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setProducts(JSON.parse(cachedData))
      } else {
        setProducts([])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleViewEditPrices = (product: Product) => {
    setSelectedProductForPrices(product)
    setShowPriceModal(true)
  }

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.categories?.category_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading && products.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading products...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">{error}</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Product List</h1>
        <button
          onClick={() => setShowProductEntry(true)}
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </button>
      </div>

      {/* Simple Product Entry Modal */}
      {showProductEntry && (
        <SimpleProductEntry 
          onClose={() => setShowProductEntry(false)}
          onProductAdded={fetchProducts}
        />
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Mobile Card Layout */}
        <div className="block md:hidden">
          <div className="space-y-3">
            {filteredProducts.map((product) => (
              <div key={product.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {product.name}
                    </h3>
                    <div className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Product ID: {product.product_id ? (() => {
                        const match = String(product.product_id).match(/(\d+)/);
                        return match ? String(match[1]).padStart(3, '0') : 'N/A';
                      })() : 'N/A'}</span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Package className="w-8 h-8 text-blue-600 mr-3" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 font-medium">Category:</span>
                    <div className="text-gray-700">{product.categories?.category_name || product.category || 'Uncategorized'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">SKU:</span>
                    <div className="text-gray-700">{product.sku || 'N/A'}</div>
                  </div>
                </div>

                {/* View/Edit Prices Button for Mobile */}
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => handleViewEditPrices(product)}
                    className="p-2.5 text-blue-600 bg-blue-100 rounded-full hover:bg-blue-200 touch-manipulation"
                    title="View/Edit Prices"
                  >
                    <DollarSign className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Table Layout */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Prices (Rs)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProducts.map((product, index) => (
                  <tr key={product.id} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.product_id || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Package className="w-8 h-8 text-blue-600 mr-3" />
                        <div className="text-sm font-medium text-gray-900">{product.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.categories?.category_name || product.category || 'Uncategorized'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleViewEditPrices(product)}
                        className="p-2 text-blue-600 hover:text-blue-900 rounded-full hover:bg-blue-100 transition-colors"
                        title="View/Edit Prices"
                      >
                        <DollarSign className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.sku || 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Product Prices Modal */}
      {showPriceModal && selectedProductForPrices && (
        <ProductPricesModal
          product={selectedProductForPrices}
          onClose={() => setShowPriceModal(false)}
          onPricesUpdated={fetchProducts}
        />
      )}
    </div>
  )
}