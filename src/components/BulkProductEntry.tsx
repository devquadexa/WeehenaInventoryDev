import React, { useState, useEffect } from 'react'
import { Plus, Save, Trash2, X, Upload, Download, Search, AlertCircle } from 'lucide-react'
import { supabase, Category, Product } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

interface ProductEntry {
  id: string
  name: string
  category_id: string
  quantity: number | null
  price_dealer_cash: number | null
  price_dealer_credit: number | null
  price_hotel_cash: number | null
  price_hotel_credit: number | null
  description: string
  errors?: string[]
}

interface BulkProductEntryProps {
  onClose: () => void
  onProductsAdded: () => void
}

interface InputPosition {
  top: number
  left: number
  width: number
}

interface ProductSuggestion {
  id: string
  name: string
  categoryName: string
  price: number
}

export const BulkProductEntry: React.FC<BulkProductEntryProps> = ({ onClose, onProductsAdded }) => {
  const { isOnline } = useAuth()
  const [products, setProducts] = useState<ProductEntry[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [showFileImport, setShowFileImport] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [existingDbProducts, setExistingDbProducts] = useState<Product[]>([])

  useEffect(() => {
    fetchCategories()
    fetchExistingProducts()
    initializeProducts()
  }, [])

  const fetchCategories = async () => {
    try {
      const cacheKey = 'bulk_product_entry_categories'
      if (!isOnline) {
        const cachedData = localStorage.getItem(cacheKey)
        if (cachedData) {
          setCategories(JSON.parse(cachedData))
          return
        }
      }

      // Test Supabase connection first
      const { data: testData, error: testError } = await supabase
        .from('categories')
        .select('count')
        .limit(1)
        .single()
      
      if (testError && testError.code !== 'PGRST116') {
        throw new Error(`Database connection failed: ${testError.message}`)
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
      const cachedData = localStorage.getItem('bulk_product_entry_categories')
      if (cachedData) {
        setCategories(JSON.parse(cachedData))
      } else {
        setCategories([])
      }

      // Provide user-friendly error handling
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('Supabase connection failed. Please check:')
        console.error('1. VITE_SUPABASE_URL is correct in .env file')
        console.error('2. VITE_SUPABASE_ANON_KEY is correct in .env file')
        console.error('3. Your Supabase project is active')
        console.error('4. Your internet connection is working')
        console.error('5. No firewall is blocking supabase.co')
      }
    }
  }

  const fetchExistingProducts = async () => {
    try {
      const cacheKey = 'bulk_product_entry_existing_products'
      if (!isOnline) {
        const cachedData = localStorage.getItem(cacheKey)
        if (cachedData) {
          setExistingDbProducts(JSON.parse(cachedData))
          return
        }
      }

      const { data, error } = await supabase
        .from('products')
        .select('id, name, category_id')
        .order('name')

      if (error) throw error

      localStorage.setItem(cacheKey, JSON.stringify(data))
      setExistingDbProducts(data || [])
    } catch (error) {
      console.error('Error fetching existing products:', error)
      const cachedData = localStorage.getItem('bulk_product_entry_existing_products')
      if (cachedData) {
        setExistingDbProducts(JSON.parse(cachedData))
      } else {
        setExistingDbProducts([])
      }
    }
  }

  const initializeProducts = () => {
    const initialProduct: ProductEntry = {
      id: 'product-0',
      name: '',
      category_id: '',
      price_dealer_cash: null,
      price_dealer_credit: null,
      price_hotel_cash: null,
      price_hotel_credit: null,
      quantity: null,
      description: ''
    }
    setProducts([initialProduct])
  }

  const addRows = (count: number = 5) => {
    const newRows: ProductEntry[] = Array.from({ length: count }, (_, index) => ({
      id: `product-${products.length + index}`,
      name: '',
      category_id: '',
      price_dealer_cash: null,
      price_dealer_credit: null,
      price_hotel_cash: null,
      price_hotel_credit: null,
      quantity: null,
      description: ''
    }))
    const updatedProducts = [...products, ...newRows]
    setProducts(updatedProducts)
    
    // Auto-scroll to the first newly added product on mobile
    setTimeout(() => {
      const newProductIndex = products.length
      const newProductElement = document.querySelector(`[data-product-index="${newProductIndex}"]`)
      if (newProductElement && window.innerWidth < 768) {
        newProductElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        })
      }
    }, 100)
  }

  const updateProduct = (id: string, field: keyof ProductEntry, value: any) => {
    setProducts(products.map(product => {
      if (product.id === id) {
        const updatedProduct = { ...product, [field]: value, errors: undefined }
        return updatedProduct
      }
      return product
    }))
  }

  const removeProduct = (id: string) => {
    if (products.length > 1) {
      setProducts(products.filter(product => product.id !== id))
    }
  }

  const validateProducts = (): ProductEntry[] => {
    return products.map(product => {
      const errors: string[] = []
      
      if (product.name && !product.category_id) {
        errors.push('Category is required')
      }
      if (product.name && (product.price_dealer_cash === null || product.price_dealer_cash <= 0 ||
                           product.price_dealer_credit === null || product.price_dealer_credit <= 0 ||
                           product.price_hotel_cash === null || product.price_hotel_cash <= 0 ||
                           product.price_hotel_credit === null || product.price_hotel_credit <= 0)) {
        errors.push('All prices must be greater than 0');
      }
      if (product.name && product.quantity !== null && product.quantity < 0) {
        errors.push('Quantity cannot be negative')
      }

      return { ...product, errors: errors.length > 0 ? errors : undefined }
    })
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      // Test database connection first
      try {
        const { data: testData, error: testError } = await supabase
          .from('categories')
          .select('count')
          .limit(1)
          .single()
        
        if (testError && testError.code !== 'PGRST116') {
          throw new Error(`Database connection failed: ${testError.message}`)
        }
      } catch (connectionError) {
        if (connectionError instanceof TypeError && connectionError.message.includes('Failed to fetch')) {
          throw new Error('Cannot connect to Supabase. Please verify your database connection and try again.')
        }
        throw connectionError
      }

      const validatedProducts = validateProducts()
      const productsToSave = validatedProducts.filter(p => 
        p.name.trim() !== '' && (!p.errors || p.errors.length === 0)
      )

      if (productsToSave.length === 0) {
        alert('No valid products to save')
        setLoading(false)
        return
      }

      let savedCount = 0
      let errorCount = 0
      const errors: string[] = []

      for (const product of productsToSave) {
        try {
          const selectedCategory = categories.find(c => c.category_id === product.category_id)
          if (!selectedCategory) {
            errors.push(`Product "${product.name}": Invalid category selected`)
            errorCount++
            continue
          }

          // Check if this product already exists in the database by name and category
          const existingProduct = existingDbProducts.find(p => 
            p.name.toLowerCase() === product.name.toLowerCase() && 
            p.category_id === product.category_id
          )
          
          if (existingProduct) {
            // Update existing product quantity and price
            const { error } = await supabase
              .from('products')
              .update({ 
                quantity: product.quantity || 0,
                price_dealer_cash: product.price_dealer_cash || 0,
                price_dealer_credit: product.price_dealer_credit || 0,
                price_hotel_cash: product.price_hotel_cash || 0,
                price_hotel_credit: product.price_hotel_credit || 0,
              })
              .eq('id', existingProduct.id)

            if (error) {
              console.error(`Error updating product "${product.name}":`, error)
              errors.push(`Product "${product.name}": ${error.message}`)
              errorCount++
            } else {
              savedCount++
            }
          } else {
            // Create new product with auto-generated product_id
            const { error } = await supabase
              .from('products')
              .insert([{
                name: product.name,
                category_id: product.category_id,
                sku: `SKU-${product.name.substring(0, 3).toUpperCase()}`,
                quantity: product.quantity || 0,
                price_dealer_cash: product.price_dealer_cash || 0,
                price_dealer_credit: product.price_dealer_credit || 0,
                price_hotel_cash: product.price_hotel_cash || 0,
                price_hotel_credit: product.price_hotel_credit || 0,
                threshold: Math.max(1, Math.floor((product.quantity || 0) * 0.1)),
              }])

            if (error) {
              console.error(`Error inserting product "${product.name}":`, error)
              errors.push(`Product "${product.name}": ${error.message}`)
              errorCount++
            } else {
              savedCount++
            }
          }
        } catch (productError) {
          console.error(`Unexpected error processing product "${product.name}":`, productError)
          errors.push(`Product "${product.name}": Unexpected error occurred`)
          errorCount++
        }
      }

      // Show detailed results
      if (savedCount > 0 && errorCount === 0) {
        alert(`Successfully saved ${savedCount} products`)
        onProductsAdded()
        onClose()
      } else if (savedCount > 0 && errorCount > 0) {
        alert(`Partially completed: ${savedCount} products saved, ${errorCount} failed.\n\nErrors:\n${errors.join('\n')}`)
        onProductsAdded()
      } else {
        alert(`Failed to save products.\n\nErrors:\n${errors.join('\n')}`)
      }
    } catch (error) {
      console.error('Error saving products:', error)
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        alert('Cannot connect to database. Please check your Supabase connection and try again.')
      } else {
        alert(`Failed to save products: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  // File Import Functions
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = async (selectedFile: File) => {
    if (!selectedFile.name.match(/\.(csv|xlsx|xls)$/)) {
      alert('Please select a CSV or Excel file')
      return
    }

    setFile(selectedFile)
    
    try {
      const text = await selectedFile.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        alert('File must contain at least a header row and one data row')
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const requiredHeaders = ['product name', 'category', 'quantity', 'dealer cash price', 'dealer credit price', 'hotel cash price', 'hotel credit price', 'description']
      
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
      if (missingHeaders.length > 0) {
        alert(`Missing required columns: ${missingHeaders.join(', ')}`)
        return
      }

      const parsedProducts: ProductEntry[] = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim())
        const categoryName = values[headers.indexOf('category')] || ''
        const category = categories.find(c => c.category_name.toLowerCase() === categoryName.toLowerCase())
        
        return {
          id: `import-${index}`,
          name: values[headers.indexOf('product name')] || '',
          category_id: category?.category_id || '',
          quantity: parseInt(values[headers.indexOf('quantity')]) || null,
          price_dealer_cash: parseFloat(values[headers.indexOf('dealer cash price')]) || null,
          price_dealer_credit: parseFloat(values[headers.indexOf('dealer credit price')]) || null,
          price_hotel_cash: parseFloat(values[headers.indexOf('hotel cash price')]) || null,
          price_hotel_credit: parseFloat(values[headers.indexOf('hotel credit price')]) || null,
          description: values[headers.indexOf('description')] || ''
        }
      })

      setProducts(parsedProducts)
      setShowFileImport(false)
      setFile(null)
    } catch (error) {
      console.error('Error parsing file:', error)
      alert('Error parsing file. Please check the format.')
    }
  }

  const downloadTemplate = () => {
    const headers = ['Product Name', 'Category', 'Quantity', 'Dealer Cash Price', 'Dealer Credit Price', 'Hotel Cash Price', 'Hotel Credit Price', 'Description']
    const sampleData = [
      'Premium Chicken Feed,Feed,50.0,4550.00,4600.00,4700.00,4750.00,High-quality feed for adult chickens',
      'Automatic Water Dispenser,Equipment,2.5,12500.00,12600.00,12700.00,12800.00,Automatic water dispensing system',
      'Vitamin Supplement,Medicine,25.0,1275.00,1300.00,1325.00,1350.00,Essential vitamins for poultry health'
    ]
    
    const csvContent = [headers.join(','), ...sampleData].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'product_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Helper function to handle input focus and capture position
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>, productId: string, index: number) => {
    const rect = e.target.getBoundingClientRect()
  }

  // Calculate derived values
  const filledProducts = products.filter(p => p.name.trim() !== '').length
  const hasErrors = products.some(p => p.errors && p.errors.length > 0)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[95vh] overflow-hidden">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Bulk Product Entry</h2>
              <p className="text-sm text-gray-600">
                {filledProducts} products ready • Product IDs will be auto-generated for new products
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              
              <button
                onClick={() => setShowFileImport(true)}
                className="flex items-center px-3 py-2 text-green-600 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
              >
                <Upload className="w-4 h-4 mr-2" />
                File Import
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={loading || hasErrors || filledProducts === 0}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? (
                'Saving...'
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Products
                </>
              )}
            </button>
          </div>

          {/* Bulk Entry Table */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Mobile Card Layout */}
            <div className="block md:hidden">
              <div className="space-y-4 pb-4">
                {products.map((product, index) => (
                  <div key={product.id} className={`bg-white border rounded-lg p-4 ${product.errors ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-gray-500">Product #{index + 1}</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => addRows(1)}
                          className="p-2.5 text-green-600 bg-green-100 rounded-full hover:bg-green-200 touch-manipulation"
                          title="Add new product"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => removeProduct(product.id)}
                          className="p-2.5 text-red-600 bg-red-100 rounded-full hover:bg-red-200 touch-manipulation"
                          disabled={products.length === 1}
                          title="Remove product"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {/* Product Name */}
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Product Name *
                        </label>
                        <input
                          type="text"
                          value={product.name}
                          onChange={(e) => updateProduct(product.id, 'name', e.target.value)}
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                          placeholder="Enter product name"
                        />
                      </div>

                      {/* Category */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category *
                        </label>
                        <select
                          value={product.category_id}
                          onChange={(e) => updateProduct(product.id, 'category_id', e.target.value)}
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                        >
                          <option value="">Select category</option>
                          {categories.map((category) => (
                            <option key={category.category_id} value={category.category_id}>
                              {category.category_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Quantity (kg)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={product.quantity ?? ''}
                          onChange={(e) => updateProduct(product.id, 'quantity', parseFloat(e.target.value) || null)}
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                          min="0"
                          placeholder="0.0"
                        />
                      </div>

                      {/* Price Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Dealer Cash Price (Rs) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={product.price_dealer_cash ?? ''}
                            onChange={(e) => updateProduct(product.id, 'price_dealer_cash', parseFloat(e.target.value) || null)}
                            className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                            min="0"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Dealer Credit Price (Rs) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={product.price_dealer_credit ?? ''}
                            onChange={(e) => updateProduct(product.id, 'price_dealer_credit', parseFloat(e.target.value) || null)}
                            className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                            min="0"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Hotel Cash Price (Rs) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={product.price_hotel_cash ?? ''}
                            onChange={(e) => updateProduct(product.id, 'price_hotel_cash', parseFloat(e.target.value) || null)}
                            className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                            min="0"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Hotel Credit Price (Rs) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={product.price_hotel_credit ?? ''}
                            onChange={(e) => updateProduct(product.id, 'price_hotel_credit', parseFloat(e.target.value) || null)}
                            className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                            min="0"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <textarea
                          value={product.description}
                          onChange={(e) => updateProduct(product.id, 'description', e.target.value)}
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                          placeholder="Product description"
                          rows={2}
                        />
                      </div>

                      {/* Error Display */}
                      {product.errors && (
                        <div className="p-3 bg-red-100 border border-red-300 rounded-lg">
                          <div className="flex items-center">
                            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                            <div className="text-sm text-red-700">
                              {product.errors.join(', ')}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden md:block">
              <div className="overflow-x-auto pb-4">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-48">Product Name *</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-40">Category *</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Quantity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Dealer Cash *</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Dealer Credit *</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Hotel Cash *</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Hotel Credit *</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-48">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {products.map((product, index) => (
                      <tr key={product.id} className={`hover:bg-gray-50 ${product.errors ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                        <td className="px-4 py-3 relative">
                          <input
                            type="text"
                            value={product.name}
                            onChange={(e) => updateProduct(product.id, 'name', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Enter product name"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={product.category_id}
                            onChange={(e) => updateProduct(product.id, 'category_id', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Select category</option>
                            {categories.map((category) => (
                              <option key={category.category_id} value={category.category_id}>
                                {category.category_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.1"
                            value={product.quantity ?? ''}
                            onChange={(e) => updateProduct(product.id, 'quantity', parseFloat(e.target.value) || null)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            min="0"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={product.price_dealer_cash ?? ''}
                            onChange={(e) => updateProduct(product.id, 'price_dealer_cash', parseFloat(e.target.value) || null)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            min="0"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={product.price_dealer_credit ?? ''}
                            onChange={(e) => updateProduct(product.id, 'price_dealer_credit', parseFloat(e.target.value) || null)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            min="0"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={product.price_hotel_cash ?? ''}
                            onChange={(e) => updateProduct(product.id, 'price_hotel_cash', parseFloat(e.target.value) || null)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            min="0"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={product.price_hotel_credit ?? ''}
                            onChange={(e) => updateProduct(product.id, 'price_hotel_credit', parseFloat(e.target.value) || null)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            min="0"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={product.description}
                            onChange={(e) => updateProduct(product.id, 'description', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Product description"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => removeProduct(product.id)}
                              className="p-2 text-red-600 hover:text-red-800 rounded-full hover:bg-red-50"
                              disabled={products.length === 1}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => addRows(1)}
                              className="p-2 text-green-600 hover:text-green-800 rounded-full hover:bg-green-50"
                              title="Add new row"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {hasErrors && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                  <h3 className="text-sm font-medium text-red-800">Validation Errors</h3>
                </div>
                <div className="mt-2 text-sm text-red-700">
                  Please fix the highlighted errors before saving.
                </div>
              </div>
            )}
          </div>

          {/* File Import Modal */}
          {showFileImport && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">File Import</h3>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={downloadTemplate}
                      className="flex items-center px-3 py-2 text-blue-600 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Template
                    </button>
                    <button
                      onClick={() => setShowFileImport(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive 
                      ? 'border-blue-400 bg-blue-50' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">
                    Upload your file
                  </h4>
                  <p className="text-gray-600 mb-4">
                    Drag and drop your CSV or Excel file here, or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileInput}
                    className="hidden"
                    id="file-input"
                  />
                  <label
                    htmlFor="file-input"
                    className="cursor-pointer px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Choose File
                  </label>
                  <p className="text-sm text-gray-500 mt-4">
                    Required columns: Product Name, Category, Quantity, Dealer Cash Price, Dealer Credit Price, Hotel Cash Price, Hotel Credit Price, Description
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}