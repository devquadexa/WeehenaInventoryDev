import React, { useState, useEffect } from 'react'
import { Edit, Trash2, AlertTriangle, Search, Plus, DollarSign, Save, X, ShoppingCart, ArrowLeft, User, Phone, Calendar, Filter, Package } from 'lucide-react'
import { supabase, Product, Category, OnDemandAssignmentItem, OnDemandOrder, Customer as SupabaseCustomer, User as SupabaseUser } from '../lib/supabase'
import { BulkProductEntry } from './BulkProductEntry'
import { EditProductModal } from './EditProductModal'
import { ProductPricesModal } from './ProductPricesModal'
import { useAuth } from '../hooks/useAuth'
import { Customer } from '../lib/supabase'
import { PaymentConfirmationModal } from './PaymentConfirmationModal'
import { ProductRequestModal } from './ProductRequestModal'

import { createRoot } from 'react-dom/client'

import { OnDemandBillPrintLayout } from './OnDemandBillPrintLayout'

interface ProductWithAssignment extends Product {
  assigned_quantity?: number
  available_quantity?: number
  assignment_item_id?: string
  assignment_type?: 'admin_assigned' | 'sales_rep_requested'
}

interface CartItem {
  assignment_item_id: string
  product: ProductWithAssignment
  quantity: number
  selling_price: number
  price_error?: string
}

export const Inventory: React.FC = () => {
  const [products, setProducts] = useState<ProductWithAssignment[]>([])
  const [customers, setCustomers] = useState<SupabaseCustomer[]>([])
  const [salesReps, setSalesReps] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showBulkEntry, setShowBulkEntry] = useState(false)
  const { user } = useAuth()
  const [filterDate, setFilterDate] = useState('')
  const [filterSalesRepId, setFilterSalesRepId] = useState('')
  const [filterVehicleNumber, setFilterVehicleNumber] = useState('')
  const [editingProduct, setEditingProduct] = useState<ProductWithAssignment | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [view, setView] = useState<'inventory' | 'sell'>('inventory')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerData, setCustomerData] = useState<{
    type: 'existing' | 'walk-in';
    existing_customer_id: string;
    customer_name: string;
    customer_phone: string;
    customer_details?: SupabaseCustomer; // To store full customer object if existing
  }>({
    type: 'walk-in' as 'existing' | 'walk-in',
    existing_customer_id: '',
    customer_name: '',
    customer_phone: ''
  })
  const [saving, setSaving] = useState(false)
  
  const [showPaymentModalForOnDemand, setShowPaymentModalForOnDemand] = useState(false)
  const [onDemandOrderToConfirm, setOnDemandOrderToConfirm] = useState<any>(null)
  const [showProductRequestModal, setShowProductRequestModal] = useState(false)
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [selectedProductForPrices, setSelectedProductForPrices] = useState<ProductWithAssignment | null>(null);

  // New state for stock update modal
  const [showStockUpdateModal, setShowStockUpdateModal] = useState(false);
  const [selectedProductForStockUpdate, setSelectedProductForStockUpdate] = useState<ProductWithAssignment | null>(null);
  const [stockAdditionQuantity, setStockAdditionQuantity] = useState<string>('');

  // Determine if current user has read-only access
  const isReadOnly = user?.role === 'Sales Rep' || user?.role === 'Order Manager'
  const canEditPrices = user?.role === 'Admin' || user?.role === 'Super Admin'

  useEffect(() => {
    if (user) {
      fetchProducts()
      if (user.role === 'Sales Rep') {
        fetchCustomers()
      }
      if (user.role === 'Security Guard') {
        fetchSalesReps()
      }
    }
  }, [user, filterDate, filterSalesRepId, filterVehicleNumber])

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name')

      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }

  const fetchSalesReps = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'Sales Rep')
        .order('username')

      if (error) throw error
      setSalesReps(data || [])
    } catch (error) {
      console.error('Error fetching sales reps:', error)
    }
  }

  const fetchProducts = async () => {
    setFetchError(null)
    try {
      console.log('Fetching products for user role:', user?.role)
      if (user?.role === 'Sales Rep') {
        // For Sales Reps, fetch only products assigned to them with available quantity > 0
        const { data, error } = await supabase
          .from('on_demand_assignment_items')
          .select(`
            id,
            assigned_quantity,
            sold_quantity,
            returned_quantity,
            products!inner(
              id,
              product_id,
              name,
              sku,
              price_dealer_cash,
              price_dealer_credit,
              price_hotel_cash,
              price_hotel_credit,
              categories (
                category_name,
                category_code
              )
            ),
            on_demand_assignments!inner(
              id,
              sales_rep_id,
              status,
              assignment_type
            )
          `)
          .eq('on_demand_assignments.sales_rep_id', user.id)
          .eq('on_demand_assignments.status', 'active')

        if (error) {
          console.error('Supabase error for Sales Rep:', error)
          throw error
        }

        // Filter items with available quantity > 0
        const availableItems = (data || []).filter(item => 
          item.assigned_quantity - item.sold_quantity - item.returned_quantity > 0
        )
        
        // Transform assignment items to product format
        const transformedProducts: ProductWithAssignment[] = availableItems.map(item => ({
          ...item.products,
          assigned_quantity: item.assigned_quantity,
          available_quantity: item.assigned_quantity - item.sold_quantity - item.returned_quantity,
          quantity: item.assigned_quantity - item.sold_quantity - item.returned_quantity,
          assignment_item_id: item.id,
          assignment_type: item.on_demand_assignments.assignment_type
        }))

        console.log('Sales Rep products fetched:', transformedProducts)
        setProducts(transformedProducts)
      } else {
        // For Admin and other roles, fetch all products
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            categories (
              category_name,
              category_code
            )
          `)
          .order('product_id', { ascending: true })

        if (error) {
          console.error('Supabase error for Admin:', error)
          throw error
        }
        
        console.log('Admin products fetched:', data)
        setProducts(data || [])
      }
    } catch (error) {
      console.error('Error fetching products:', error)
      setFetchError('Failed to load products. Please check your database connection.')
    } finally {
      setLoading(false)
    }
  }

  // New function to handle stock update
  const handleUpdateStock = (product: ProductWithAssignment) => {
    setSelectedProductForStockUpdate(product);
    setStockAdditionQuantity('');
    setShowStockUpdateModal(true);
  };

  const handleSaveStockUpdate = async () => {
    if (!selectedProductForStockUpdate || !stockAdditionQuantity) return;

    const additionQuantity = parseFloat(stockAdditionQuantity);
    if (isNaN(additionQuantity) || additionQuantity < 0) {
      alert('Please enter a valid positive number for stock quantity to add.');
      return;
    }

    try {
      const newQuantity = selectedProductForStockUpdate.quantity + additionQuantity;

      const { error } = await supabase
        .from('products')
        .update({ quantity: newQuantity })
        .eq('id', selectedProductForStockUpdate.id);

      if (error) throw error;

      alert(`Stock quantity updated successfully! Added ${additionQuantity} kg to inventory.`);
      setShowStockUpdateModal(false);
      setSelectedProductForStockUpdate(null);
      setStockAdditionQuantity('');
      fetchProducts();
    } catch (error) {
      console.error('Error updating stock:', error);
      alert('Failed to update stock quantity. Please try again.');
    }
  };

  const handleViewEditPrices = (product: ProductWithAssignment) => {
    setSelectedProductForPrices(product);
    setShowPriceModal(true);
  };

  const addToCart = (product: ProductWithAssignment) => {
    if (!product.assignment_item_id) return
    
    const existingCartItem = cart.find(cartItem => cartItem.assignment_item_id === product.assignment_item_id)
    const availableQty = product.quantity
    
    if (existingCartItem) {
      if (existingCartItem.quantity < availableQty) {
        setCart(cart.map(cartItem =>
          cartItem.assignment_item_id === product.assignment_item_id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        ))
      } else {
        alert('No more quantity available for this product')
      }
    } else {
      if (availableQty > 0) {
        setCart([...cart, {
          assignment_item_id: product.assignment_item_id,
          product,
          quantity: 1,
          selling_price: product.price_dealer_cash || 0
        }])
      }
    }
  }

  const updateCartItem = (assignmentItemId: string, field: 'quantity' | 'selling_price', value: number) => {
    setCart(cart.map(cartItem => {
      if (cartItem.assignment_item_id === assignmentItemId) {
        if (field === 'quantity') {
          const availableQty = cartItem.product.quantity
          if (value <= availableQty && value > 0) {
            return { ...cartItem, [field]: value, price_error: undefined }
          } else if (value <= 0) {
            return cartItem
          } else {
            alert('Quantity exceeds available stock')
            return cartItem
          }
        }
      }
      return cartItem
    }))
  }

  const updateCartItemPrice = (assignmentItemId: string, value: string) => {
    setCart(cart.map(cartItem => {
      if (cartItem.assignment_item_id === assignmentItemId) {
        const numericValue = parseFloat(value) || 0
        const product = cartItem.product
        let price_error: string | undefined = undefined
        
        if (product && numericValue > 0) {
          const basePrice = product.price_dealer_cash || 0
          const threshold = 0
          const lower = Math.max(0, basePrice - threshold)
          const upper = basePrice + threshold
          
          if (threshold === 0) {
            price_error = 'Threshold not set. Please contact Admin.'
          } else if (numericValue < lower || numericValue > upper) {
            price_error = `Price must be between Rs ${lower.toFixed(2)} and Rs ${upper.toFixed(2)}`
          }
        }
        
        return { 
          ...cartItem, 
          selling_price: numericValue,
          price_error 
        }
      }
      return cartItem
    }))
  }

  const removeFromCart = (assignmentItemId: string) => {
    setCart(cart.filter(cartItem => cartItem.assignment_item_id !== assignmentItemId))
  }

  const getTotalAmount = () => {
    return cart.reduce((total, item) => total + (item.quantity * item.selling_price), 0)
  }

  const handleSellProducts = async () => {
    if (cart.length === 0) {
      alert('Please add products to cart')
      return
    }

    if (customerData.type === 'existing' && !customerData.existing_customer_id) {
      alert('Please select a customer')
      return
    }

    if (customerData.type === 'walk-in' && !customerData.customer_name.trim()) {
      alert('Please enter customer name')
      return
    }

    // Validate prices
    for (const cartItem of cart) {
      const product = cartItem.product
      if (cartItem.price_error) {
        alert(`Please fix price errors before completing the sale`)
        return
      }
      if (product) {
        const basePrice = product.price_dealer_cash || 0
        const threshold = 0
        
        if (threshold === 0) {
          alert(`Threshold not set for ${product.name}. Please contact Admin.`)
          return
        }
        const lower = Math.max(0, basePrice - threshold)
        const upper = basePrice + threshold
        if (cartItem.selling_price <= 0 || cartItem.selling_price < lower || cartItem.selling_price > upper) {
          alert(`Price for ${product.name} must be between Rs ${lower.toFixed(2)} and Rs ${upper.toFixed(2)}`)
          return
        }
      }
      if (cartItem.selling_price <= 0) {
        alert('All prices must be greater than 0')
        return
      }
    }

    const selectedCustomer = customerData.type === 'existing'
      ? customers.find(c => c.id === customerData.existing_customer_id)
      : null

    const tempOnDemandOrder = {
      id: 'temp-on-demand-order-' + Date.now(),
      on_demand_order_display_id: 'PENDING',
      customer_name: customerData.type === 'existing'
        ? selectedCustomer?.name || ''
        : customerData.customer_name,
      customer_phone: customerData.type === 'existing'
        ? selectedCustomer?.phone_number
        : customerData.customer_phone,
      customer_type: customerData.type,
      existing_customer_id: customerData.type === 'existing'
        ? customerData.existing_customer_id
        : null,
      sales_rep_id: user?.id || '',
      quantity_sold: cart.reduce((sum, item) => sum + item.quantity, 0),
      selling_price: cart.reduce((sum, item) => sum + item.selling_price, 0) / cart.length || 0,
      total_amount: getTotalAmount(),
      sale_date: new Date().toISOString(),
      notes: '',
      created_at: new Date().toISOString(),
      customer_details: selectedCustomer || { id: 'walk-in', name: customerData.customer_name, address: '', phone_number: customerData.customer_phone, type: 'Cash', created_at: '' },
      product_details: cart.map(item => ({
        id: item.assignment_item_id,
        on_demand_assignment_id: '',
        product_id: item.product.id,
        assigned_quantity: item.product.assigned_quantity || 0,
        sold_quantity: item.quantity,
        returned_quantity: 0,
        created_at: '',
        products: item.product,
      })),
      sales_rep_username: user?.username,
    }

    setOnDemandOrderToConfirm(tempOnDemandOrder)
    setShowPaymentModalForOnDemand(true)
  }

  const handleConfirmOnDemandPayment = async (
    tempOrderId: string,
    paymentMethod: 'Net' | 'Cash',
    receiptNo: string
  ) => {
    if (cart.length === 0 || !user) {
      alert('No items in cart or user not logged in.')
      return
    }

    setSaving(true)
    try {
      const selectedCustomer = customerData.type === 'existing'
        ? customers.find(c => c.id === customerData.existing_customer_id)
        : null

      for (const cartItem of cart) {
        const orderData = {
          on_demand_assignment_item_id: cartItem.assignment_item_id,
          sales_rep_id: user.id,
          customer_name: customerData.type === 'existing'
            ? selectedCustomer?.name || ''
            : customerData.customer_name,
          customer_phone: customerData.type === 'existing'
            ? selectedCustomer?.phone_number
            : customerData.customer_phone,
          customer_type: customerData.type,
          existing_customer_id: customerData.type === 'existing'
            ? customerData.existing_customer_id
            : null,
          quantity_sold: cartItem.quantity,
          selling_price: cartItem.selling_price,
          total_amount: cartItem.quantity * cartItem.selling_price,
          payment_method: paymentMethod,
        }

        const { data: newOnDemandOrder, error: orderError } = await supabase
          .from('on_demand_orders')
          .insert([orderData])
          .select()
          .single()

        if (orderError) throw orderError

        const currentItem = products.find(p => p.assignment_item_id === cartItem.assignment_item_id)
        if (currentItem) {
          const { error: updateError } = await supabase
            .from('on_demand_assignment_items')
            .update({
              sold_quantity: (currentItem.assigned_quantity || 0) - (currentItem.available_quantity || 0) + cartItem.quantity
            })
            .eq('id', cartItem.assignment_item_id)

          if (updateError) throw updateError
        }

        if (newOnDemandOrder) {
          const orderToPrint = {
            ...newOnDemandOrder,
            customer_details: selectedCustomer || { name: customerData.customer_name, phone_number: customerData.customer_phone, address: '' },
            product_details: [{
              ...currentItem,
              products: cartItem.product,
              sold_quantity: cartItem.quantity,
            }],
            sales_rep_username: user.username,
          }

          handlePrintOnDemandBill(orderToPrint, paymentMethod, newOnDemandOrder.receipt_no || 'N/A')
        }
      }

      alert('Sale completed successfully!')
      setCart([])
      setCustomerData({
        type: 'walk-in',
        existing_customer_id: '',
        customer_name: '',
        customer_phone: ''
      })
      setView('inventory')
      fetchProducts()
    } catch (error) {
      console.error('Error completing sale:', error)
      alert('Failed to complete sale. Please try again.')
    } finally {
      setSaving(false)
      setShowPaymentModalForOnDemand(false)
    }
  }

  const handleReturnProducts = async (product: ProductWithAssignment, returnQuantity: number) => {
    if (!product.assignment_item_id) return
    
    if (returnQuantity <= 0) {
      alert('Please enter a valid return quantity')
      return
    }

    const availableToReturn = product.quantity
    if (returnQuantity > availableToReturn) {
      alert('Return quantity cannot exceed available quantity')
      return
    }

    try {
      const { data: assignmentItem, error: fetchAssignmentError } = await supabase
        .from('on_demand_assignment_items')
        .select('returned_quantity')
        .eq('id', product.assignment_item_id)
        .single()

      if (fetchAssignmentError) throw fetchAssignmentError

      const currentReturnedQuantity = assignmentItem?.returned_quantity || 0
      const newReturnedQuantity = currentReturnedQuantity + returnQuantity

      const { error: updateError } = await supabase
        .from('on_demand_assignment_items')
        .update({
          returned_quantity: newReturnedQuantity
        })
        .eq('id', product.assignment_item_id)

      if (updateError) throw updateError

      const { data: productData, error: fetchProductError } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', product.id)
        .single()

      if (fetchProductError) throw fetchProductError

      const currentProductQuantity = productData?.quantity || 0
      const newProductQuantity = currentProductQuantity + returnQuantity

      const { error: inventoryError } = await supabase
        .from('products')
        .update({
          quantity: newProductQuantity
        })
        .eq('id', product.id)

      if (inventoryError) throw inventoryError

      alert('Products returned successfully!')
      fetchProducts()
    } catch (error) {
      console.error('Error returning products:', error)
      alert('Failed to return products. Please try again.')
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) throw error
      await fetchProducts()
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
        alert('Cannot delete this product because it is associated with existing sales orders. Please remove it from all orders first.')
      } else {
        console.error('Error deleting product:', error)
        alert('An error occurred while deleting the product. Please try again.')
      }
    }
  }

  const handleStockChange = async (product: ProductWithAssignment, change: number) => {
    const newQuantity = Math.max(0, product.quantity + change)
    
    try {
      const { error } = await supabase
        .from('products')
        .update({ quantity: newQuantity })
        .eq('id', product.id)

      if (error) throw error
      await fetchProducts()
    } catch (error) {
      console.error('Error updating stock:', error)
    }
  }

  const handleEditProduct = (product: ProductWithAssignment) => {
    setEditingProduct(product)
    setShowEditModal(true)
  }

  const handleCloseEditModal = () => {
    setEditingProduct(null)
    setShowEditModal(false)
  }

  const handlePrintOnDemandBill = (
    order: OnDemandOrder & { customer_details?: SupabaseCustomer; product_details?: (OnDemandAssignmentItem & { products: Product })[]; sales_rep_username?: string; },
    paymentMethod: 'Net' | 'Cash',
    receiptNo: string
  ) => {
    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>Weehena Farm - On Demand Sales Receipt</title></head><body><div id="print-root"></div></body></html>`)
      printWindow.document.close()

      const printRoot = printWindow.document.getElementById('print-root')
      if (printRoot) {
        createRoot(printRoot).render(<OnDemandBillPrintLayout order={order} paymentMethod={paymentMethod} receiptNo={receiptNo} />)
      }

      setTimeout(() => {
        printWindow.focus()
        printWindow.print()
      }, 1000)
    } else {
      alert('Please allow pop-ups to print the bill.')
    }
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

  if (fetchError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">{fetchError}</div>
      </div>
    )
  }

  // Sell View for Sales Rep
  if (view === 'sell' && user?.role === 'Sales Rep') {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => setView('inventory')}
              className="mr-4 p-2 text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Sell On Demand Products</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Available Products */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Available Products</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 line-clamp-3">{product.name}</div>
                    <div className="text-sm text-gray-500">
                      <div className="space-y-1">
                        <div className="text-xs">
                          Dealer Cash: Rs {product.price_dealer_cash?.toFixed(2) || 'N/A'}
                        </div>
                        <div className="text-xs">Available: {product.quantity} kg</div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => addToCart(product)}
                    disabled={product.quantity === 0}
                    className="ml-3 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Add to Cart
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Cart and Customer Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Cart & Customer Info</h3>
            
            {/* Customer Selection */}
            <div className="mb-6">
              <h4 className="font-medium text-gray-900 mb-3">Customer Information</h4>
              <div className="space-y-3">
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="existing"
                      checked={customerData.type === 'existing'}
                      onChange={(e) => setCustomerData({ ...customerData, type: e.target.value as 'existing' })}
                      className="mr-2"
                    />
                    Existing Customer
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="walk-in"
                      checked={customerData.type === 'walk-in'}
                      onChange={(e) => setCustomerData({ ...customerData, type: e.target.value as 'walk-in' })}
                      className="mr-2"
                    />
                    Walk-in Customer
                  </label>
                </div>

                {customerData.type === 'existing' ? (
                  <select
                    value={customerData.existing_customer_id}
                    onChange={(e) => setCustomerData({ ...customerData, existing_customer_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Select Customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} - {customer.phone_number}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={customerData.customer_name}
                      onChange={(e) => setCustomerData({ ...customerData, customer_name: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Customer Name *"
                    />
                    <input
                      type="tel"
                      value={customerData.customer_phone}
                      onChange={(e) => setCustomerData({ ...customerData, customer_phone: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Phone Number"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Cart Items */}
            {cart.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No items in cart</p>
            ) : (
              <div className="space-y-3">
                {cart.map((cartItem) => (
                  <div key={cartItem.assignment_item_id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-gray-900 line-clamp-3">
                        {cartItem.product.name}
                      </div>
                      <button
                        onClick={() => removeFromCart(cartItem.assignment_item_id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Quantity (kg)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={cartItem.quantity}
                          onChange={(e) => updateCartItem(cartItem.assignment_item_id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                          min="0.1"
                          max={cartItem.product.quantity}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Price (Rs)</label>
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={cartItem.selling_price || ''}
                            onChange={(e) => updateCartItemPrice(cartItem.assignment_item_id, e.target.value)}
                            className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 ${
                              cartItem.price_error 
                                ? 'border-red-300 focus:ring-red-500' 
                                : 'border-gray-300 focus:ring-red-500'
                            }`}
                            placeholder="Enter price"
                          />
                          {cartItem.price_error && (
                            <div className="text-xs text-red-600">
                              {cartItem.price_error}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm font-medium text-gray-900 mt-2">
                      Total: Rs {(cartItem.quantity * cartItem.selling_price).toFixed(2)}
                    </div>
                  </div>
                ))}
                
                <div className="border-t pt-3">
                  <div className="flex justify-between items-center text-lg font-semibold">
                    <span>Grand Total:</span>
                    <span>Rs {getTotalAmount().toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={handleSellProducts}
                  disabled={saving || cart.some(item => item.price_error)}
                  className="w-full mt-4 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {saving ? (
                    'Processing...'
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Complete Sale
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {showPaymentModalForOnDemand && onDemandOrderToConfirm && (
          <PaymentConfirmationModal
            order={onDemandOrderToConfirm}
            onClose={() => setShowPaymentModalForOnDemand(false)}
            onConfirm={handleConfirmOnDemandPayment}
            onPrintBill={handlePrintOnDemandBill}
            loading={saving}
            is_on_demand={true}
          />
        )}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {user?.role === 'Sales Rep' ? 'My Inventory' : 'Master Inventory'}
          </h1>
          {user?.role === 'Sales Rep' && (
            <p className="text-sm text-gray-600 mt-1">Products assigned to you for On Demand sales</p>
          )}
        </div>
        <div className="flex items-center space-x-3">
          {user?.role === 'Sales Rep' && (
            <>
              <button
                onClick={() => setShowProductRequestModal(true)}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Package className="w-4 h-4 mr-2" />
                Product Request
              </button>
              <button
                onClick={() => setView('sell')}
                disabled={filteredProducts.length === 0}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Sell Products
              </button>
            </>
          )}
          {!isReadOnly && (
            <button
              onClick={() => setShowBulkEntry(true)}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
              <Plus className="w-4 h-4 mr-2" />
              Add Products
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products by name, category, or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
          {user?.role === 'Security Guard' && (
            <>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <select
                value={filterSalesRepId}
                onChange={(e) => setFilterSalesRepId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">All Sales Reps</option>
                {salesReps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.username}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Vehicle Number"
                value={filterVehicleNumber}
                onChange={(e) => setFilterVehicleNumber(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </>
          )}
        </div>
      </div>

      {/* Mobile Card Layout */}
      <div className="block md:hidden">
        <div className="space-y-4">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center mb-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {product.name}
                    </h3>
                    {user?.role === 'Sales Rep' && product.assignment_type && (
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                        product.assignment_type === 'sales_rep_requested'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {product.assignment_type === 'sales_rep_requested' ? 'Requested' : 'Assigned'}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">Product ID: {product.product_id || 'N/A'}</span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">Category: {product.categories?.category_name || 'N/A'}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                {/* Show assigned quantity for Sales Rep */}
                {user?.role === 'Sales Rep' && product.assigned_quantity !== undefined && (
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Total Assigned:</span>
                    </div>
                    <div className="flex items-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        {product.assigned_quantity} kg
                      </span>
                    </div>
                  </div>
                )}

                {/* Current Stock */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">
                      {user?.role === 'Sales Rep' ? 'Available to Sell:' : 'Current Stock:'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        product.quantity < product.threshold
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {product.quantity} kg
                        {product.quantity < product.threshold && (
                        <AlertTriangle className="w-4 h-4 ml-1" />
                        )}
                      </span>
                    {user?.role === 'Admin' || user?.role === 'Super Admin' ? (
                      <button
                        onClick={() => handleUpdateStock(product)}
                        className="text-blue-600 hover:text-blue-800 transition-colors"
                        title="Update Stock Quantity"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Prices */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Prices:</span>
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    <button
                      onClick={() => handleViewEditPrices(product)}
                      className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 transition-colors"
                      title="View/Edit Prices"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>View/Edit</span>
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                {!isReadOnly && (
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handleEditProduct(product)}
                      className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 transition-colors"
                      title="Edit product"
                    >
                      <Edit className="w-4 h-4" />
                      <span className="text-sm">Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      className="flex items-center space-x-1 text-red-600 hover:text-red-800 transition-colors"
                      title="Delete product"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-sm">Delete</span>
                    </button>
                  </div>
                )}
                
                {/* Sales Rep specific actions */}
                {user?.role === 'Sales Rep' && (
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        const returnQty = prompt(`Enter quantity to return (max: ${product.quantity} kg):`)
                        if (returnQty) {
                          handleReturnProducts(product, parseFloat(returnQty))
                        }
                      }}
                      className="flex items-center space-x-1 text-orange-600 hover:text-orange-800 transition-colors"
                      title="Return products"
                    >
                      <span className="text-sm">Return</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
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
                  Current Stock (kg)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prices
                </th>
                {user?.role === 'Sales Rep' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assignment Type
                  </th>
                )}
                {!isReadOnly && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{product.product_id || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{product.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{product.categories?.category_name || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      <span className={`text-sm font-medium ${
                        product.quantity <= 0 ? 'text-red-600' : 
                        product.quantity < 10 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {product.quantity} kg
                      </span>
                      {user?.role === 'Admin' || user?.role === 'Super Admin' ? (
                        <button
                          onClick={() => handleUpdateStock(product)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Update Stock Quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleViewEditPrices(product)}
                      className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors"
                      title="View/Edit Prices"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span className="text-sm">View/Edit Prices</span>
                    </button>
                  </td>
                  {user?.role === 'Sales Rep' && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        product.assignment_type === 'admin_assigned' 
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {product.assignment_type === 'admin_assigned' ? 'Admin Assigned' : 'Sales Rep Requested'}
                      </span>
                    </td>
                  )}
                  {!isReadOnly && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleEditProduct(product)}
                        className="text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-8">
            <div className="text-gray-500">No products found</div>
            {!isReadOnly && (
              <button
                onClick={() => setShowBulkEntry(true)}
                className="mt-2 text-red-600 hover:text-red-700 text-sm font-medium"
              >
                Add your first product
              </button>
            )}
          </div>
        )}
      </div>

      {showBulkEntry && (
        <BulkProductEntry
          onClose={() => setShowBulkEntry(false)}
          onProductsAdded={fetchProducts}
        />
      )}

      {showEditModal && editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={handleCloseEditModal}
          onProductUpdated={fetchProducts}
        />
      )}

      {showPriceModal && selectedProductForPrices && (
        <ProductPricesModal
          product={selectedProductForPrices}
          onClose={() => setShowPriceModal(false)}
          onPricesUpdated={fetchProducts}
        />
      )}

      {/* Stock Update Modal */}
      {showStockUpdateModal && selectedProductForStockUpdate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Update Stock Quantity
              </h3>
              <button
                onClick={() => setShowStockUpdateModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Product: <span className="font-medium text-gray-900">{selectedProductForStockUpdate.name}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Current Stock: <span className="font-medium text-gray-900">{selectedProductForStockUpdate.quantity} kg</span>
                </p>
              </div>
              <div className="space-y-3">
                <label htmlFor="stockAddition" className="block text-sm font-medium text-gray-700">
                  Enter Quantity to Add (kg)
                </label>
                <input
                  type="number"
                  id="stockAddition"
                  step="0.1"
                  min="0"
                  value={stockAdditionQuantity}
                  onChange={(e) => setStockAdditionQuantity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter quantity to add"
                />
                <p className="text-xs text-gray-500">
                  This amount will be added to the current stock quantity.
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
              <button
                onClick={() => setShowStockUpdateModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStockUpdate}
                disabled={!stockAdditionQuantity || parseFloat(stockAdditionQuantity) <= 0}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Update Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductRequestModal && (
        <ProductRequestModal
          onClose={() => setShowProductRequestModal(false)}
          onRequestSubmitted={fetchProducts}
        />
      )}
    </div>
  )
}