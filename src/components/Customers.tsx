import React, { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Search, User } from 'lucide-react'
import { supabase, Customer, ContactPerson } from '../lib/supabase'
import { BulkCustomerEntry } from './BulkCustomerEntry'
import { useAuth } from '../hooks/useAuth' // Import useAuth to get isOnline status

interface ContactPersonEntry {
  id: string
  name: string
  phone_number: string
}

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>([])
  const [loading, setLoading] = useState(true)
  const { isOnline } = useAuth() // Get online status
  const [showModal, setShowModal] = useState(false)
  const [showBulkEntry, setShowBulkEntry] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [availableCustomerCategories, setAvailableCustomerCategories] = useState<string[]>(['Dealer', 'Hotel', 'Other']); // Default, will be fetched
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone_number: '',
    email: '', // Ensure email is also in formData
    type: 'Cash' as 'Cash' | 'Credit',
    customer_category: 'Dealer' as string, // Changed to string, default to 'Dealer'
    vat_status: 'Non-VAT' as 'VAT' | 'Non-VAT', // New
    tin_number: '' // New
  })
  const [contactPersonsData, setContactPersonsData] = useState<ContactPersonEntry[]>([
    { id: 'temp-1', name: '', phone_number: '' }
  ])
  const [isCustomersFromCache, setIsCustomersFromCache] = useState(false)
  const [isContactPersonsFromCache, setIsContactPersonsFromCache] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    fetchCustomers()
    fetchContactPersons()
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
    setFetchError(null)
    setIsCustomersFromCache(false)
    const cacheKey = 'customers_data'

    if (!isOnline) {
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setCustomers(JSON.parse(cachedData))
        setIsCustomersFromCache(true)
        setLoading(false)
        return
      }
    }

    try {
      console.log('Fetching customers...')
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, address, phone_number, email, customer_display_id, type, customer_category, vat_status, tin_number')
        .order('name')

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }
      
      console.log('Customers fetched:', data)
      localStorage.setItem(cacheKey, JSON.stringify(data))
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
      setFetchError('Failed to load customers. Please check your database connection.')
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setCustomers(JSON.parse(cachedData))
        setIsCustomersFromCache(true)
      } else {
        setCustomers([])
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchContactPersons = async () => {
    setIsContactPersonsFromCache(false)
    const cacheKey = 'contact_persons_data'

    if (!isOnline) {
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setContactPersons(JSON.parse(cachedData))
        setIsContactPersonsFromCache(true)
        return
      }
    }

    try {
      console.log('Fetching contact persons...')
      const { data, error } = await supabase
        .from('contact_persons')
        .select('id, customer_id, name, phone_number')
        .order('name')

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }
      
      console.log('Contact persons fetched:', data)
      localStorage.setItem(cacheKey, JSON.stringify(data))
      setContactPersons(data || [])
    } catch (error) {
      console.error('Error fetching contact persons:', error)
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setContactPersons(JSON.parse(cachedData))
        setIsContactPersonsFromCache(true)
      } else {
        setContactPersons([])
      }
    }
  }

  const handleOpenBulkEntry = () => {
    setShowBulkEntry(true)
  }

  const addContactPerson = () => {
    const newId = `temp-${Date.now()}`
    setContactPersonsData([...contactPersonsData, { id: newId, name: '', phone_number: '' }])
  }

  const removeContactPerson = (id: string) => {
    if (contactPersonsData.length > 1) {
      setContactPersonsData(contactPersonsData.filter(cp => cp.id !== id))
    }
  }

  const updateContactPerson = (id: string, field: 'name' | 'phone_number', value: string) => {
    setContactPersonsData(contactPersonsData.map(cp => 
      cp.id === id ? { ...cp, [field]: value } : cp
    ))
  }

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Check if trying to add another Cash customer
      if (formData.type === 'Cash' && !editingCustomer) {
        const existingCash = customers.find(c => c.type === 'Cash')
        if (existingCash) {
          alert('Only one Cash Customer is allowed')
          setLoading(false)
          return
        }
      }

      // Validate contact persons
      const validContactPersons = contactPersonsData.filter(cp => cp.name.trim() && cp.phone_number.trim())
      if (validContactPersons.length === 0) {
        alert('At least one contact person is required')
        setLoading(false)
        return
      }

      // Validate TIN number if VAT status is VAT
      if (formData.vat_status === 'VAT' && !formData.tin_number.trim()) {
        alert('TIN number is required for VAT customers')
        setLoading(false)
        return
      }

      const customerData = {
        name: formData.name,
        address: formData.address,
        phone_number: formData.phone_number,
        email: formData.email,
        type: formData.type,
        customer_category: formData.customer_category,
        vat_status: formData.vat_status,
        tin_number: formData.vat_status === 'VAT' ? formData.tin_number : null
      }

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', editingCustomer.id)

        if (error) throw error

        // Update contact persons
        // First, delete existing contact persons for this customer
        await supabase
          .from('contact_persons')
          .delete()
          .eq('customer_id', editingCustomer.id)

        // Then insert new contact persons
        if (validContactPersons.length > 0) {
          const contactPersonsToInsert = validContactPersons.map(cp => ({
            customer_id: editingCustomer.id,
            name: cp.name,
            phone_number: cp.phone_number
          }))

          await supabase
            .from('contact_persons')
            .insert(contactPersonsToInsert)
        }
      } else {
        const { data: newCustomerData, error } = await supabase
          .from('customers')
          .insert([customerData])
          .select()
          .single()

        if (error) throw error

        // Insert contact persons
        if (validContactPersons.length > 0) {
          const contactPersonsToInsert = validContactPersons.map(cp => ({
            customer_id: newCustomerData.id,
            name: cp.name,
            phone_number: cp.phone_number
          }))

          await supabase
            .from('contact_persons')
            .insert(contactPersonsToInsert)
        }
      }

      await fetchCustomers()
      await fetchContactPersons()
      setShowModal(false)
      setEditingCustomer(null)
      setFormData({ 
        name: '', 
        address: '', 
        phone_number: '', 
        email: '',
        type: 'Cash',
        customer_category: 'Dealer',
        vat_status: 'Non-VAT',
        tin_number: ''
      })
      setContactPersonsData([{ id: 'temp-1', name: '', phone_number: '' }])
    } catch (error) {
      console.error('Error saving customer:', error)
      if (error && typeof error === 'object' && 'message' in error) {
        alert(`Failed to save customer: ${error.message}`)
      } else {
        alert('Failed to save customer. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return

    try {
      // Delete contact persons first (cascade should handle this, but being explicit)
      await supabase
        .from('contact_persons')
        .delete()
        .eq('customer_id', id)

      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id)

      if (error) throw error
      await fetchCustomers()
      await fetchContactPersons()
    } catch (error) {
      console.error('Error deleting customer:', error)
    }
  }

  const handleEditCustomer = async (customer: Customer) => {
    setEditingCustomer(customer)
    setFormData({
      name: customer.name,
      address: customer.address,
      phone_number: customer.phone_number,
      email: customer.email || '',
      type: customer.type,
      customer_category: customer.customer_category,
      vat_status: customer.vat_status,
      tin_number: customer.tin_number || ''
    })

    // Fetch contact persons for this customer
    try {
      const { data: customerContactPersons, error } = await supabase
        .from('contact_persons')
        .select('id, name, phone_number')
        .eq('customer_id', customer.id)
        .order('name')

      if (error) throw error

      if (customerContactPersons && customerContactPersons.length > 0) {
        setContactPersonsData(customerContactPersons.map(cp => ({
          id: cp.id,
          name: cp.name,
          phone_number: cp.phone_number
        })))
      } else {
        setContactPersonsData([{ id: 'temp-1', name: '', phone_number: '' }])
      }
    } catch (error) {
      console.error('Error fetching contact persons:', error)
      setContactPersonsData([{ id: 'temp-1', name: '', phone_number: '' }])
    }

    setShowModal(true)
  }

  const getCustomerContactPersons = (customerId: string) => {
    return contactPersons.filter(cp => cp.customer_id === customerId)
  }

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.customer_display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    customer.customer_category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.vat_status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer.tin_number && customer.tin_number.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (loading && customers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading customers...</div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">{fetchError}</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Customer Management</h1>
        <button
          onClick={handleOpenBulkEntry}
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Customers
        </button>
      </div>

      {/* Bulk Entry Modal */}
      {showBulkEntry && (
        <BulkCustomerEntry 
          onClose={() => setShowBulkEntry(false)}
          onCustomersAdded={fetchCustomers}
        />
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>

      {isCustomersFromCache && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center">
            <span className="text-yellow-800 text-sm">
              Data may be outdated (from cache)
            </span>
          </div>
        </div>
      )}

      {/* Customers Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Mobile Card Layout */}
        <div className="block md:hidden">
          <div className="space-y-2">
            {filteredCustomers.map((customer) => (
              <div key={customer.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {customer.name}
                      </h3>
                      <div className="flex items-center mt-1 space-x-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          customer.type === 'Cash'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-blue-100 text-blue-800' // For Credit
                        }`}>
                          {customer.type}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800`}>
                          {customer.customer_category}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          customer.vat_status === 'VAT'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {customer.vat_status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-3">
                    <button
                      onClick={() => handleEditCustomer(customer)}
                      className="p-2.5 text-blue-600 bg-blue-100 rounded-full hover:bg-blue-200 touch-manipulation"
                      title="Edit customer"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCustomer(customer.id)}
                      className="p-2.5 text-red-600 bg-red-100 rounded-full hover:bg-red-200 touch-manipulation"
                      title="Delete customer"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-1 text-sm ml-11">
                  <div className="flex items-start">
                    <span className="text-gray-500 font-medium w-16 flex-shrink-0">Company:</span>
                    <span className="text-gray-700 flex-1">{customer.address}</span>
                  </div>
                  {customer.email && (
                    <div className="flex items-start">
                      <span className="text-gray-500 font-medium w-16 flex-shrink-0">Email:</span>
                      <span className="text-gray-700 flex-1">{customer.email}</span>
                    </div>
                  )}
                  <div className="flex items-center">
                    <span className="text-gray-500 font-medium w-16 flex-shrink-0">Main:</span>
                    <a href={`tel:${customer.phone_number}`} className="text-blue-600 hover:text-blue-800 font-medium">
                      {customer.phone_number}
                    </a>
                  </div>
                  {customer.tin_number && (
                    <div className="flex items-start">
                      <span className="text-gray-500 font-medium w-16 flex-shrink-0">TIN:</span>
                      <span className="text-gray-700 flex-1">{customer.tin_number}</span>
                    </div>
                  )}
                  {getCustomerContactPersons(customer.id).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <span className="text-gray-500 font-medium text-sm">Contacts:</span>
                      {getCustomerContactPersons(customer.id).slice(0, 2).map((contact, idx) => (
                        <div key={contact.id} className="flex items-center mt-1">
                          <span className="text-gray-600 text-sm">{contact.name}</span>
                          <span className="text-gray-400 mx-1">•</span>
                          <a href={`tel:${contact.phone_number}`} className="text-blue-600 text-sm">
                            {contact.phone_number}
                          </a>
                        </div>
                      ))}
                      {getCustomerContactPersons(customer.id).length > 2 && (
                        <div className="text-gray-400 text-sm mt-1">
                          +{getCustomerContactPersons(customer.id).length - 2} more
                        </div>
                      )}
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
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Main Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact Persons
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    VAT Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    TIN Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCustomers.map((customer, index) => (
                  <tr key={customer.id} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="w-8 h-8 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                          <div className="text-sm text-gray-500">
                            {customer.type} Customer
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {customer.customer_display_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {customer.address}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {customer.email || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {customer.phone_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {getCustomerContactPersons(customer.id).length > 0 ? (
                        <div className="space-y-1">
                          {getCustomerContactPersons(customer.id).slice(0, 2).map((contact) => (
                            <div key={contact.id} className="text-xs">
                              <span className="font-medium">{contact.name}</span>
                              <span className="text-gray-500 ml-2">{contact.phone_number}</span>
                            </div>
                          ))}
                          {getCustomerContactPersons(customer.id).length > 2 && (
                            <div className="text-xs text-gray-400">
                              +{getCustomerContactPersons(customer.id).length - 2} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800`}>
                        {customer.customer_category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        customer.vat_status === 'VAT'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {customer.vat_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {customer.tin_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        customer.type === 'Cash'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800' // For Credit
                      }`}>
                        {customer.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditCustomer(customer)}
                          className="p-2 text-blue-600 hover:text-blue-900 rounded-full hover:bg-blue-100"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(customer.id)}
                          className="p-2 text-red-600 hover:text-red-900 rounded-full hover:bg-red-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h2>
            
            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Enter company name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Enter company address"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Enter company email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Main Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Enter main phone number"
                  required
                />
              </div>

              {/* Customer Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Category
                </label>
                <select
                  value={formData.customer_category}
                  onChange={(e) => setFormData({ ...formData, customer_category: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  {availableCustomerCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* VAT Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  VAT Status
                </label>
                <div className="flex space-x-4">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      value="VAT"
                      checked={formData.vat_status === 'VAT'}
                      onChange={(e) => setFormData({ ...formData, vat_status: e.target.value as 'VAT' | 'Non-VAT' })}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">VAT</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      value="Non-VAT"
                      checked={formData.vat_status === 'Non-VAT'}
                      onChange={(e) => setFormData({ ...formData, vat_status: e.target.value as 'VAT' | 'Non-VAT' })}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Non-VAT</span>
                  </label>
                </div>
              </div>

              {/* TIN Number (Conditional) */}
              {formData.vat_status === 'VAT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    TIN Number
                  </label>
                  <input
                    type="text"
                    value={formData.tin_number}
                    onChange={(e) => setFormData({ ...formData, tin_number: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Enter TIN number"
                    required={formData.vat_status === 'VAT'}
                  />
                </div>
              )}

              {/* Contact Persons Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Contact Persons
                  </label>
                  <button
                    type="button"
                    onClick={addContactPerson}
                    className="px-2 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium rounded-md hover:bg-blue-50"
                  >
                    + Add Another Contact
                  </button>
                </div>
                <div className="space-y-3">
                  {contactPersonsData.map((contact, index) => (
                    <div key={contact.id} className="p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Contact {index + 1}</span>
                        {contactPersonsData.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeContactPerson(contact.id)}
                            className="px-2 py-1 text-sm text-red-600 hover:text-red-800 rounded-md hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Contact Person's Name
                          </label>
                          <input
                            type="text"
                            value={contact.name}
                            onChange={(e) => updateContactPerson(contact.id, 'name', e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="Enter contact person's name"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Contact Person's Phone
                          </label>
                          <input
                            type="tel"
                            value={contact.phone_number}
                            onChange={(e) => updateContactPerson(contact.id, 'phone_number', e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="Enter contact person's phone"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'Cash' | 'Credit' })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="Cash">Cash</option>
                  <option value="Credit">Credit</option>
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingCustomer(null)
                    setFormData({ 
                      name: '', 
                      address: '', 
                      phone_number: '', 
                      email: '',
                      type: 'Cash',
                      customer_category: 'Dealer',
                      vat_status: 'Non-VAT',
                      tin_number: ''
                    })
                    setContactPersonsData([{ id: 'temp-1', name: '', phone_number: '' }])
                  }}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Saving...' : editingCustomer ? 'Update Company' : 'Add Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}