import React, { useState, useEffect } from 'react'
import { ArrowRight, ShoppingCart, Receipt, Check, Search, Package } from 'lucide-react'
import { supabase, Customer, Product, User, Vehicle } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

interface CartItem {
  product: Product
  quantity: number
  selectedPrice: number
  isCustomPrice: boolean // New field to track if price was manually edited
}

export const ServiceCustomer: React.FC = () => {
  const { user } = useAuth()
  const [step, setStep] = useState(1) // 1: Select Customer, 2: Add Products, 3: Review Order
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)
  const [salesReps, setSalesReps] = useState<User[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([]) // All available vehicles
  const [selectedSalesRep, setSelectedSalesRep] = useState('') // Sales Rep ID
  const [vehicleInputText, setVehicleInputText] = useState('') // Text input for vehicle number
  const [selectedVehicleObject, setSelectedVehicleObject] = useState<Vehicle | null>(null) // The actual selected vehicle object
  const [filteredVehicleSuggestions, setFilteredVehicleSuggestions] = useState<Vehicle[]>([])
  const [showVehicleSuggestions, setShowVehicleSuggestions] = useState(false)
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [requestId, setRequestId] = useState('')
  const [isCustomersFromCache, setIsCustomersFromCache] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]) // New state for delivery date
  const [isProductsFromCache, setIsProductsFromCache] = useState(false)
  const [isSalesRepsFromCache, setIsSalesRepsFromCache] = useState(false)
  const [isVehiclesFromCache, setIsVehiclesFromCache] = useState(false)
  const [vatRate, setVatRate] = useState(0.18); // Default to 0.18, will be fetched

  // Remove hardcoded VAT_RATE constant

  useEffect(() => {
    // Always fetch fresh data on mount
    fetchCustomers()
    fetchProducts()
    fetchSalesReps()
    fetchVehicles()
    fetchVatRate() // Fetch VAT rate on mount
  }, []) // Empty dependency array to run once on mount

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

  const fetchCustomers = async () => {
    try {
      setIsCustomersFromCache(false)
      const cacheKey = 'service_customers_data'
      
      // Try to fetch from database first
      const { data, error } = await supabase
        .from('customers')
        .select('*') // Select all columns including the new fields
        .order('name')

      if (error) throw error

      // Save to cache and update state
      localStorage.setItem(cacheKey, JSON.stringify(data))
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
      // Fallback to cache only if database fetch fails
      const cacheKey = 'service_customers_data'
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setCustomers(JSON.parse(cachedData))
        setIsCustomersFromCache(true)
      } else {
        setCustomers([])
      }
    }
  }

  const fetchProducts = async () => {
    try {
      setIsProductsFromCache(false)
      const cacheKey = 'service_products_data'
      
      // Try to fetch from database first
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, name, quantity, sku,
          price_dealer_cash,
          price_dealer_credit,
          price_hotel_cash,
          price_hotel_credit
        `)
        .gt('quantity', 0)
        .order('name')

      if (error) throw error

      // Save to cache and update state
      localStorage.setItem(cacheKey, JSON.stringify(data))
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
      // Fallback to cache only if database fetch fails
      const cacheKey = 'service_products_data'
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setProducts(JSON.parse(cachedData))
        setIsProductsFromCache(true)
      } else {
        setProducts([])
      }
    }
  }

  const fetchSalesReps = async () => {
    try {
      setIsSalesRepsFromCache(false)
      const cacheKey = 'service_sales_reps_data'
      
      // Try to fetch from database first
      const { data, error } = await supabase
        .from('users')
        .select('id, username') // Only need id and username for dropdown
        .eq('role', 'Sales Rep')
        .order('username')

      if (error) throw error

      // Save to cache and update state
      localStorage.setItem(cacheKey, JSON.stringify(data))
      setSalesReps(data || [])
    } catch (error) {
      console.error('Error fetching sales reps:', error)
      // Fallback to cache only if database fetch fails
      const cacheKey = 'service_sales_reps_data'
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setSalesReps(JSON.parse(cachedData))
        setIsSalesRepsFromCache(true)
      } else {
        setSalesReps([])
      }
    }
  }

  // New function to fetch vehicles
  const fetchVehicles = async () => {
    try {
      setIsVehiclesFromCache(false)
      const cacheKey = 'service_vehicles_data'
      
      // Try to fetch from database first
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, vehicle_number, vehicle_type, status, sales_rep_id, sales_rep:users!fk_sales_rep(username)') // Select necessary columns for vehicle management and assignment
        .eq('status', 'Available') // Only show available vehicles
        .order('vehicle_number')

      if (error) throw error

      // Save to cache and update state
      localStorage.setItem(cacheKey, JSON.stringify(data))
      setVehicles(data || [])
    } catch (error) {
      console.error('Error fetching vehicles:', error)
      // Fallback to cache only if database fetch fails
      const cacheKey = 'service_vehicles_data'
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setVehicles(JSON.parse(cachedData))
        setIsVehiclesFromCache(true)
      } else {
        setVehicles([])
      }
    }
  }

  const getCalculatedPrice = (product: Product, customerCategory: string, customerType: string): number => {
    if (customerCategory === 'Dealer') {
      return customerType === 'Cash' ? product.price_dealer_cash : product.price_dealer_credit;
    } else if (customerCategory === 'Hotel') {
      return customerType === 'Cash' ? product.price_hotel_cash : product.price_hotel_credit;
    }
    // Fallback, though customerCategory should always be one of the defined types
    return product.price_dealer_cash; // Or any other default
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer)
    setStep(2)
  }

  const handleAddToCart = (product: Product) => {
    if (!selectedCustomer) {
      alert('Please select a customer first.');
      return;
    }

    const existingItem = cart.find(item => item.product.id === product.id);
    const customerCategory = selectedCustomer.customer_category;
    const customerType = selectedCustomer.type;
    const priceForCustomer = getCalculatedPrice(product, customerCategory, customerType);

    if (existingItem) {
      if (existingItem.quantity < product.quantity) {
        setCart(cart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
      } else {
        alert('Not enough stock available');
      }
    } else {
      setCart([...cart, { 
        product, 
        quantity: 1, 
        selectedPrice: priceForCustomer,
        isCustomPrice: false // Default to auto-calculated price
      }]);
    }
  }

  const handleQuantityChange = (productId: string, newQuantity: number) => {
    const product = products.find(p => p.id === productId)
    if (!product) return

    if (newQuantity === 0) {
      setCart(cart.filter(item => item.product.id !== productId))
    } else if (newQuantity <= product.quantity) {
      setCart(cart.map(item =>
        item.product.id === productId
          ? { ...item, quantity: newQuantity }
          : item
      ))
    } else {
      alert('Not enough stock available')
    }
  }

  // New function to handle manual price changes
  const handlePriceChange = (productId: string, newPrice: number) => {
    setCart(cart.map(item =>
      item.product.id === productId
        ? { 
            ...item, 
            selectedPrice: newPrice,
            isCustomPrice: true // Mark as custom price when manually edited
          }
        : item
    ));
  }

  // Effect to auto-fill vehicle input when sales rep changes
  useEffect(() => {
    if (selectedSalesRep) {
      const assignedVehicle = vehicles.find(v => v.sales_rep_id === selectedSalesRep);
      if (assignedVehicle) {
        setVehicleInputText(assignedVehicle.vehicle_number);
        setSelectedVehicleObject(assignedVehicle);
      }
    } else {
      setVehicleInputText('');
      setSelectedVehicleObject(null);
    }
  }, [selectedSalesRep, vehicles]);

  // Effect to filter suggestions as user types and update selectedVehicleObject
  useEffect(() => {
    if (vehicleInputText.trim()) {
      const lowerCaseInput = vehicleInputText.toLowerCase();
      const suggestions = vehicles.filter(v =>
        v.vehicle_number.toLowerCase().includes(lowerCaseInput) ||
        v.vehicle_type.toLowerCase().includes(lowerCaseInput)
      );
      setFilteredVehicleSuggestions(suggestions);

      // Check if the input text exactly matches an existing vehicle
      const matchedVehicle = vehicles.find(v => v.vehicle_number === vehicleInputText);
      setSelectedVehicleObject(matchedVehicle || null);
    } else {
      setFilteredVehicleSuggestions([]);
      setSelectedVehicleObject(null);
    }
  }, [vehicleInputText, vehicles]);

  // Effect to auto-fill sales rep when a vehicle is explicitly selected (either by auto-fill or manual selection from suggestions)
  useEffect(() => {
    if (selectedVehicleObject && selectedVehicleObject.sales_rep_id && selectedVehicleObject.sales_rep_id !== selectedSalesRep) {
      setSelectedSalesRep(selectedVehicleObject.sales_rep_id);
    }
    // Note: We don't clear sales rep when vehicle is cleared to allow manual override
  }, [selectedVehicleObject, selectedSalesRep]); // Add selectedSalesRep to avoid infinite loop if it's already the same.

  // VAT Calculation Functions
  const getSubtotal = () => {
    return cart.reduce((total, item) => total + (item.selectedPrice * item.quantity), 0);
  }

  const getVatAmount = () => {
    const subtotal = getSubtotal();
    if (selectedCustomer?.vat_status === 'VAT') {
      return subtotal * vatRate; // Use dynamic vatRate
    }
    return 0;
  }

  const getTotalAmount = () => {
    return getSubtotal() + getVatAmount();
  }

  const handleFinalizeOrder = async () => {
    if (!selectedCustomer || !user || cart.length === 0) {
      alert('Please select a customer and add products')
      return
    }

    setLoading(true)
    try {
      // Test database connection first
      try {
        const { error: testError } = await supabase
          .from('orders')
          .select('count')
          .limit(1)
          .single()

        if (testError && testError.code !== 'PGRST116') {
          throw new Error(`Database connection failed: ${testError.message}`)
        }
      } catch (connectionError) {
        if (connectionError instanceof TypeError && connectionError.message.includes('Failed to fetch')) {
          throw new Error('Cannot connect to database. Please check your internet connection and try again.')
        }
        throw connectionError
      }

      const finalVehicleNumber = vehicleInputText.trim() || null; // Use the text input directly

      // Calculate VAT details
      const subtotal = getSubtotal();
      const vatAmount = getVatAmount();
      const finalTotalAmount = getTotalAmount();
      const isVatApplicable = selectedCustomer?.vat_status === 'VAT';

      // Create order with status logic
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          customer_id: selectedCustomer.id,
          status: 'Assigned',
          purchase_order_id: requestId.trim() || null,
          created_by: user.id,
          assigned_to: selectedSalesRep,
          vehicle_number: finalVehicleNumber, // Use the vehicle number from the selected vehicle
          delivery_date: deliveryDate,
          total_amount: finalTotalAmount, // New
          vat_amount: vatAmount, // New
          is_vat_applicable: isVatApplicable, // New
        }])
        .select()
        .single()

      if (orderError) {
        console.error('Order creation error:', orderError)
        if (orderError.message.includes('row-level security policy')) {
          throw new Error('Permission denied. Please ensure you have the necessary permissions to create orders.')
        }
        throw orderError
      }

      // Create order items
      const orderItems = cart.map(item => ({
        order_id: order.id,
        item_id: item.product.id,
        quantity: item.quantity,
        price: item.selectedPrice, // This will use the custom price if set
        discount: 0
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)

      if (itemsError) throw itemsError

      // Update product quantities
      for (const item of cart) {
        const { error: updateError } = await supabase
          .from('products')
          .update({ quantity: item.product.quantity - item.quantity })
          .eq('id', item.product.id)

        if (updateError) throw updateError
      }

      alert('Order created successfully!')

      // Reset state
      setSelectedCustomer(null)
      setCart([])
      setSelectedSalesRep('')
      setVehicleInputText('')
      setSelectedVehicleObject(null)
      setRequestId('')
      setDeliveryDate(new Date().toISOString().split('T')[0]) // Reset delivery date
      setStep(1)
      fetchProducts()
    } catch (error) {
      console.error('Error finalizing order:', error)
      alert('Failed to complete order. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const resetFlow = () => {
    setStep(1)
    setSelectedCustomer(null)
    setCart([])
    setSelectedSalesRep('') // Keep this for sales rep dropdown
    setVehicleInputText('')
    setSelectedVehicleObject(null)
    setRequestId('')
    setDeliveryDate(new Date().toISOString().split('T')[0]) // Reset delivery date
  }

  const filteredCustomers = customers.filter(customer => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase()
    return (
      customer.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      customer.address.toLowerCase().includes(lowerCaseSearchTerm) ||
      customer.phone_number.toLowerCase().includes(lowerCaseSearchTerm) ||
      customer.customer_display_id.toLowerCase().includes(lowerCaseSearchTerm) ||
      (customer.email && customer.email.toLowerCase().includes(lowerCaseSearchTerm)) ||
      customer.customer_category.toLowerCase().includes(lowerCaseSearchTerm) ||
      customer.vat_status.toLowerCase().includes(lowerCaseSearchTerm) ||
      (customer.tin_number && customer.tin_number.toLowerCase().includes(lowerCaseSearchTerm))
    )
  })

  const filteredProducts = products.filter(product => {
    const lowerCaseSearchTerm = productSearchTerm.toLowerCase()
    return (
      product.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      (product.sku && product.sku.toLowerCase().includes(lowerCaseSearchTerm))
    )
  })

  if (step === 1) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Service Customer</h1>
          <div className="flex items-center text-sm text-gray-500">
            <span className="bg-red-100 text-red-700 px-2 py-1 rounded">Step 1 of 3</span>
          </div>
        </div>

        {/* Completion Bar */}
        <div className="mb-8 flex items-center justify-between w-full max-w-3xl mx-auto">
          {/* Step 1 */}
          <div className="flex flex-col items-center relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${step >= 1 ? 'bg-red-600' : 'bg-gray-300'}`}>
              1
            </div>
            <span className={`text-sm mt-2 text-center ${step >= 1 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Select Customer
            </span>
          </div>

          {/* Connector 1-2 */}
          <div className={`flex-1 h-1 mx-2 ${step > 1 ? 'bg-red-600' : 'bg-gray-300'}`}></div>

          {/* Step 2 */}
          <div className="flex flex-col items-center relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${step >= 2 ? 'bg-red-600' : 'bg-gray-300'}`}>
              2
            </div>
            <span className={`text-sm mt-2 text-center ${step >= 2 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Add Products
            </span>
          </div>

          {/* Connector 2-3 */}
          <div className={`flex-1 h-1 mx-2 ${step > 2 ? 'bg-red-600' : 'bg-gray-300'}`}></div>

          {/* Step 3 */}
          <div className="flex flex-col items-center relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${step >= 3 ? 'bg-red-600' : 'bg-gray-300'}`}>
              3
            </div>
            <span className={`text-sm mt-2 text-center ${step >= 3 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Review Order
            </span>
          </div>
        </div>

        {/* Cache Indicator for Customers */}
        {isCustomersFromCache && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">Customer data may be outdated (loaded from cache)</p>
          </div>
        )}

        {user?.role === 'Admin' || user?.role === 'Super Admin' ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Select Customer</h2>
            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search customers by ID, name, address, phone, category, or VAT status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredCustomers.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No customers found matching your search.</p>
              ) : (
                filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleCustomerSelect(customer)}
                    className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-red-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{customer.name}</div>
                        <div className="text-sm text-gray-500">ID: {customer.customer_display_id}</div>
                        <div className="text-sm text-gray-500">{customer.address}</div>
                        <div className="text-sm text-gray-500">{customer.phone_number}</div>
                        {/* New: Display Customer Category and VAT Status */}
                        <div className="flex items-center space-x-2 mt-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            customer.customer_category === 'Dealer'
                              ? 'bg-indigo-100 text-indigo-800'
                              : customer.customer_category === 'Hotel'
                              ? 'bg-pink-100 text-pink-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {customer.customer_category}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            customer.vat_status === 'VAT'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {customer.vat_status}
                          </span>
                          {customer.tin_number && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              TIN: {customer.tin_number}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${
                          customer.type === 'Cash'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {customer.type}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Select Customer</h2>
            <div className="space-y-2">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => handleCustomerSelect(customer)}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-red-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{customer.name}</div>
                      <div className="text-sm text-gray-500">{customer.address}</div>
                      <div className="text-sm text-gray-500">{customer.phone_number}</div>
                      {/* New: Display Customer Category and VAT Status */}
                      <div className="flex items-center space-x-2 mt-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          customer.customer_category === 'Dealer'
                            ? 'bg-indigo-100 text-indigo-800'
                            : customer.customer_category === 'Hotel'
                            ? 'bg-pink-100 text-pink-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {customer.customer_category}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          customer.vat_status === 'VAT'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {customer.vat_status}
                        </span>
                        {customer.tin_number && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            TIN: {customer.tin_number}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${
                        customer.type === 'Cash'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {customer.type}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Add Products</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-sm text-gray-500">
              <span className="bg-red-100 text-red-700 px-2 py-1 rounded">Step 2 of 3</span>
            </div>
            <button
              onClick={resetFlow}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>

        {/* Completion Bar */}
        <div className="mb-8 flex items-center justify-between w-full max-w-3xl mx-auto">
          {/* Step 1 */}
          <div className="flex flex-col items-center relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${step >= 1 ? 'bg-red-600' : 'bg-gray-300'}`}>
              1
            </div>
            <span className={`text-sm mt-2 text-center ${step >= 1 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Select Customer
            </span>
          </div>

          {/* Connector 1-2 */}
          <div className={`flex-1 h-1 mx-2 ${step > 1 ? 'bg-red-600' : 'bg-gray-300'}`}></div>

          {/* Step 2 */}
          <div className="flex flex-col items-center relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${step >= 2 ? 'bg-red-600' : 'bg-gray-300'}`}>
              2
            </div>
            <span className={`text-sm mt-2 text-center ${step >= 2 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Add Products
            </span>
          </div>

          {/* Connector 2-3 */}
          <div className={`flex-1 h-1 mx-2 ${step > 2 ? 'bg-red-600' : 'bg-gray-300'}`}></div>

          {/* Step 3 */}
          <div className="flex flex-col items-center relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${step >= 3 ? 'bg-red-600' : 'bg-gray-300'}`}>
              3
            </div>
            <span className={`text-sm mt-2 text-center ${step >= 3 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Review Order
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">Customer: {selectedCustomer?.name}</h2>
          <p className="text-sm text-gray-600">ID: {selectedCustomer?.customer_display_id}</p>
          <p className="text-sm text-gray-600">Address: {selectedCustomer?.address}</p>
          <p className="text-sm text-gray-600">Phone: {selectedCustomer?.phone_number}</p>
          {/* New: Display Customer Category and VAT Status in customer details */}
          <div className="flex items-center space-x-2 mt-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              selectedCustomer?.customer_category === 'Dealer'
                ? 'bg-indigo-100 text-indigo-800'
                : selectedCustomer?.customer_category === 'Hotel'
                ? 'bg-pink-100 text-pink-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {selectedCustomer?.customer_category}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              selectedCustomer?.vat_status === 'VAT'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {selectedCustomer?.vat_status}
            </span>
            {selectedCustomer?.tin_number && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                TIN: {selectedCustomer.tin_number}
              </span>
            )}
          </div>
        </div>

        {/* Cache Indicators */}
        {isProductsFromCache && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">Product data may be outdated (loaded from cache)</p>
          </div>
        )}

        {isSalesRepsFromCache && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">Sales reps data may be outdated (loaded from cache)</p>
          </div>
        )}

        {isVehiclesFromCache && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">Vehicles data may be outdated (loaded from cache)</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Products */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Available Products</h3>
            {/* Product Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search products by name or SKU..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No products found matching your search.</p>
              ) : (
                filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="text-sm text-gray-500">
                        Rs {getCalculatedPrice(product, selectedCustomer.customer_category, selectedCustomer.type).toFixed(2)} • Stock: {product.quantity} kg
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddToCart(product)}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Order Summary</h3>
            {cart.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No items in cart</p>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const autoCalculatedPrice = getCalculatedPrice(
                    item.product, 
                    selectedCustomer.customer_category, 
                    selectedCustomer.type
                  );
                  
                  return (
                    <div
                      key={item.product.id}
                      className="flex flex-col p-3 bg-gray-50 rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{item.product.name}</div>
                          <div className="text-sm text-gray-500">
                            Stock: {item.product.quantity} kg
                          </div>
                        </div>
                        <div className="w-20 sm:w-24">
                          <input
                            type="number"
                            step="0.1"
                            value={item.quantity}
                            onChange={(e) => handleQuantityChange(item.product.id, parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-center"
                            min="0"
                            max={item.product.quantity}
                          />
                        </div>
                      </div>
                      
                      {/* Editable Unit Price Field */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                        <label className="text-sm font-medium text-gray-700">
                          Unit Price (Rs/kg):
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.selectedPrice}
                            onChange={(e) => handlePriceChange(item.product.id, parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-right"
                          />
                          {item.isCustomPrice && (
                            <button
                              onClick={() => handlePriceChange(item.product.id, autoCalculatedPrice)}
                              className="text-xs text-red-600 hover:text-red-800 underline"
                              title="Reset to auto-calculated price"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Item Total */}
                      <div className="flex justify-between items-center text-sm font-medium">
                        <span>Item Total:</span>
                        <span>Rs {(item.selectedPrice * item.quantity).toFixed(2)}</span>
                      </div>
                      
                      {/* Price Difference Indicator */}
                      {item.isCustomPrice && item.selectedPrice !== autoCalculatedPrice && (
                        <div className="text-xs text-gray-500">
                          Auto price: Rs {autoCalculatedPrice.toFixed(2)}
                          {item.selectedPrice > autoCalculatedPrice ? (
                            <span className="text-red-600 ml-1">(+{(item.selectedPrice - autoCalculatedPrice).toFixed(2)})</span>
                          ) : (
                            <span className="text-green-600 ml-1">(-{(autoCalculatedPrice - item.selectedPrice).toFixed(2)})</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="border-t pt-4 mt-4">
                  <div className="flex justify-between items-center text-lg font-semibold">
                    <span>Total:</span>
                    <span>Rs {getTotalAmount().toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign to Sales Rep
                  </label>
                  <select
                    value={selectedSalesRep}
                    onChange={(e) => setSelectedSalesRep(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    required
                  >
                    <option value="">Select Sales Rep</option>
                    {salesReps.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Purchase Order ID
                  </label>
                  <input
                    type="text"
                    value={requestId}
                    onChange={(e) => setRequestId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    placeholder="Enter purchase order ID (optional)"
                  />
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Order Delivery Date
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>

                {/* Vehicle Selection Input with Type-ahead */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vehicle Number
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={vehicleInputText}
                      onChange={(e) => {
                        setVehicleInputText(e.target.value);
                        setShowVehicleSuggestions(true);
                      }}
                      onFocus={() => setShowVehicleSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowVehicleSuggestions(false), 100)} // Delay to allow click on suggestion
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="Enter vehicle number (optional)"
                    />
                    {showVehicleSuggestions && filteredVehicleSuggestions.length > 0 && (
                      <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                        {filteredVehicleSuggestions.map((vehicle) => (
                          <li
                            key={vehicle.id}
                            onMouseDown={() => { // Use onMouseDown to prevent onBlur from firing too early
                              setVehicleInputText(vehicle.vehicle_number);
                              setSelectedVehicleObject(vehicle);
                              setShowVehicleSuggestions(false);
                            }}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                          >
                            {vehicle.vehicle_number} ({vehicle.vehicle_type}) - {vehicle.status}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setStep(3)}
                  disabled={cart.length === 0 || !selectedSalesRep}
                  className="w-full mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Review Order
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Review Order</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-sm text-gray-500">
              <span className="bg-red-100 text-red-700 px-2 py-1 rounded">Step 3 of 3</span>
            </div>
            <button
              onClick={resetFlow}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>

        {/* Completion Bar */}
        <div className="mb-8 flex items-center justify-between w-full max-w-3xl mx-auto">
          {/* Step 1 */}
          <div className="flex flex-col items-center relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${step >= 1 ? 'bg-red-600' : 'bg-gray-300'}`}>
              1
            </div>
            <span className={`text-sm mt-2 text-center ${step >= 1 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Select Customer
            </span>
          </div>

          {/* Connector 1-2 */}
          <div className={`flex-1 h-1 mx-2 ${step > 1 ? 'bg-red-600' : 'bg-gray-300'}`}></div>

          {/* Step 2 */}
          <div className="flex flex-col items-center relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${step >= 2 ? 'bg-red-600' : 'bg-gray-300'}`}>
              2
            </div>
            <span className={`text-sm mt-2 text-center ${step >= 2 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Add Products
            </span>
          </div>

          {/* Connector 2-3 */}
          <div className={`flex-1 h-1 mx-2 ${step > 2 ? 'bg-red-600' : 'bg-gray-300'}`}></div>

          {/* Step 3 */}
          <div className="flex flex-col items-center relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg
              ${step >= 3 ? 'bg-red-600' : 'bg-gray-300'}`}>
              3
            </div>
            <span className={`text-sm mt-2 text-center ${step >= 3 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              Review Order
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Customer Details</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="font-medium text-gray-900">{selectedCustomer?.name}</div>
              <div className="text-sm text-gray-600">{selectedCustomer?.address}</div>
              <div className="text-sm text-gray-600">{selectedCustomer?.phone_number}</div>
              {/* New: Display Customer Category and VAT Status in review section */}
              <div className="flex items-center space-x-2 mt-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  selectedCustomer?.customer_category === 'Dealer'
                    ? 'bg-indigo-100 text-indigo-800'
                    : selectedCustomer?.customer_category === 'Hotel'
                    ? 'bg-pink-100 text-pink-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {selectedCustomer?.customer_category}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  selectedCustomer?.vat_status === 'VAT'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {selectedCustomer?.vat_status}
                </span>
                {selectedCustomer?.tin_number && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    TIN: {selectedCustomer.tin_number}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-2">Vehicle: {vehicleInputText || 'N/A'}</p>
              <p className="text-sm text-gray-600">Delivery Date: {deliveryDate}</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Order Items</h2>
            <div className="space-y-2">
              {cart.map((item) => {
                const autoCalculatedPrice = getCalculatedPrice(
                  item.product, 
                  selectedCustomer.customer_category, 
                  selectedCustomer.type
                );
                
                return (
                  <div key={item.product.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">{item.product.name}</div>
                      <div className="text-sm text-gray-500">Quantity: {item.quantity} kg</div>
                      {item.isCustomPrice && item.selectedPrice !== autoCalculatedPrice && (
                        <div className="text-xs text-gray-500 mt-1">
                          Custom price (Auto: Rs {autoCalculatedPrice.toFixed(2)})
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-medium">Rs {(item.selectedPrice * item.quantity).toFixed(2)}</div>
                      <div className="text-sm text-gray-500">@ Rs {item.selectedPrice.toFixed(2)}/kg</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t pt-4 mb-6">
            <div className="flex justify-between items-center text-base">
              <span>Subtotal:</span>
              <span>Rs {getSubtotal().toFixed(2)}</span>
            </div>
            {selectedCustomer?.vat_status === 'VAT' && (
              <div className="flex justify-between items-center text-base mt-1">
                <span>VAT ({(vatRate * 100).toFixed(0)}%):</span>
                <span>Rs {getVatAmount().toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xl font-bold mt-2">
              <span>Total Amount:</span>
              <span>Rs {getTotalAmount().toFixed(2)}</span>
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={() => setStep(2)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back to Cart
            </button>
            <button
              onClick={handleFinalizeOrder}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Finalize Order
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}