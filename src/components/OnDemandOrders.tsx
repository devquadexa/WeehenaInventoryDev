import React, { useState, useEffect } from 'react'
import { Package, Calendar, User, FileText } from 'lucide-react'
import { supabase, OnDemandAssignmentItem, OnDemandOrder, Customer } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export const OnDemandOrders: React.FC = () => {
  const { user, isOnline } = useAuth()
  const [completedOrders, setCompletedOrders] = useState<OnDemandOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.role === 'Sales Rep' || user?.role === 'Finance Admin') {
      fetchCompletedOrders()
    }
  }, [user])

  const fetchCompletedOrders = async () => {
    try {
      const cacheKey = `on_demand_orders_data_${user?.id || 'all'}`
      if (!isOnline) {
        const cachedData = localStorage.getItem(cacheKey)
        if (cachedData) {
          setCompletedOrders(JSON.parse(cachedData))
          setLoading(false)
          return
        }
      }

      let query = supabase
        .from('on_demand_orders')
        .select(`
          id, on_demand_order_display_id, customer_name, customer_phone, quantity_sold, total_amount, sale_date, selling_price, on_demand_assignment_item_id,
          on_demand_assignment_items(
            products(name)
          )
        `)
      
      // Finance Admin sees all on-demand orders, Sales Reps only see their own
      if (user?.role === 'Sales Rep') {
        query = query.eq('sales_rep_id', user.id)
      }
      
      query = query.order('sale_date', { ascending: false })

      const { data, error } = await query
      if (error) throw error
      
      localStorage.setItem(cacheKey, JSON.stringify(data))
      setCompletedOrders(data || [])
    } catch (error) {
      console.error('Error fetching completed orders:', error)
      const cacheKey = `on_demand_orders_data_${user?.id || 'all'}`
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        setCompletedOrders(JSON.parse(cachedData))
      } else {
        setCompletedOrders([])
      }
    } finally {
      setLoading(false)
    }
  }

  if (!['Sales Rep', 'Finance Admin'].includes(user?.role)) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only Sales Reps and Finance Admins can access On Demand orders.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading completed orders...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Completed On Demand Orders</h1>
      </div>

      {completedOrders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Completed Orders</h2>
          <p className="text-gray-600">You haven't completed any On Demand orders yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Mobile Card Layout */}
          <div className="block md:hidden">
            <div className="space-y-2">
              {completedOrders.map((order) => (
                <div key={order.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                        <FileText className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          Order {order.on_demand_order_display_id}
                        </h3>
                        <div className="flex items-center mt-1">
                          <span className="inline-block inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {order.on_demand_assignment_items?.products?.name || 'Unknown Product'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1 text-xs ml-11">
                    <div className="flex items-start">
                      <span className="text-gray-500 font-medium w-16 flex-shrink-0">Customer:</span>
                      <span className="text-gray-700 flex-1">{order.customer_name}</span>
                    </div>
                    {order.customer_phone && (
                      <div className="flex items-start">
                        <span className="text-gray-500 font-medium w-16 flex-shrink-0">Phone:</span>
                        <span className="text-gray-700 flex-1">{order.customer_phone}</span>
                      </div>
                    )}
                    <div className="flex items-start">
                      <span className="text-gray-500 font-medium w-16 flex-shrink-0">Quantity:</span>
                      <span className="text-gray-700 flex-1">{order.quantity_sold} kg</span>
                    </div>
                    <div className="flex items-start">
                      <span className="text-gray-500 font-medium w-16 flex-shrink-0">Total:</span>
                      <span className="text-gray-700 flex-1">Rs {order.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-start">
                      <span className="text-gray-500 font-medium w-16 flex-shrink-0">Date:</span>
                      <span className="text-gray-700 flex-1">{new Date(order.sale_date).toLocaleString()}</span>
                    </div>
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
                      Order Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity Sold
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Selling Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {completedOrders.map((order, index) => (
                    <tr key={order.id} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(order.sale_date).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {order.on_demand_order_display_id}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {order.on_demand_assignment_items?.products?.name || 'Unknown Product'}
                      </td>
                      {user?.role === 'Security Guard' && (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center">
                              <User className="w-4 h-4 text-blue-600 mr-2" />
                              {order.on_demand_assignment_items?.on_demand_assignments?.users?.username || 'Unknown'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {order.on_demand_assignment_items?.on_demand_assignments?.vehicle_number || '-'}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <div className="font-medium">{order.customer_name}</div>
                          {order.customer_phone && (
                            <div className="text-xs text-gray-500">{order.customer_phone}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {order.quantity_sold} kg
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        Rs {order.selling_price.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        Rs {order.total_amount.toFixed(2)}
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
  )
}