import React, { useState, useEffect } from 'react'
import { Plus, Upload, Download, Table, X, Save, AlertCircle, Check } from 'lucide-react'
import { supabase, Category } from '../lib/supabase'

interface ProductEntry {
  id: string
  name: string
  category_id: string
  quantity: number
  price: number
  description: string
  errors?: string[]
}

interface ImportRecord extends ProductEntry {
  row: number
  status?: 'pending' | 'success' | 'error'
}

interface ProductEntryProps {
  onProductsAdded: () => void
}

export const ProductEntry: React.FC<ProductEntryProps> = ({ onProductsAdded }) => {
  const [showModal, setShowModal] = useState(false)
  const [entryMethod, setEntryMethod] = useState<'bulk' | 'import' | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<ProductEntry[]>([])
  const [importRecords, setImportRecords] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importStats, setImportStats] = useState({ total: 0, success: 0, errors: 0 })

  useEffect(() => {
    if (showModal) {
      fetchCategories()
    }
  }, [showModal])

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('status', true)
        .order('category_name')

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const initializeBulkEntry = () => {
    const initialProducts: ProductEntry[] = Array.from({ length: 10 }, (_, index) => ({
      id: `product-${index}`,
      name: '',
      category_id: '',
      quantity: 0,
      price: 0,
      description: ''
    }))
    setProducts(initialProducts)
  }

  const handleOpenModal = () => {
    setShowModal(true)
    setEntryMethod(null)
    setProducts([])
    setImportRecords([])
    setFile(null)
    setImportStats({ total: 0, success: 0, errors: 0 })
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEntryMethod(null)
    setProducts([])
    setImportRecords([])
    setFile(null)
  }

  const handleMethodSelect = (method: 'bulk' | 'import') => {
    setEntryMethod(method)
    if (method === 'bulk') {
      initializeBulkEntry()
    }
  }

  const addBulkRows = (count: number = 5) => {
    const newRows: ProductEntry[] = Array.from({ length: count }, (_, index) => ({
      id: `product-${products.length + index}`,
      name: '',
      category_id: '',
      quantity: 0,
      price: 0,
      description: ''
    }))
    setProducts([...products, ...newRows])
  }

  const updateProduct = (id: string, field: keyof ProductEntry, value: any) => {
    setProducts(products.map(product => 
      product.id === id 
        ? { ...product, [field]: value, errors: undefined }
        : product
    ))
  }

  const removeProduct = (id: string) => {
    setProducts(products.filter(product => product.id !== id))
  }

  const validateProducts = (): ProductEntry[] => {
    return products.map(product => {
      const errors: string[] = []
      
      if (product.name && !product.category_id) {
        errors.push('Category is required')
      }
      if (product.name && product.price <= 0) {
        errors.push('Price must be greater than 0')
      }
      if (product.name && product.quantity < 0) {
        errors.push('Quantity cannot be negative')
      }

      return { ...product, errors: errors.length > 0 ? errors : undefined }
    })
  }

  const handleBulkSave = async () => {
    setLoading(true)
    try {
      const validatedProducts = validateProducts()
      const productsToSave = validatedProducts.filter(p => 
        p.name.trim() !== '' && (!p.errors || p.errors.length === 0)
      )

      if (productsToSave.length === 0) {
        alert('No valid products to save')
        return
      }

      for (const product of productsToSave) {
        const selectedCategory = categories.find(c => c.category_id === product.category_id)
        if (selectedCategory) {
          const { data: productIdData, error: productIdError } = await supabase
            .rpc('generate_product_id', { category_code_param: selectedCategory.category_code })
          
          if (productIdError) throw productIdError
          
          const { error } = await supabase
            .from('products')
            .insert([{
              name: product.name,
              category_id: product.category_id,
              sku: `SKU-${productIdData}`,
              quantity: product.quantity,
              price: product.price,
              threshold: Math.max(1, Math.floor(product.quantity * 0.1)),
              product_id: productIdData
            }])

          if (error) throw error
        }
      }

      alert(`Successfully saved ${productsToSave.length} products`)
      onProductsAdded()
      handleCloseModal()
    } catch (error) {
      console.error('Error saving products:', error)
      alert('Failed to save products. Please try again.')
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
      const requiredHeaders = ['product name', 'category', 'quantity', 'unit price', 'description']
      
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
      if (missingHeaders.length > 0) {
        alert(`Missing required columns: ${missingHeaders.join(', ')}`)
        return
      }

      const parsedRecords: ImportRecord[] = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim())
        const categoryName = values[headers.indexOf('category')] || ''
        const category = categories.find(c => c.category_name.toLowerCase() === categoryName.toLowerCase())
        
        const record: ImportRecord = {
          id: `import-${index}`,
          row: index + 2,
          name: values[headers.indexOf('product name')] || '',
          category_id: category?.category_id || '',
          quantity: parseInt(values[headers.indexOf('quantity')]) || 0,
          price: parseFloat(values[headers.indexOf('unit price')]) || 0,
          description: values[headers.indexOf('description')] || '',
          status: 'pending'
        }

        // Validate record
        const errors: string[] = []
        if (!record.name) errors.push('Product name is required')
        if (!record.category_id) errors.push('Valid category is required')
        if (record.price <= 0) errors.push('Price must be greater than 0')
        if (record.quantity < 0) errors.push('Quantity cannot be negative')

        if (errors.length > 0) {
          record.errors = errors
          record.status = 'error'
        }

        return record
      })

      setImportRecords(parsedRecords)
      setImportStats({
        total: parsedRecords.length,
        success: 0,
        errors: parsedRecords.filter(r => r.status === 'error').length
      })
    } catch (error) {
      console.error('Error parsing file:', error)
      alert('Error parsing file. Please check the format.')
    }
  }

  const handleImport = async () => {
    const validRecords = importRecords.filter(r => r.status !== 'error')
    if (validRecords.length === 0) {
      alert('No valid records to import')
      return
    }

    setLoading(true)
    let successCount = 0
    let errorCount = 0

    try {
      for (const record of validRecords) {
        try {
          const category = categories.find(c => c.category_id === record.category_id)
          if (!category) {
            record.status = 'error'
            record.errors = ['Category not found']
            errorCount++
            continue
          }

          const { data: productIdData, error: productIdError } = await supabase
            .rpc('generate_product_id', { category_code_param: category.category_code })
          
          if (productIdError) throw productIdError

          const { error } = await supabase
            .from('products')
            .insert([{
              name: record.name,
              category_id: record.category_id,
              sku: `SKU-${productIdData}`,
              quantity: record.quantity,
              price: record.price,
              threshold: Math.max(1, Math.floor(record.quantity * 0.1)),
              product_id: productIdData
            }])

          if (error) throw error

          record.status = 'success'
          successCount++
        } catch (error) {
          console.error(`Error importing row ${record.row}:`, error)
          record.status = 'error'
          record.errors = ['Import failed']
          errorCount++
        }

        setImportRecords([...importRecords])
        setImportStats({ total: importRecords.length, success: successCount, errors: errorCount })
      }

      alert(`Import completed: ${successCount} successful, ${errorCount} errors`)
      if (successCount > 0) {
        onProductsAdded()
      }
    } catch (error) {
      console.error('Import failed:', error)
      alert('Import failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = () => {
    const headers = ['Product Name', 'Category', 'Quantity', 'Unit Price', 'Description']
    const sampleData = [
      'Premium Chicken Feed,Feed,1000,45.50,High-quality feed for adult chickens',
      'Automatic Water Dispenser,Equipment,25,125.00,Automatic water dispensing system',
      'Vitamin Supplement,Medicine,500,12.75,Essential vitamins for poultry health'
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

  const hasErrors = products.some(p => p.errors && p.errors.length > 0)
  const filledProducts = products.filter(p => p.name.trim() !== '').length

  return (
    <>
      <button
        onClick={handleOpenModal}
        className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Products
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Add Products</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Method Selection */}
            {!entryMethod && (
              <div className="p-8">
                <div className="text-center mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Choose Product Entry Method
                  </h3>
                  <p className="text-gray-600">
                    Select how you would like to add products to your inventory
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                  <button
                    onClick={() => handleMethodSelect('bulk')}
                    className="p-8 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="flex items-center mb-4">
                      <Table className="w-8 h-8 text-blue-600 mr-3" />
                      <h4 className="text-lg font-semibold text-gray-900">Bulk Entry Table</h4>
                    </div>
                    <p className="text-gray-600 mb-4">
                      Enter multiple products using an editable table format
                    </p>
                    <ul className="text-sm text-gray-500 space-y-1">
                      <li>• Quick data entry in table format</li>
                      <li>• Add rows as needed</li>
                      <li>• Real-time validation</li>
                      <li>• Auto-generated Product IDs</li>
                    </ul>
                  </button>

                  <button
                    onClick={() => handleMethodSelect('import')}
                    className="p-8 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors text-left"
                  >
                    <div className="flex items-center mb-4">
                      <Upload className="w-8 h-8 text-green-600 mr-3" />
                      <h4 className="text-lg font-semibold text-gray-900">File Import</h4>
                    </div>
                    <p className="text-gray-600 mb-4">
                      Import products from CSV or Excel files
                    </p>
                    <ul className="text-sm text-gray-500 space-y-1">
                      <li>• Support for CSV and Excel files</li>
                      <li>• Template download available</li>
                      <li>• Bulk import validation</li>
                      <li>• Import up to 1000 products</li>
                    </ul>
                  </button>
                </div>
              </div>
            )}

            {/* Bulk Entry Interface */}
            {entryMethod === 'bulk' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Bulk Entry Table</h3>
                    <p className="text-sm text-gray-600">
                      {filledProducts} products ready • Product IDs will be auto-generated
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => addBulkRows(5)}
                      className="flex items-center px-3 py-2 text-blue-600 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add 5 Rows
                    </button>
                    <button
                      onClick={handleBulkSave}
                      disabled={loading || hasErrors || filledProducts === 0}
                      className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
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
                </div>

                <div className="flex-1 overflow-auto p-6">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-48">Product Name *</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-40">Category *</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Quantity</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Unit Price *</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-48">Description</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-16">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {products.map((product, index) => (
                          <tr key={product.id} className={`hover:bg-gray-50 ${product.errors ? 'bg-red-50' : ''}`}>
                            <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                            <td className="px-4 py-3">
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
                                value={product.quantity}
                                onChange={(e) => updateProduct(product.id, 'quantity', parseInt(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                min="0"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                step="0.01"
                                value={product.price}
                                onChange={(e) => updateProduct(product.id, 'price', parseFloat(e.target.value) || 0)}
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
                              <button
                                onClick={() => removeProduct(product.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
              </div>
            )}

            {/* File Import Interface */}
            {entryMethod === 'import' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">File Import</h3>
                    <p className="text-sm text-gray-600">
                      Import products from CSV or Excel files (up to 1000 records)
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={downloadTemplate}
                      className="flex items-center px-4 py-2 text-blue-600 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Template
                    </button>
                    {file && importRecords.length > 0 && (
                      <button
                        onClick={handleImport}
                        disabled={loading || importStats.errors === importStats.total}
                        className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {loading ? (
                          'Importing...'
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Import {importStats.total - importStats.errors} Records
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-6">
                  {!file ? (
                    <div
                      className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
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
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Upload your file
                      </h3>
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
                        Required columns: Product Name, Category, Quantity, Unit Price, Description
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Import Stats */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                              <Upload className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600">Total Records</p>
                              <p className="text-xl font-bold text-gray-900">{importStats.total}</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                              <Check className="w-4 h-4 text-green-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600">Valid</p>
                              <p className="text-xl font-bold text-gray-900">{importStats.total - importStats.errors}</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center mr-3">
                              <AlertCircle className="w-4 h-4 text-red-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600">Errors</p>
                              <p className="text-xl font-bold text-gray-900">{importStats.errors}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Import Preview */}
                      <div className="bg-white border rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200">
                          <h4 className="text-sm font-medium text-gray-900">Import Preview</h4>
                        </div>
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Name</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {importRecords.map((record) => (
                                <tr key={record.id} className={`${
                                  record.status === 'error' ? 'bg-red-50' : 
                                  record.status === 'success' ? 'bg-green-50' : 'hover:bg-gray-50'
                                }`}>
                                  <td className="px-4 py-2 text-sm text-gray-900">{record.row}</td>
                                  <td className="px-4 py-2">
                                    {record.status === 'success' && (
                                      <Check className="w-4 h-4 text-green-600" />
                                    )}
                                    {record.status === 'error' && (
                                      <AlertCircle className="w-4 h-4 text-red-600" />
                                    )}
                                    {record.status === 'pending' && (
                                      <div className="w-4 h-4 bg-gray-300 rounded-full" />
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900">{record.name}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900">
                                    {categories.find(c => c.category_id === record.category_id)?.category_name || 'Invalid'}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900">{record.quantity}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900">${record.price.toFixed(2)}</td>
                                  <td className="px-4 py-2 text-sm text-red-600">
                                    {record.errors?.join(', ')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}