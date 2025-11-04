import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Search, Eye, Check, X, CheckCircle, RotateCcw, Filter, User, DollarSign, Truck, FileText, Calendar, ShieldOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { PaymentConfirmationModal } from './PaymentConfirmationModal'
import { BillPrintLayout } from './BillPrintLayout'
import { sendBillEmail } from '../lib/emailService'
import { useLocation } from 'react-router-dom'
import { isOffHoursSriLanka } from '../utils/timeUtils'

interface OrderReturn {
  id: string
  order_item_id: string
  returned_quantity: number
  return_reason: string
  returned_by: string
  returned_at: string
  returned_by_user?: { username: string }
}

interface OrderItem {
  id: string
  quantity: number
  price: number
  returned_quantity: number
  products: { id: string; name: string }
  order_returns?: OrderReturn[]
}

interface Order {
  id: string
  customer_id: string
  status: 'Pending' | 'Assigned' | 'Products Loaded' | 'Product Reloaded' | 'Security Check Incomplete' | 'Security Checked' | 'Departed Farm' | 'Delivered' | 'Cancelled' | 'Completed' | 'Security Check Bypassed Due to Off Hours'
  created_by: string
  assigned_to: string | null
  completed_by: string | null
  security_check_status: string
  security_check_notes: string | null
  vehicle_number: string | null
  payment_method?: 'Net' | 'Cash' | null
  receipt_no?: string | null
  created_at: string
  completed_at: string | null
  order_display_id?: string
  request_id?: string
  delivery_date?: string | null
  purchase_order_id?: string
  payment_status?: 'fully_paid' | 'partially_paid' | 'unpaid'
  collected_amount?: number
  total_amount?: number
  vat_amount?: number
  is_vat_applicable?: boolean
  customers: { name: string; address: string; phone_number: string; email?: string; vat_status?: string }
  order_items: OrderItem[]
  assigned_user?: { username: string }
  completed_user?: { username: string }
}

// Predefined reasons for security check
const predefinedReasons = [
  'Missing Quantity',
  'Damaged Product',
  'Incorrect Labeling',
  'Unauthorized Product',
  'Documentation Mismatch',
  'Expired Product',
  'Overloaded/Improperly Loaded'
]

// Status priority map for custom sorting
const statusPriority: { [key: string]: number } = {
  'Assigned': 1,
  'Products Loaded': 2,
  'Security Check Incomplete': 3,
  'Security Checked': 3,
  'Departed Farm': 4,
  'Delivered': 5,
  'Completed': 6,
  'Pending': 7,
  'Product Reloaded': 8,
  'Cancelled': 9,
  'Security Check Bypassed Due to Off Hours': 10,
};

export const SalesOrders: React.FC = () => {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const { isOnline } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState(user?.role === 'Sales Rep' ? 'Assigned' : 'all')
  const [deliveryDateFilter, setDeliveryDateFilter] = useState(user?.role === 'Sales Rep' ? new Date().toISOString().split('T')[0] : '')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showSecurityModal, setShowSecurityModal] = useState(false)
  
  const [customerFilter, setCustomerFilter] = useState('all')
  const [salesRepFilter, setSalesRepFilter] = useState('all')
  const [customersList, setCustomersList] = useState<{ id: string; name: string }[]>([])
  const [selectedOrderForSecurity, setSelectedOrderForSecurity] = useState<Order | null>(null)
  const [securityNotes, setSecurityNotes] = useState('')
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [selectedOrderItem, setSelectedOrderItem] = useState<OrderItem | null>(null)
  const [returnQuantity, setReturnQuantity] = useState(0)
  const [returnReason, setReturnReason] = useState('')
  const [processingReturn, setProcessingReturn] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Payment state variables
  const [showPaymentConfirmationModal, setShowPaymentConfirmationModal] = useState(false)
  const [currentOrderForPayment, setCurrentOrderForPayment] = useState<Order | null>(null)
  const [paymentCollectedAmount, setPaymentCollectedAmount] = useState<number | ''>('')
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Net' | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [processingPayment, setProcessingPayment] = useState(false)
  const [allowPartialPayment, setAllowPartialPayment] = useState(true)

  const location = useLocation()
  const [salesRepsList, setSalesRepsList] = useState<{ id: string; username: string }[]>([])

  const [isOrdersFromCache, setIsOrdersFromCache] = useState(false)
  const [isFilterOptionsFromCache, setIsFilterOptionsFromCache] = useState(false)

  useEffect(() => {
    fetchOrders()
    fetchFilterOptions()
  }, [user, statusFilter, customerFilter, salesRepFilter, deliveryDateFilter, location.search])

  useEffect(() => {
    if (!isOnline) return
    const queryParams = new URLSearchParams(location.search)
    const orderId = queryParams.get('orderId')
    if (orderId && orders.length > 0) {
      const orderToOpen = orders.find(order => order.id === orderId)
      if (orderToOpen) {
        openOrderModal(orderToOpen)
      }
    }
  }, [orders, location.search])

  const fetchFilterOptions = async () => {
    try {
      setIsFilterOptionsFromCache(false)
      const cacheKeyCustomers = 'sales_orders_customers_filter'
      const cacheKeySalesReps = 'sales_orders_sales_reps_filter'

      if (!isOnline) {
        const cachedCustomers = localStorage.getItem(cacheKeyCustomers)
        const cachedSalesReps = localStorage.getItem(cacheKeySalesReps)
        if (cachedCustomers && cachedSalesReps) {
          setCustomersList(JSON.parse(cachedCustomers))
          setSalesRepsList(JSON.parse(cachedSalesReps))
          setIsFilterOptionsFromCache(true)
          return
        }
      }

      const { data: customersData, error: customersError } = await supabase.from('customers').select('id, name').order('name')
      if (customersError) throw customersError
      setCustomersList(customersData || [])
      localStorage.setItem(cacheKeyCustomers, JSON.stringify(customersData))

      const { data: salesRepsData, error: salesRepsError } = await supabase.from('users').select('id, username').eq('role', 'Sales Rep').order('username')
      if (salesRepsError) throw salesRepsError
      setSalesRepsList(salesRepsData || [])
      localStorage.setItem(cacheKeySalesReps, JSON.stringify(salesRepsData))
    } catch (error) {
      console.error('Error fetching filter options:', error)
      const cachedCustomers = localStorage.getItem('sales_orders_customers_filter')
      const cachedSalesReps = localStorage.getItem('sales_orders_sales_reps_filter')
      if (cachedCustomers && cachedSalesReps) {
        setCustomersList(JSON.parse(cachedCustomers))
        setSalesRepsList(JSON.parse(cachedSalesReps))
        setIsFilterOptionsFromCache(true)
      } else {
        setCustomersList([])
        setSalesRepsList([])
      }
    }
  }

  const getOrderTotal = (order: Order) => order.order_items.reduce((total, item) => total + item.quantity * item.price, 0)

  const applyCustomSorting = (ordersData: Order[]): Order[] => {
    if (!ordersData || ordersData.length === 0) return ordersData;

    return [...ordersData].sort((a, b) => {
      const dateA = a.delivery_date ? new Date(a.delivery_date).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.delivery_date ? new Date(b.delivery_date).getTime() : Number.MAX_SAFE_INTEGER;
      
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      
      const priorityA = statusPriority[a.status] || 999;
      const priorityB = statusPriority[b.status] || 999;
      
      return priorityA - priorityB;
    });
  }

  const fetchOrders = async () => {
  if (!user) return
  setLoading(true)
  setIsOrdersFromCache(false)
  const cacheKey = `sales_orders_data_${user.id}_${statusFilter}_${customerFilter}_${salesRepFilter}_${deliveryDateFilter}`

  if (!isOnline) {
    const cachedData = localStorage.getItem(cacheKey)
    if (cachedData) {
      try {
        const parsedData = JSON.parse(cachedData)
        const sortedData = applyCustomSorting(parsedData)
        setOrders(sortedData)
        setIsOrdersFromCache(true)
        setLoading(false)
        return
      } catch (error) {
        console.error('Error parsing cached data:', error)
      }
    }
  }

  try {
    let query = supabase
      .from('orders')
      .select(`
        id, customer_id, status, created_by, assigned_to, completed_by, security_check_status,
        security_check_notes, vehicle_number, created_at, completed_at, order_display_id,
        purchase_order_id, payment_method, receipt_no, delivery_date, payment_status, collected_amount,
        total_amount, vat_amount, is_vat_applicable,
        customers(name, address, phone_number, email, vat_status),
        order_items(
          id,
          quantity,
          price,
          returned_quantity,
          products(id, name)
        ),
        assigned_user:users!orders_assigned_to_fkey(username),
        completed_user:users!orders_completed_by_fkey(username)
      `)

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (customerFilter !== 'all') query = query.eq('customer_id', customerFilter)
      if (salesRepFilter !== 'all') query = query.eq('assigned_to', salesRepFilter)
      if (deliveryDateFilter) query = query.eq('delivery_date', deliveryDateFilter)

      if (user.role === 'Sales Rep') query = query.eq('assigned_to', user.id)

      if (user.role === 'Security Guard') {
        query = query.neq('status', 'Product Reloaded')
      }

      const { data, error } = await query
      if (error) throw error
      
      const sortedData = applyCustomSorting(data || [])
      setOrders(sortedData)
      localStorage.setItem(cacheKey, JSON.stringify(sortedData))
    } catch (error) {
      console.error('Error fetching orders:', error)
      const cachedData = localStorage.getItem(`sales_orders_data_${user.id}_${statusFilter}_${customerFilter}_${salesRepFilter}_${deliveryDateFilter}`)
      if (cachedData) {
        try {
          const parsedData = JSON.parse(cachedData)
          const sortedData = applyCustomSorting(parsedData)
          setOrders(sortedData)
          setIsOrdersFromCache(true)
        } catch (parseError) {
          console.error('Error parsing cached data:', parseError)
          setOrders([])
        }
      } else {
        setOrders([])
      }
    } finally {
      setLoading(false)
    }
  }

  const getAvailableStatusOptions = (order: Order) => {
    const currentStatus = order.status
    const userRole = user?.role

    if (!userRole) return []

    const allStatuses = [
      { value: 'Pending', label: 'Pending' },
      { value: 'Assigned', label: 'Assigned' },
      { value: 'Products Loaded', label: 'Products Loaded' },
      { value: 'Product Reloaded', label: 'Product Reloaded' },
      { value: 'Security Check Incomplete', label: 'Security Check Incomplete' },
      { value: 'Security Checked', label: 'Security Checked' },
      { value: 'Security Check Bypassed Due to Off Hours', label: 'Security Check Bypassed Due to Off Hours' },
      { value: 'Departed Farm', label: 'Departed Farm' },
      { value: 'Delivered - Payment Collected', label: 'Delivered - Payment Collected' },
      { value: 'Delivered - Payment Partially Collected', label: 'Delivered - Payment Partially Collected' },
      { value: 'Delivered', label: 'Delivered' },
      { value: 'Cancelled', label: 'Cancelled' },
      { value: 'Completed', label: 'Completed' }
    ]

    const baseOptions = userRole === 'Security Guard'
      ? allStatuses.filter(opt => opt.value !== 'Product Reloaded')
      : allStatuses

    switch (userRole) {
      case 'Sales Rep':
        switch (currentStatus) {
          case 'Assigned':
            return baseOptions.filter(opt => ['Assigned', 'Products Loaded'].includes(opt.value))
          case 'Products Loaded':
            return baseOptions.filter(opt => opt.value === 'Products Loaded')
          case 'Security Check Incomplete':
            return baseOptions.filter(opt => ['Security Check Incomplete', 'Product Reloaded'].includes(opt.value))
          case 'Security Checked':
            return baseOptions.filter(opt => ['Security Checked', 'Departed Farm'].includes(opt.value))
          case 'Security Check Bypassed Due to Off Hours':
            return baseOptions.filter(opt => ['Security Check Bypassed Due to Off Hours', 'Departed Farm'].includes(opt.value))
          case 'Departed Farm':
            return baseOptions.filter(opt => [
              'Departed Farm', 
              'Delivered - Payment Collected', 
              'Delivered - Payment Partially Collected'
            ].includes(opt.value))
          case 'Delivered':
            return baseOptions.filter(opt => opt.value === 'Delivered')
          default:
            return baseOptions.filter(opt => opt.value === currentStatus)
        }

      case 'Security Guard':
        switch (currentStatus) {
          case 'Products Loaded':
          case 'Product Reloaded':
            return baseOptions.filter(opt => ['Products Loaded', 'Security Checked', 'Security Check Incomplete'].includes(opt.value))
          case 'Security Check Incomplete':
            return baseOptions.filter(opt => opt.value === 'Security Check Incomplete')
          default:
            return baseOptions.filter(opt => opt.value === currentStatus)
        }

      case 'Admin':
      case 'Super Admin':
      case 'Order Manager':
      case 'Finance Admin':
        return baseOptions

      default:
        return baseOptions.filter(opt => opt.value === currentStatus)
    }
  }

  const handleUpdateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    if (!user) return
    setProcessing(true)

    try {
      if (newStatus === 'Delivered - Payment Collected') {
        const order = orders.find(o => o.id === orderId)
        if (order) {
          const totalAmount = order.total_amount || getOrderTotal(order)
          
          setCurrentOrderForPayment(order)
          setPaymentCollectedAmount(totalAmount)
          setAllowPartialPayment(false)
          setPaymentMethod('Cash')
          setPaymentError(null)
          setShowPaymentConfirmationModal(true)
          setProcessing(false)
          return
        }
      } 
      else if (newStatus === 'Delivered - Payment Partially Collected') {
        const order = orders.find(o => o.id === orderId)
        if (order) {
          setCurrentOrderForPayment(order)
          setPaymentCollectedAmount('')
          setAllowPartialPayment(true)
          setPaymentMethod(null)
          setPaymentError(null)
          setShowPaymentConfirmationModal(true)
          setProcessing(false)
          return
        }
      }
      else if (newStatus === 'Delivered') {
        const { error } = await supabase
          .from('orders')
          .update({ status: newStatus })
          .eq('id', orderId)
        if (error) throw error
      }
      else {
        const updateData: any = { status: newStatus }

        if (newStatus === 'Completed') {
          updateData.completed_by = user.id
          updateData.completed_at = new Date().toISOString()
        }

        if (newStatus === 'Security Check Incomplete') {
          const order = orders.find(o => o.id === orderId)
          if (order) {
            setSelectedOrderForSecurity(order)
            
            if (order.security_check_notes) {
              try {
                const parsedNotes = JSON.parse(order.security_check_notes)
                if (parsedNotes.reasons && Array.isArray(parsedNotes.reasons)) {
                  setSelectedReasons(parsedNotes.reasons)
                }
                if (parsedNotes.customNote) {
                  setSecurityNotes(parsedNotes.customNote)
                }
              } catch (error) {
                setSecurityNotes(order.security_check_notes)
                setSelectedReasons([])
              }
            } else {
              setSelectedReasons([])
              setSecurityNotes('')
            }
            
            setShowSecurityModal(true)
            setProcessing(false)
            return
          }
        }

        if (newStatus === 'Security Checked') {
          updateData.security_check_notes = null
          updateData.security_check_status = 'completed'
        }

        if (newStatus === 'Security Check Bypassed Due to Off Hours') {
          updateData.security_check_status = 'bypassed'
          const bypassNote = {
            bypassed: true,
            reason: 'Bypassed due to off-hours operation',
            timestamp: new Date().toISOString(),
            bypassedBy: user.id,
            note: 'Security check was bypassed as it is outside regular working hours (6:00 AM - 6:00 PM)'
          }
          updateData.security_check_notes = JSON.stringify(bypassNote)
        }

        const { error } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', orderId)

        if (error) throw error
      }

      await fetchOrders()
    } catch (error) {
      console.error('Error updating order status:', error)
      alert('Failed to update order status')
    } finally {
      setProcessing(false)
    }
  }

  // FIXED: handleConfirmPayment now sends email after successful payment
  const handleConfirmPayment = async (
    orderId: string, 
    method: 'Net' | 'Cash', 
    amountCollected: number
  ): Promise<string> => {
    setProcessingPayment(true)
    setPaymentError(null)
    
    try {
      const orderToUpdate = orders.find(o => o.id === orderId)
      if (!orderToUpdate || orderToUpdate.total_amount === undefined) {
        throw new Error('Order not found or total amount is missing.')
      }

      const finalPaymentStatus = amountCollected >= orderToUpdate.total_amount ? 'fully_paid' : 'partially_paid'

      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'Delivered',
          payment_status: finalPaymentStatus,
          collected_amount: amountCollected,
          payment_method: method,
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
        })
        .eq('id', orderId)
        .select('receipt_no')
        .single()

      if (updateError) throw updateError
      if (!updatedOrder || !updatedOrder.receipt_no) {
        throw new Error('Failed to get receipt number after update.')
      }

      // ✅ SEND EMAIL AFTER SUCCESSFUL PAYMENT
      console.log('=== Attempting to send bill email ===')
      
      if (orderToUpdate.customers.email) {
        const emailData = {
          customerEmail: orderToUpdate.customers.email,
          customerName: orderToUpdate.customers.name,
          orderDisplayId: orderToUpdate.order_display_id || 'N/A',
          receiptNo: updatedOrder.receipt_no,
          totalAmount: orderToUpdate.total_amount,
          paymentMethod: method,
          orderItems: orderToUpdate.order_items.map(item => ({
            productName: item.products.name,
            quantity: item.quantity,
            price: item.price,
            total: item.quantity * item.price
          })),
          orderDate: new Date(orderToUpdate.created_at).toLocaleDateString(),
          salesRepName: orderToUpdate.assigned_user?.username || 'N/A',
          vehicleNumber: orderToUpdate.vehicle_number,
          orderId: orderToUpdate.id,
          subTotal: (orderToUpdate.total_amount || 0) - (orderToUpdate.vat_amount || 0),
          vatAmount: orderToUpdate.vat_amount || 0,
          isVatApplicable: orderToUpdate.is_vat_applicable || false
        }

        console.log('Sending email with data:', emailData)
        
        const emailResult = await sendBillEmail(emailData)
        
        if (emailResult.success) {
          console.log('✅ Email sent successfully')
          alert('Payment confirmed and receipt email sent to customer!')
        } else {
          console.error('❌ Email send failed:', emailResult.error)
          alert(`Payment confirmed, but email failed to send: ${emailResult.error}`)
        }
      } else {
        console.warn('⚠️ No customer email found, skipping email send')
        alert('Payment confirmed! Note: No email address found for customer.')
      }

      return updatedOrder.receipt_no
    } catch (err: any) {
      console.error('Error confirming payment:', err)
      setPaymentError(err.message || 'Failed to confirm payment.')
      throw err
    } finally {
      setProcessingPayment(false)
    }
  }

  const handleBypassSecurityCheck = async (orderId: string) => {
    if (!user || user.role !== 'Security Guard') return
    
    setProcessing(true)
    try {
      const bypassNote = {
        bypassed: true,
        reason: 'Bypassed due to off-hours operation',
        timestamp: new Date().toISOString(),
        bypassedBy: user.id,
        note: 'Security check was bypassed as it is outside regular working hours (6:00 AM - 6:00 PM)'
      }

      const { error } = await supabase
        .from('orders')
        .update({
          status: 'Security Check Bypassed Due to Off Hours',
          security_check_status: 'bypassed',
          security_check_notes: JSON.stringify(bypassNote)
        })
        .eq('id', orderId)

      if (error) throw error

      alert('Security check bypassed successfully due to off-hours operation.')
      await fetchOrders()
    } catch (error) {
      console.error('Error bypassing security check:', error)
      alert('Failed to bypass security check. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  const handlePrintBill = (order: Order, paymentMethod: 'Net' | 'Cash', receiptNo: string) => {
    const printWindow = window.open('', '_blank', 'width=380,height=600')
    if (printWindow) {
      const totalAmount = order.total_amount || getOrderTotal(order)
      const vatAmount = order.vat_amount || 0
      const subtotal = totalAmount - vatAmount
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Weehena Farm - Sales Receipt</title>
            <style>
              @page {
                size: 80mm auto;
                margin: 0;
                padding: 0;
              }
              
              body {
                font-family: 'Courier New', monospace;
                font-size: 12px;
                line-height: 1;
                margin: 0;
                padding: 2px;
                width: 80mm;
                background: white;
                color: black;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              
              .container {
                width: 100%;
                max-width: 80mm;
                margin: 0 auto;
                padding: 0;
              }
              
              .header {
                text-align: center;
                margin-bottom: 3px;
              }
              
              .company-name {
                font-size: 18px;
                margin: 2px 0;
                text-transform: uppercase;
              }
              
              .tagline {
                font-size: 12px;
                margin: 1px 0;
              }
              
              .receipt-title {
                font-size: 16px;
                margin: 3px 0;
                text-transform: uppercase;
              }
              
              .receipt-info {
                text-align: center;
                margin: 2px 0;
                font-size: 11px;
              }
              
              .divider {
                border-top: 1px dashed #000;
                margin: 3px 0;
              }
              
              .section {
                margin: 3px 0;
              }
              
              .section-title {
                font-size: 12px;
                margin: 2px 0;
              }
              
              .info-line {
                font-size: 11px;
                margin: 1px 0;
                line-height: 1.1;
              }
              
              .items-table {
                width: 100%;
                font-size: 10px;
                border-collapse: collapse;
                margin: 2px 0;
              }
              
              .items-table th {
                text-align: left;
                padding: 1px 2px;
                border-bottom: 1px solid #000;
              }
              
              .items-table td {
                padding: 1px 2px;
                border-bottom: 1px dotted #ccc;
                vertical-align: top;
              }
              
              .text-right {
                text-align: right;
              }
              
              .text-center {
                text-align: center;
              }
              
              .total-section {
                margin-top: 5px;
                border-top: 2px solid #000;
                padding-top: 3px;
              }
              
              .total-row {
                font-size: 12px;
              }
              
              .footer {
                text-align: center;
                margin-top: 8px;
                padding-top: 5px;
                border-top: 1px solid #000;
                font-size: 10px;
                line-height: 1.1;
              }
              
              .spacer {
                height: 5px;
              }
              
              @media print {
                body {
                  margin: 0;
                  padding: 2px;
                  width: 80mm;
                  font-size: 12px;
                }
                .container {
                  box-shadow: none;
                  border: none;
                }
                .no-print {
                  display: none !important;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="company-name">WEEHENA FARM</div>
                <div class="tagline">A Taste with Quality</div>
                <div class="receipt-title">SALES RECEIPT</div>
                <div class="receipt-info">
                  Date: ${new Date().toLocaleDateString('en-GB')}<br>
                  Receipt No: ${receiptNo}
                </div>
              </div>

              <div class="divider"></div>

              <div class="section">
                <div class="section-title">BILL TO:</div>
                <div class="info-line">${order.customers.name}</div>
                <div class="info-line">${order.customers.address}</div>
                <div class="info-line">Phone: ${order.customers.phone_number}</div>
                ${order.customers.vat_status ? `<div class="info-line">VAT Status: ${order.customers.vat_status}</div>` : ''}
              </div>

              <div class="divider"></div>

              <div class="section">
                <div class="section-title">ORDER DETAILS:</div>
                <div class="info-line">Order ID: ${order.order_display_id}</div>
                <div class="info-line">Payment: ${paymentMethod}</div>
                <div class="info-line">Sales Rep: ${order.assigned_user?.username || 'N/A'}</div>
                ${order.vehicle_number ? `<div class="info-line">Vehicle: ${order.vehicle_number}</div>` : ''}
              </div>

              <div class="divider"></div>

              <div class="section">
                <div class="section-title">ORDER ITEMS:</div>
                <table class="items-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th class="text-right">Qty</th>
                      <th class="text-right">Price</th>
                      <th class="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${order.order_items.map(item => `
                      <tr>
                        <td>${item.products.name}</td>
                        <td class="text-right">${item.quantity}</td>
                        <td class="text-right">${item.price.toFixed(2)}</td>
                        <td class="text-right">${(item.quantity * item.price).toFixed(2)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>

              <div class="divider"></div>

              <div class="total-section">
                <table class="items-table">
                  ${order.is_vat_applicable ? `
                    <tr>
                      <td colspan="3">Subtotal:</td>
                      <td class="text-right">Rs ${subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colspan="3">VAT (18%):</td>
                      <td class="text-right">Rs ${vatAmount.toFixed(2)}</td>
                    </tr>
                  ` : ''}
                  <tr class="total-row">
                    <td colspan="3">GRAND TOTAL:</td>
                    <td class="text-right">Rs ${totalAmount.toFixed(2)}</td>
                  </tr>
                </table>
              </div>

              <div class="spacer"></div>

              <div class="footer">
                <div>Thank you for your business!</div>
                <div>Weehena Farm - Quality Poultry Products</div>
                <div>${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>

              <div style="height: 20px;"></div>
            </div>
          </body>
        </html>
      `)
      printWindow.document.close()

      setTimeout(() => {
        printWindow.focus()
        printWindow.print()
        setTimeout(() => {
          printWindow.close()
        }, 500)
      }, 500)
    } else {
      alert('Please allow pop-ups to print the bill.')
    }
  }

  const handleSecurityCheck = async (orderId: string, status: 'completed' | 'incomplete') => {
    if (!user || user.role !== 'Security Guard') return
    
    if (status === 'incomplete') {
      if (selectedReasons.length === 0 && !securityNotes.trim()) {
        alert('Please select at least one reason or provide custom notes for incomplete orders')
        return
      }
    }
    
    setProcessing(true)
    try {
      const securityStatus = status === 'completed' ? 'Security Checked' : 'Security Check Incomplete'
      
      const updateData: any = { 
        security_check_status: status,
        status: securityStatus
      }
      
      if (status === 'incomplete') {
        const securityData = {
          reasons: selectedReasons,
          customNote: securityNotes.trim()
        }
        updateData.security_check_notes = JSON.stringify(securityData)
      } else {
        updateData.security_check_notes = null
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId)
      if (error) throw error

      setShowSecurityModal(false)
      setSelectedOrderForSecurity(null)
      setSecurityNotes('')
      setSelectedReasons([])
      await fetchOrders()
    } catch (error) {
      console.error('Error updating security check:', error)
      alert('Failed to update security check')
    } finally {
      setProcessing(false)
    }
  }

  const handleReasonChange = (reason: string) => {
    setSelectedReasons(prev => 
      prev.includes(reason) 
        ? prev.filter(r => r !== reason)
        : [...prev, reason]
    )
  }

  const handleOpenReturnModal = (item: OrderItem) => {
    setSelectedOrderItem(item)
    setReturnQuantity(1)
    setReturnReason('')
    setShowReturnModal(true)
  }

  const handleProcessReturn = async () => {
    if (!selectedOrderItem || !user) return alert('Missing required information for return')
    if (returnQuantity <= 0) return alert('Return quantity must be greater than 0')
    if (!returnReason.trim()) return alert('Please provide a reason for the return')

    const availableToReturn = selectedOrderItem.quantity - (selectedOrderItem.returned_quantity || 0)
    if (returnQuantity > availableToReturn) {
      return alert(`Cannot return ${returnQuantity}. Only ${availableToReturn} available to return.`)
    }

    setProcessingReturn(true)
    try {
      const { data: currentOrderItem, error: fetchOrderItemError } = await supabase
        .from('order_items')
        .select('returned_quantity')
        .eq('id', selectedOrderItem.id)
        .single()

      if (fetchOrderItemError) throw fetchOrderItemError

      const currentReturnedQuantity = currentOrderItem?.returned_quantity || 0
      const newReturnedQuantity = currentReturnedQuantity + returnQuantity

      const { error: orderItemError } = await supabase
        .from('order_items')
        .update({ returned_quantity: newReturnedQuantity })
        .eq('id', selectedOrderItem.id)

      if (orderItemError) throw orderItemError

      const { error: returnError } = await supabase
        .from('order_returns')
        .insert([{
          order_item_id: selectedOrderItem.id,
          returned_quantity: returnQuantity,
          return_reason: returnReason.trim(),
          returned_by: user.id,
          returned_at: new Date().toISOString(),
          sales_rep_id: user.id
        }])
      if (returnError) throw returnError

      const { data: currentProduct, error: fetchProductError } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', selectedOrderItem.products.id)
        .single()

      if (fetchProductError) throw fetchProductError

      const currentProductQuantity = currentProduct?.quantity || 0
      const newProductQuantity = currentProductQuantity + returnQuantity

      const { error: inventoryError } = await supabase
        .from('products')
        .update({ quantity: newProductQuantity })
        .eq('id', selectedOrderItem.products.id)

      if (inventoryError) throw inventoryError

      alert('Return processed successfully!')
      setShowReturnModal(false)
      setSelectedOrderItem(null)
      setReturnQuantity(0)
      setReturnReason('')
      await fetchOrders()
    } catch (error) {
      console.error('Error processing return:', error)
      alert('Failed to process return. Please try again.')
    } finally {
      setProcessingReturn(false)
    }
  }

  const openOrderModal = (order: Order) => {
    setSelectedOrder(order)
    setSecurityNotes(order.security_check_notes || '')
    setShowOrderModal(true)
  }

  const openSecurityModal = (order: Order) => {
    setSelectedOrderForSecurity(order)
    
    if (order.security_check_notes) {
      try {
        const parsedNotes = JSON.parse(order.security_check_notes)
        if (parsedNotes.reasons && Array.isArray(parsedNotes.reasons)) {
          setSelectedReasons(parsedNotes.reasons)
        }
        if (parsedNotes.customNote) {
          setSecurityNotes(parsedNotes.customNote)
        }
      } catch (error) {
        setSecurityNotes(order.security_check_notes)
        setSelectedReasons([])
      }
    } else {
      setSelectedReasons([])
      setSecurityNotes('')
    }
    
    setShowSecurityModal(true)
  }

  const getFilteredAndSearchedOrders = () => {
    let filtered = orders

    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase()
      filtered = filtered.filter(order =>
        order.order_display_id?.toLowerCase().includes(lowerCaseSearchTerm) ||
        order.customers.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        order.purchase_order_id?.toLowerCase().includes(lowerCaseSearchTerm) ||
        order.assigned_user?.username?.toLowerCase().includes(lowerCaseSearchTerm) ||
        order.vehicle_number?.toLowerCase().includes(lowerCaseSearchTerm) ||
        (order.total_amount || getOrderTotal(order)).toFixed(2).includes(lowerCaseSearchTerm) ||
        order.status.toLowerCase().includes(lowerCaseSearchTerm)
      )
    }

    return filtered
  }

  const getPendingBalance = (order: Order) => {
    const totalAmount = order.total_amount || getOrderTotal(order)
    const collectedAmount = order.collected_amount || 0
    return totalAmount - collectedAmount
  }

  const renderPaymentStatus = (order: Order) => {
    const paymentStatus = order.payment_status || 'unpaid'
    const pendingBalance = getPendingBalance(order)
    
    let badgeClass = ''
    let statusText = ''
    
    switch (paymentStatus) {
      case 'fully_paid':
        badgeClass = 'bg-green-100 text-green-800'
        statusText = 'Fully Paid'
        break
      case 'partially_paid':
        badgeClass = 'bg-blue-100 text-blue-800'
        statusText = 'Partially Paid'
        break
      case 'unpaid':
      default:
        badgeClass = 'bg-red-100 text-red-800'
        statusText = 'Unpaid'
        break
    }
    
    return (
      <div className="flex flex-col space-y-1">
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${badgeClass}`}>
          {statusText}
        </span>
        {paymentStatus === 'partially_paid' && (
          <span className="text-xs text-gray-600">
            Pending: Rs {pendingBalance.toFixed(2)}
          </span>
        )}
      </div>
    )
  }

  const renderSecurityCheckNotes = (notes: string | null | undefined) => {
    if (!notes) {
      return (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
          No notes provided.
        </div>
      )
    }

    try {
      const parsedNotes = JSON.parse(notes)
      
      if (parsedNotes.bypassed) {
        return (
          <div className="mt-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center mb-2">
              <ShieldOff className="w-4 h-4 text-yellow-600 mr-2" />
              <strong className="text-yellow-800">Security Check Bypassed</strong>
            </div>
            <p className="text-sm text-yellow-700 mb-1">{parsedNotes.note}</p>
            <p className="text-xs text-yellow-600">Reason: {parsedNotes.reason}</p>
            <p className="text-xs text-yellow-600">
              Bypassed at: {new Date(parsedNotes.timestamp).toLocaleString()}
            </p>
          </div>
        )
      }

      return (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg">
          {parsedNotes.reasons && parsedNotes.reasons.length > 0 && (
            <div className="mb-2">
              <strong>Reasons:</strong>
              <ul className="list-disc list-inside mt-1">
                {parsedNotes.reasons.map((reason: string, index: number) => (
                  <li key={index} className="text-sm text-gray-700">{reason}</li>
                ))}
              </ul>
            </div>
          )}
          {parsedNotes.customNote && (
            <div>
              <strong>Additional Notes:</strong>
              <p className="text-sm text-gray-700 mt-1">{parsedNotes.customNote}</p>
            </div>
          )}
        </div>
      )
    } catch (error) {
      return (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">
            <strong>Notes:</strong> {notes}
          </p>
        </div>
      )
    }
  }

  if (loading && orders.length === 0) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-500">Loading orders...</div>
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Orders</h1>
          <p className="text-sm text-gray-600">Manage all orders and returns</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              {['Pending', 'Assigned', 'Products Loaded', ...(user?.role !== 'Security Guard' ? ['Product Reloaded'] : []), 'Security Check Incomplete', 'Security Checked', 'Security Check Bypassed Due to Off Hours', 'Departed Farm', 'Delivered', 'Cancelled', 'Completed'].map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="all">All Customers</option>
              {customersList.map(customer => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Truck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={salesRepFilter}
              onChange={(e) => setSalesRepFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="all">All Sales Reps</option>
              {salesRepsList.map(rep => (
                <option key={rep.id} value={rep.id}>{rep.username}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="date"
              value={deliveryDateFilter}
              onChange={(e) => setDeliveryDateFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Delivery Date"
            />
          </div>

          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search all fields..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="block md:hidden">
          <div className="space-y-2">
            {getFilteredAndSearchedOrders().map((order) => (
              <div key={order.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        Order {order.order_display_id}
                      </h3>
                      <div className="flex items-center mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          order.status === 'Delivered' || order.status === 'Completed'
                            ? 'bg-green-100 text-green-800'
                            : order.status === 'Security Check Incomplete'
                            ? 'bg-red-100 text-red-800'
                            : order.status === 'Security Checked'
                            ? 'bg-blue-100 text-blue-800'
                            : order.status === 'Security Check Bypassed Due to Off Hours'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-3">
                    <button
                      onClick={() => openOrderModal(order)}
                      className="p-2.5 text-blue-600 bg-blue-100 rounded-full hover:bg-blue-200 touch-manipulation"
                      title="View Details"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-1 text-xs ml-11">
                  <div className="flex items-start">
                    <span className="text-gray-500 font-medium w-16 flex-shrink-0">Customer:</span>
                    <span className="text-gray-700 flex-1">{order.customers.name}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-gray-500 font-medium w-16 flex-shrink-0">Sales Rep:</span>
                    <span className="text-gray-700 flex-1">{order.assigned_user?.username || 'Unassigned'}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-gray-500 font-medium w-16 flex-shrink-0">Vehicle:</span>
                    <span className="text-gray-700 flex-1">{order.vehicle_number || 'N/A'}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-gray-500 font-medium w-16 flex-shrink-0">Total:</span>
                    <span className="text-gray-700 flex-1">Rs {(order.total_amount || getOrderTotal(order)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  
                  {(user?.role === 'Finance Admin' || user?.role === 'Admin' || user?.role === 'Super Admin') && (
                    <>
                      <div className="flex items-start">
                        <span className="text-gray-500 font-medium w-20 flex-shrink-0">Collected:</span>
                        <span className="text-gray-700 flex-1">Rs {(order.collected_amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-start">
                        <span className="text-gray-500 font-medium w-20 flex-shrink-0">Pending:</span>
                        <span className="text-gray-700 flex-1">Rs {getPendingBalance(order).toFixed(2)}</span>
                      </div>
                      <div className="flex items-start">
                        <span className="text-gray-500 font-medium w-20 flex-shrink-0">Payment Status:</span>
                        <div className="flex-1">
                          {renderPaymentStatus(order)}
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div className="flex items-start">
                    <span className="text-gray-500 font-medium w-16 flex-shrink-0">Created:</span>
                    <span className="text-gray-700 flex-1">{new Date(order.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-gray-500 font-medium w-16 flex-shrink-0">Delivery:</span>
                    <span className="text-gray-700 flex-1">{order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  {order.completed_at && (
                    <div className="flex items-start">
                      <span className="text-gray-500 font-medium w-16 flex-shrink-0">Completed:</span>
                      <span className="text-gray-700 flex-1">{new Date(order.completed_at).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center pt-2 border-t border-gray-200 mt-2">
                    <span className="text-gray-500 font-medium w-16 flex-shrink-0">Status:</span>
                    <select
                      value={order.status}
                      onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as Order['status'])}
                      disabled={processing}
                      className="text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      {getAvailableStatusOptions(order).map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {user?.role === 'Security Guard' && order.status === 'Security Check Incomplete' && isOffHoursSriLanka() && (
                    <div className="pt-2">
                      <button
                        onClick={() => handleBypassSecurityCheck(order.id)}
                        disabled={processing}
                        className="w-full flex items-center justify-center px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
                      >
                        <ShieldOff className="w-4 h-4 mr-2" />
                        Bypass Security Check (Off Hours)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Purchase Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Sales Rep</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                  
                  {(user?.role === 'Finance Admin' || user?.role === 'Admin' || user?.role === 'Super Admin') && (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Collected Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Status</th>
                    </>
                  )}
                  
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {getFilteredAndSearchedOrders().map((order, index) => (
                  <tr key={order.id} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {order.order_display_id}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.customers.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.purchase_order_id || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.assigned_user?.username || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.vehicle_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      Rs {(order.total_amount || getOrderTotal(order)).toFixed(2)}
                    </td>
                    
                    {(user?.role === 'Finance Admin' || user?.role === 'Admin' || user?.role === 'Super Admin') && (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          Rs {(order.collected_amount || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          Rs {getPendingBalance(order).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {renderPaymentStatus(order)}
                        </td>
                      </>
                    )}
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                        order.status === 'Delivered' || order.status === 'Completed'
                          ? 'bg-green-100 text-green-800'
                          : order.status === 'Security Check Incomplete'
                          ? 'bg-red-100 text-red-800'
                          : order.status === 'Security Checked'
                          ? 'bg-blue-100 text-blue-800'
                          : order.status === 'Security Check Bypassed Due to Off Hours'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2 items-center">
                        <button
                          onClick={() => openOrderModal(order)}
                          className="p-2 text-blue-600 hover:text-blue-900 rounded-full hover:bg-blue-100"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <select
                          value={order.status}
                          onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as Order['status'])}
                          disabled={processing}
                          className="text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500"
                        >
                          {getAvailableStatusOptions(order).map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        {user?.role === 'Security Guard' && order.status === 'Security Check Incomplete' && isOffHoursSriLanka() && (
                          <button
                            onClick={() => handleBypassSecurityCheck(order.id)}
                            disabled={processing}
                            className="flex items-center px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 text-sm"
                            title="Bypass Security Check (Off Hours)"
                          >
                            <ShieldOff className="w-4 h-4 mr-1" />
                            Bypass
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Order Details {selectedOrder.order_display_id}</h2>
              <button onClick={() => setShowOrderModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>

            <div className="mb-4">
              <h3 className="font-semibold mb-2">Customer Information</h3>
              <p>Name: {selectedOrder.customers.name}</p>
              <p>Address: {selectedOrder.customers.address}</p>
              <p>Phone: {selectedOrder.customers.phone_number}</p>
              {selectedOrder.customers.email && (
                <p>Email: {selectedOrder.customers.email}</p>
              )}
              {selectedOrder.purchase_order_id && (
                <p>Purchase Order ID: {selectedOrder.purchase_order_id}</p>
              )}
              {selectedOrder.vehicle_number && (
                <p>Vehicle: {selectedOrder.vehicle_number}</p>
              )}
              {selectedOrder.delivery_date && (
                <p>Delivery Date: {new Date(selectedOrder.delivery_date).toLocaleDateString()}</p>
              )}
              {selectedOrder.completed_at && (
                <p>Completed At: {new Date(selectedOrder.completed_at).toLocaleString()}</p>
              )}
              {selectedOrder.assigned_user && (
                <p>Assigned Sales Rep: {selectedOrder.assigned_user.username}</p>
              )}
              {selectedOrder.payment_method && (
                <p>Payment Method: {selectedOrder.payment_method}</p>
              )}
              {selectedOrder.receipt_no && (
                <p>Receipt No: {selectedOrder.receipt_no}</p>
              )}
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-2">VAT Information</h4>
                <p>VAT Applicable: {selectedOrder.is_vat_applicable ? 'Yes' : 'No'}</p>
                {selectedOrder.is_vat_applicable && (
                  <>
                    <p>VAT Amount: Rs {selectedOrder.vat_amount?.toFixed(2) || '0.00'}</p>
                    <p>Subtotal: Rs {((selectedOrder.total_amount || getOrderTotal(selectedOrder)) - (selectedOrder.vat_amount || 0)).toFixed(2)}</p>
                  </>
                )}
                <p>Customer VAT Status: {selectedOrder.customers.vat_status || 'Not specified'}</p>
              </div>
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">Payment Information</h4>
                <p>Total Amount: Rs {(selectedOrder.total_amount || getOrderTotal(selectedOrder)).toFixed(2)}</p>
                <p>Collected Amount: Rs {(selectedOrder.collected_amount || 0).toFixed(2)}</p>
                <p>Pending Balance: Rs {getPendingBalance(selectedOrder).toFixed(2)}</p>
                <p>Payment Status: 
                  <span className={`ml-2 inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                    selectedOrder.payment_status === 'fully_paid' ? 'bg-green-100 text-green-800' :
                    selectedOrder.payment_status === 'partially_paid' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {selectedOrder.payment_status === 'fully_paid' ? 'Fully Paid' :
                     selectedOrder.payment_status === 'partially_paid' ? 'Partially Paid' : 'Unpaid'}
                  </span>
                </p>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="font-semibold mb-2">Security Check Status</h3>
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  selectedOrder.security_check_status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : selectedOrder.security_check_status === 'incomplete'
                    ? 'bg-red-100 text-red-800'
                    : selectedOrder.security_check_status === 'bypassed'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {selectedOrder.security_check_status === 'completed' ? 'Checked Complete' :
                   selectedOrder.security_check_status === 'incomplete' ? 'Checked Incomplete' :
                   selectedOrder.security_check_status === 'bypassed' ? 'Bypassed Due to Off Hours' :
                   'Pending Check'}
                </span>
              </div>
              {renderSecurityCheckNotes(selectedOrder.security_check_notes)}
            </div>

            <div className="mb-4">
              <h3 className="font-semibold mb-2">Order Items</h3>
              <div className="space-y-2">
                {selectedOrder.order_items.map(item => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium">{item.products.name}</div>
                      <div className="text-sm text-gray-500">
                        Rs {item.price.toFixed(2)} × {item.quantity} kg
                        {item.returned_quantity > 0 && (
                          <span className="text-red-600 ml-2">
                            (Returned: {item.returned_quantity} kg)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {user?.role === 'Sales Rep' && (
                        <button
                          onClick={() => handleOpenReturnModal(item)}
                          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                        >
                          Return
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {user?.role === 'Security Guard' && selectedOrder.status === 'Security Check Incomplete' && isOffHoursSriLanka() && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleBypassSecurityCheck(selectedOrder.id)}
                  disabled={processing}
                  className="w-full flex items-center justify-center px-4 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors"
                >
                  <ShieldOff className="w-5 h-5 mr-2" />
                  Bypass Security Check (Off Hours Operation)
                </button>
                <p className="text-sm text-gray-600 mt-2 text-center">
                  This action is only available outside regular working hours (6:00 AM - 6:00 PM)
                </p>
              </div>
            )}

          </div>
        </div>
      )}

      {showSecurityModal && selectedOrderForSecurity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Security Check</h2>
              <button
                onClick={() => setShowSecurityModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4">
              <h3 className="font-medium text-gray-900 mb-2">
                Order {selectedOrderForSecurity.order_display_id}
              </h3>
              <p className="text-sm text-gray-600">Customer: {selectedOrderForSecurity.customers.name}</p>
              <p className="text-sm text-gray-600">Sales Rep: {selectedOrderForSecurity.assigned_user?.username || 'Unassigned'}</p>
              {selectedOrderForSecurity.vehicle_number && (
                <p className="text-sm text-gray-600">Vehicle: {selectedOrderForSecurity.vehicle_number}</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Reasons (for incomplete checks)
              </label>
              <div className="space-y-2">
                {predefinedReasons.map((reason) => (
                  <label key={reason} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedReasons.includes(reason)}
                      onChange={() => handleReasonChange(reason)}
                      className="mr-2"
                    />
                    <span className="text-sm">{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Notes
              </label>
              <textarea
                value={securityNotes}
                onChange={(e) => setSecurityNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                rows={3}
                placeholder="Add any additional notes about the security check..."
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowSecurityModal(false)
                  setSelectedOrderForSecurity(null)
                  setSecurityNotes('')
                  setSelectedReasons([])
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSecurityCheck(selectedOrderForSecurity.id, 'incomplete')}
                disabled={processing}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Ok'}
              </button>
            </div>

            {user?.role === 'Security Guard' && isOffHoursSriLanka() && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowSecurityModal(false)
                    handleBypassSecurityCheck(selectedOrderForSecurity.id)
                  }}
                  disabled={processing}
                  className="w-full flex items-center justify-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors"
                >
                  <ShieldOff className="w-4 h-4 mr-2" />
                  Bypass Security Check (Off Hours)
                </button>
                <p className="text-xs text-gray-600 mt-1 text-center">
                  Available outside 6:00 AM - 6:00 PM
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showReturnModal && selectedOrderItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Return Product</h2>
            <p className="mb-2">{selectedOrderItem.products.name}</p>
            <p className="mb-2 text-sm text-gray-600">
              Available to return: {selectedOrderItem.quantity - (selectedOrderItem.returned_quantity || 0)} kg
              {selectedOrderItem.returned_quantity > 0 && (
                <span className="text-red-600 ml-1">
                  (Already returned: {selectedOrderItem.returned_quantity} kg)
                </span>
              )}
            </p>

            <label className="block mb-2">Return Quantity (kg) *</label>
            <input
              type="number"
              step="0.1"
              value={returnQuantity}
              onChange={(e) => setReturnQuantity(parseFloat(e.target.value) || 0)}
              min="0.1"
              max={selectedOrderItem.quantity - (selectedOrderItem.returned_quantity || 0)}
              className="w-full mb-3 px-3 py-2 border rounded"
            />

            <label className="block mb-2">Return Reason *</label>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              rows={3}
              className="w-full mb-3 px-3 py-2 border rounded"
              placeholder="Please explain why you are returning this product..."
            />

            <div className="flex space-x-2">
              <button onClick={() => setShowReturnModal(false)} className="flex-1 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
              <button onClick={handleProcessReturn} className="flex-1 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">
                {processingReturn ? 'Processing...' : 'Process Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentConfirmationModal && currentOrderForPayment && (
        <PaymentConfirmationModal
          order={currentOrderForPayment}
          onClose={() => {
            setShowPaymentConfirmationModal(false)
            setCurrentOrderForPayment(null)
            setPaymentCollectedAmount('')
            setPaymentMethod(null)
            setPaymentError(null)
          }}
          onConfirm={handleConfirmPayment}
          onPrintBill={handlePrintBill}
          loading={processingPayment}
          is_on_demand={false}
          paymentCollectedAmount={paymentCollectedAmount}
          setPaymentCollectedAmount={setPaymentCollectedAmount}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentError={paymentError}
          allowPartialPayment={allowPartialPayment}
        />
      )}
    </div>
  )
}