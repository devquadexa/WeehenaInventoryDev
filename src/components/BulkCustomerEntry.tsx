import React, { useState, useEffect } from 'react'
import { Plus, Save, Trash2, X, Upload, Download, AlertCircle } from 'lucide-react'
import { supabase, Customer, ContactPerson } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

interface CustomerEntry {
  id: string
  name: string
  address: string
  email: string
  phone_number: string
  contact_person_name: string
  contact_person_phone: string
  type: 'Cash' | 'Credit'
  customer_category: string // Changed from 'Dealer' | 'Hotel' | 'Other' to string
  vat_status: 'VAT' | 'Non-VAT'
  tin_number: string
  errors?: string[]
}

interface ImportRecord extends CustomerEntry {
  row: number
  status?: 'pending' | 'success' | 'error'
}

interface BulkCustomerEntryProps {
  onClose: () => void
  onCustomersAdded: () => void
}

export const BulkCustomerEntry: React.FC<BulkCustomerEntryProps> = ({ onClose, onCustomersAdded }) => {
  const { isOnline } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bulkCustomers, setBulkCustomers] = useState<CustomerEntry[]>([])
  const [importRecords, setImportRecords] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [showFileImport, setShowFileImport] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importStats, setImportStats] = useState({ total: 0, success: 0, errors: 0 })
  const [availableCustomerCategories, setAvailableCustomerCategories] = useState<string[]>(['Dealer', 'Hotel', 'Other']); // Default, will be fetched

  useEffect(() => {
    fetchCustomers()
    initializeBulkEntry()
    fetchCustomerCategories() // Fetch customer categories on mount
  }, [])

  const fetchCustomerCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('customer_categories')
        .single();

      if (error) throw error;
      setAvailableCustomerCategories(data.customer_categories || ['Dealer', 'Hotel', 'Other']);
    } catch (err) {
      console.error('Error fetching customer categories, using default:', err);
      setAvailableCustomerCategories(['Dealer', 'Hotel', 'Other']); // Fallback
    }
  };

  const fetchCustomers = async () => {
    try {
      const cacheKey = 'bulk_customer_entry_customers'
      if (!isOnline) {
        const cachedData = localStorage.getItem(cacheKey)
        if (cachedData) {
          setCustomers(JSON.parse(cachedData))
          return
        }
      }

      const { data, error } = await supabase
        .from('customers')
        .select('id, type')
        .order('name')

      if (error) throw error

      localStorage.setItem(cacheKey, JSON.stringify(data))
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
      const cachedData = localStorage.getItem('bulk_customer_entry_customers')
      if (cachedData) {
        setCustomers(JSON.parse(cachedData))
      } else {
        setCustomers([])
      }
    }
  }

  const initializeBulkEntry = () => {
    const initialCustomer: CustomerEntry = {
      id: 'customer-0',
      name: '',
      address: '',
      email: '',
      phone_number: '',
      contact_person_name: '',
      contact_person_phone: '',
      type: 'Cash',
      customer_category: 'Dealer', // Default to 'Dealer'
      vat_status: 'Non-VAT',
      tin_number: ''
    }
    setBulkCustomers([initialCustomer])
  }

  const addBulkRows = (count: number = 1) => {
    const newRows: CustomerEntry[] = Array.from({ length: count }, (_, index) => ({
      id: `customer-${bulkCustomers.length + index}`,
      name: '',
      address: '',
      email: '',
      phone_number: '',
      contact_person_name: '',
      contact_person_phone: '',
      type: 'Cash',
      customer_category: 'Dealer', // Default to 'Dealer'
      vat_status: 'Non-VAT',
      tin_number: ''
    }))
    setBulkCustomers([...bulkCustomers, ...newRows])
  }

  const updateBulkCustomer = (id: string, field: keyof CustomerEntry, value: any) => {
    setBulkCustomers(bulkCustomers.map(customer => 
      customer.id === id 
        ? { ...customer, [field]: value, errors: undefined }
        : customer
    ))
  }

  const removeBulkCustomer = (id: string) => {
    if (bulkCustomers.length > 1) {
      setBulkCustomers(bulkCustomers.filter(customer => customer.id !== id))
    }
  }

  const validateBulkCustomers = (): CustomerEntry[] => {
    return bulkCustomers.map(customer => {
      const errors: string[] = []
      
      if (customer.name && !customer.address.trim()) {
        errors.push('Address is required')
      }
      if (customer.name && !customer.phone_number.trim()) {
        errors.push('Main phone number is required')
      }
      if (customer.name && !customer.contact_person_name.trim()) {
        errors.push('Contact person name is required')
      }
      if (customer.name && !customer.contact_person_phone.trim()) {
        errors.push('Contact person phone is required')
      }
      if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
        errors.push('Invalid email format')
      }
      if (customer.vat_status === 'VAT' && !customer.tin_number.trim()) {
        errors.push('TIN number is required for VAT customers')
      }

      return { ...customer, errors: errors.length > 0 ? errors : undefined }
    })
  }

  const handleBulkSave = async () => {
    setLoading(true)
    try {
      const validatedCustomers = validateBulkCustomers()
      const customersToSave = validatedCustomers.filter(c => 
        c.name.trim() !== '' && (!c.errors || c.errors.length === 0)
      )

      if (customersToSave.length === 0) {
        alert('No valid customers to save')
        return
      }

      // Check for cash customer limit
      const cashCustomersToAdd = customersToSave.filter(c => c.type === 'Cash')
      const existingCashCustomer = customers.find(c => c.type === 'Cash')
      
      if (cashCustomersToAdd.length > 1) {
        alert('Only one Cash Customer is allowed')
        return
      }
      
      if (cashCustomersToAdd.length === 1 && existingCashCustomer) {
        alert('A Cash Customer already exists')
        return
      }

      // Insert customers and their contact persons
      for (const customer of customersToSave) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .insert([{
            name: customer.name,
            address: customer.address,
            phone_number: customer.phone_number,
            type: customer.type,
            customer_category: customer.customer_category,
            vat_status: customer.vat_status,
            tin_number: customer.vat_status === 'VAT' ? customer.tin_number : null
          }])
          .select()
          .single()

        if (customerError) throw customerError

        // Insert contact person
        if (customer.contact_person_name && customer.contact_person_phone) {
          const { error: contactError } = await supabase
            .from('contact_persons')
            .insert([{
              customer_id: customerData.id,
              name: customer.contact_person_name,
              phone_number: customer.contact_person_phone
            }])

          if (contactError) throw contactError
        }
      }

      alert(`Successfully saved ${customersToSave.length} customers`)
      onCustomersAdded()
      onClose()
    } catch (error) {
      console.error('Error saving customers:', error)
      alert('Failed to save customers. Please try again.')
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
      const requiredHeaders = ['company name', 'company address', 'email', 'main phone', 'contact person name', 'contact person phone', 'type', 'customer category', 'vat status', 'tin number']
      
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
      if (missingHeaders.length > 0) {
        alert(`Missing required columns: ${missingHeaders.join(', ')}`)
        return
      }

      const parsedRecords: ImportRecord[] = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim())
        const rawCustomerType = values[headers.indexOf('type')] || 'Cash'
        
        // Convert to proper case format to match database constraint
        let customerType: 'Cash' | 'Credit' = 'Cash'
        const normalizedType = rawCustomerType.toLowerCase().trim().replace(/\s+/g, ' ').replace(/\u00A0/g, ' ')
        
        switch (normalizedType) {
          case 'cash':
            customerType = 'Cash'
            break
          case 'credit':
            customerType = 'Credit'
            break
          default:
            customerType = 'Cash' // Default fallback to Cash if invalid type is provided
        }

        // Parse customer category
        const rawCustomerCategory = values[headers.indexOf('customer category')] || 'Other'; // Default to 'Other'
        let customerCategory: string = 'Other'; // Default
        const normalizedCategory = rawCustomerCategory.toLowerCase().trim();

        // Check if the normalized category exists in availableCustomerCategories
        const foundCategory = availableCustomerCategories.find(cat => cat.toLowerCase() === normalizedCategory);
        if (foundCategory) {
          customerCategory = foundCategory;
        } else {
          // If not found, default to 'Other' or the first available category
          customerCategory = availableCustomerCategories.includes('Other') ? 'Other' : availableCustomerCategories[0] || 'Other';
        }

        // Parse VAT status
        const rawVatStatus = values[headers.indexOf('vat status')] || 'Non-VAT'
        let vatStatus: 'VAT' | 'Non-VAT' = 'Non-VAT'
        const normalizedVatStatus = rawVatStatus.toLowerCase().trim()
        if (normalizedVatStatus === 'vat') {
          vatStatus = 'VAT'
        }

        // Parse TIN number
        const tinNumber = values[headers.indexOf('tin number')] || ''
        
        const record: ImportRecord = {
          id: `import-${index}`,
          row: index + 2,
          name: values[headers.indexOf('company name')] || '',
          address: values[headers.indexOf('company address')] || '',
          email: values[headers.indexOf('email')] || '',
          phone_number: values[headers.indexOf('main phone')] || '',
          contact_person_name: values[headers.indexOf('contact person name')] || '',
          contact_person_phone: values[headers.indexOf('contact person phone')] || '',
          type: customerType,
          customer_category: customerCategory,
          vat_status: vatStatus,
          tin_number: tinNumber,
          status: 'pending'
        }

        // Validate record
        const errors: string[] = []
        if (!record.name) errors.push('Company name is required')
        if (!record.address) errors.push('Address is required')
        if (!record.phone_number) errors.push('Main phone number is required')
        if (!record.contact_person_name) errors.push('Contact person name is required')
        if (!record.contact_person_phone) errors.push('Contact person phone is required')
        if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
          errors.push('Invalid email format')
        }
        if (record.vat_status === 'VAT' && !record.tin_number.trim()) {
          errors.push('TIN number is required for VAT customers')
        }

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

    // Check cash customer limit
    const cashRecords = validRecords.filter(r => r.type === 'Cash')
    const existingCashCustomer = customers.find(c => c.type === 'Cash')
    
    if (cashRecords.length > 1) {
      alert('Only one Cash Customer is allowed in the import')
      return
    }
    
    if (cashRecords.length === 1 && existingCashCustomer) {
      alert('A Cash Customer already exists')
      return
    }

    setLoading(true)
    let successCount = 0
    let errorCount = 0

    try {
      // Insert customers and their contact persons
      for (const record of validRecords) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .insert([{
            name: record.name,
            address: record.address,
            phone_number: record.phone_number,
            type: record.type,
            customer_category: record.customer_category,
            vat_status: record.vat_status,
            tin_number: record.vat_status === 'VAT' ? record.tin_number : null
          }])
          .select()
          .single()

        if (customerError) throw customerError

        // Insert contact person
        if (record.contact_person_name && record.contact_person_phone) {
          const { error: contactError } = await supabase
            .from('contact_persons')
            .insert([{
              customer_id: customerData.id,
              name: record.contact_person_name,
              phone_number: record.contact_person_phone
            }])

          if (contactError) throw contactError
        }
      }

      successCount = validRecords.length
      setImportStats({ total: importRecords.length, success: successCount, errors: errorCount })

      alert(`Import completed: ${successCount} successful`)
      onCustomersAdded()
      onClose()
    } catch (error) {
      console.error('Import failed:', error)
      alert('Import failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = () => {
    const headers = ['Company Name', 'Company Address', 'Email', 'Main Phone', 'Contact Person Name', 'Contact Person Phone', 'Type (Cash/Credit)', `Customer Category (${availableCustomerCategories.join('/')})`, 'VAT Status (VAT/Non-VAT)', 'TIN Number'] // Dynamic categories
    const sampleData = [
      `ABC Company,123 Main St,info@abc.com,+1234567890,John Doe,+1234567891,Credit,Dealer,VAT,123456789`,
      `XYZ Corp,456 Oak Ave,contact@xyz.com,+0987654321,Jane Smith,+0987654322,Cash,Hotel,Non-VAT,`,
      `New Customer,789 Pine Ln,new@example.com,+1122334455,Bob Johnson,+1122334456,Credit,Other,VAT,987654321`
    ]
    
    const csvContent = [headers.join(','), ...sampleData].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'customer_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasErrors = bulkCustomers.some(c => c.errors && c.errors.length > 0)
  const filledCustomers = bulkCustomers.filter(c => c.name.trim() !== '').length

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Add Customers</h2>
            <p className="text-sm text-gray-600">
              {filledCustomers} customers ready
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
            onClick={handleBulkSave}
            disabled={loading || hasErrors || filledCustomers === 0}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading ? (
              'Saving...'
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Customers
              </>
            )}
          </button>
        </div>

        {/* Bulk Entry Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Mobile Card Layout */}
          <div className="block md:hidden">
            <div className="space-y-4">
              {bulkCustomers.map((customer, index) => (
                <div key={customer.id} className={`bg-white border rounded-lg p-4 ${customer.errors ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-gray-500">Customer #{index + 1}</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => addBulkRows(1)}
                        className="p-2.5 text-green-600 bg-green-100 rounded-full hover:bg-green-200 touch-manipulation"
                        title="Add new customer"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => removeBulkCustomer(customer.id)}
                        className="p-2.5 text-red-600 bg-red-100 rounded-full hover:bg-red-200 touch-manipulation"
                        disabled={bulkCustomers.length === 1}
                        title="Remove customer"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Customer Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company Name *
                      </label>
                      <input
                        type="text"
                        value={customer.name}
                        onChange={(e) => updateBulkCustomer(customer.id, 'name', e.target.value)}
                        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                        placeholder="Enter company name"
                      />
                    </div>

                    {/* Address */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company Address *
                      </label>
                      <textarea
                        value={customer.address}
                        onChange={(e) => updateBulkCustomer(customer.id, 'address', e.target.value)}
                        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                        placeholder="Enter company address"
                        rows={2}
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={customer.email}
                        onChange={(e) => updateBulkCustomer(customer.id, 'email', e.target.value)}
                        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                        placeholder="Enter company email"
                      />
                    </div>

                    {/* Main Phone */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Main Phone Number *
                      </label>
                      <input
                        type="tel"
                        value={customer.phone_number}
                        onChange={(e) => updateBulkCustomer(customer.id, 'phone_number', e.target.value)}
                        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                        placeholder="Enter main phone number"
                      />
                    </div>

                    {/* Contact Person Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Person's Name *
                        </label>
                        <input
                          type="text"
                          value={customer.contact_person_name}
                          onChange={(e) => updateBulkCustomer(customer.id, 'contact_person_name', e.target.value)}
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                          placeholder="Enter contact person's name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Person's Phone *
                        </label>
                        <input
                          type="tel"
                          value={customer.contact_person_phone}
                          onChange={(e) => updateBulkCustomer(customer.id, 'contact_person_phone', e.target.value)}
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                          placeholder="Enter contact person's phone"
                        />
                      </div>
                    </div>

                    {/* Customer Category */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Category
                      </label>
                      <select
                        value={customer.customer_category}
                        onChange={(e) => updateBulkCustomer(customer.id, 'customer_category', e.target.value)}
                        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                      >
                        {availableCustomerCategories.map(category => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </div>

                    {/* VAT Status */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        VAT Status
                      </label>
                      <select
                        value={customer.vat_status}
                        onChange={(e) => updateBulkCustomer(customer.id, 'vat_status', e.target.value as 'VAT' | 'Non-VAT')}
                        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                      >
                        <option value="Non-VAT">Non-VAT</option>
                        <option value="VAT">VAT</option>
                      </select>
                    </div>

                    {/* TIN Number (Conditional) */}
                    {customer.vat_status === 'VAT' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          TIN Number *
                        </label>
                        <input
                          type="text"
                          value={customer.tin_number}
                          onChange={(e) => updateBulkCustomer(customer.id, 'tin_number', e.target.value)}
                          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                          placeholder="Enter TIN number"
                          required={customer.vat_status === 'VAT'}
                        />
                      </div>
                    )}

                    {/* Customer Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Type
                      </label>
                      <select
                        value={customer.type}
                        onChange={(e) => updateBulkCustomer(customer.id, 'type', e.target.value)}
                        className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Credit">Credit</option>
                      </select>
                    </div>

                    {/* Error Display */}
                    {customer.errors && (
                      <div className="p-3 bg-red-100 border border-red-300 rounded-lg">
                        <div className="flex items-center">
                          <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                          <div className="text-sm text-red-700">
                            {customer.errors.join(', ')}
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-64">Company Name *</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-64">Company Address *</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-48">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-40">Main Phone *</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-40">Contact Person *</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-40">Contact Phone *</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-32">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-32">VAT Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-40">TIN Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-32">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bulkCustomers.map((customer, index) => (
                    <tr key={customer.id} className={`hover:bg-gray-50 ${customer.errors ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={customer.name}
                          onChange={(e) => updateBulkCustomer(customer.id, 'name', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Enter company name"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={customer.address}
                          onChange={(e) => updateBulkCustomer(customer.id, 'address', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Enter address"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="email"
                          value={customer.email}
                          onChange={(e) => updateBulkCustomer(customer.id, 'email', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Enter email"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="tel"
                          value={customer.phone_number}
                          onChange={(e) => updateBulkCustomer(customer.id, 'phone_number', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Enter main phone"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={customer.contact_person_name}
                          onChange={(e) => updateBulkCustomer(customer.id, 'contact_person_name', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Contact person"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="tel"
                          value={customer.contact_person_phone}
                          onChange={(e) => updateBulkCustomer(customer.id, 'contact_person_phone', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Contact phone"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={customer.customer_category}
                          onChange={(e) => updateBulkCustomer(customer.id, 'customer_category', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {availableCustomerCategories.map(category => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={customer.vat_status}
                          onChange={(e) => updateBulkCustomer(customer.id, 'vat_status', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="Non-VAT">Non-VAT</option>
                          <option value="VAT">VAT</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={customer.tin_number}
                          onChange={(e) => updateBulkCustomer(customer.id, 'tin_number', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder={customer.vat_status === 'VAT' ? 'Required' : 'Optional'}
                          disabled={customer.vat_status !== 'VAT'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={customer.type}
                          onChange={(e) => updateBulkCustomer(customer.id, 'type', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="Cash">Cash</option>
                          <option value="Credit">Credit</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => removeBulkCustomer(customer.id)}
                            className="p-2 text-red-600 hover:text-red-800 rounded-full hover:bg-red-50"
                            disabled={bulkCustomers.length === 1}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => addBulkRows(1)}
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
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full p-6">
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

              {!file ? (
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
                    Required columns: Company Name, Company Address, Email, Main Phone, Contact Person Name, Contact Person Phone, Type, Customer Category, VAT Status, TIN Number
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
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
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company Name</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Main Phone</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact Person</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact Phone</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">VAT Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">TIN Number</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {importRecords.map((record) => (
                            <tr key={record.id} className={`${
                              record.status === 'error' ? 'bg-red-50' : 'hover:bg-gray-50'
                            }`}>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.row}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.name}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.address}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.email}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.phone_number}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.contact_person_name}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.contact_person_phone}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.type}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.customer_category}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.vat_status}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{record.tin_number}</td>
                              <td className="px-4 py-2 text-sm text-red-600">
                                {record.errors?.join(', ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button
                    onClick={handleImport}
                    disabled={loading || importStats.errors === importStats.total}
                    className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
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
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}