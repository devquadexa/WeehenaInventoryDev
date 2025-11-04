import React from 'react'
import { OnDemandOrder, OnDemandAssignmentItem, Product, Customer } from '../lib/supabase'
import WeehenaLogo from '../assets/images/unnamed (1).png'

interface OnDemandBillPrintLayoutProps {
  order: OnDemandOrder & {
    customer_details?: Customer;
    product_details?: (OnDemandAssignmentItem & { products: Product })[];
    sales_rep_username?: string;
  };
  paymentMethod: 'Net' | 'Cash';
  receiptNo: string;
}

export const OnDemandBillPrintLayout: React.FC<OnDemandBillPrintLayoutProps> = ({
  order,
  paymentMethod,
  receiptNo,
}) => {
  const getTotalAmount = () => {
    return order.total_amount;
  };

  return (
    <div
      className="p-8 bg-white text-gray-900"
      style={{
        fontFamily: 'sans-serif',
        maxWidth: '800px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div className="flex items-center">
          <img
            src={WeehenaLogo}
            alt="Weehena Farm Logo"
            className="h-16 w-auto mr-4"
          />
          <div>
            <h1 className="text-3xl font-bold">Weehena Farm</h1>
            <p className="text-sm text-gray-600">A Taste with Quality</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold text-red-600">SALES RECEIPT</h2>
          <p className="text-sm">Date: {new Date(order.sale_date).toLocaleDateString()}</p>
          <p className="text-sm">
            Receipt No: <span className="font-bold">{receiptNo}</span>
          </p>
        </div>
      </div>

      {/* Customer & Order Info */}
      <div className="mb-8 grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Bill To:</h3>
          <p className="font-medium">{order.customer_name}</p>
          {order.customer_details?.address && (
            <p className="text-gray-700">{order.customer_details.address}</p>
          )}
          <p className="text-gray-700">
            Phone: {order.customer_phone || order.customer_details?.phone_number || 'N/A'}
          </p>
        </div>
        <div className="text-right">
          <h3 className="text-lg font-semibold mb-2">Order Details:</h3>
          <p>
            Order ID: <span className="font-medium">{order.on_demand_order_display_id}</span>
          </p>
          <p>
            Payment Method:{' '}
            <span className="font-medium">{paymentMethod}</span>
          </p>
          <p>
            Sales Rep:{' '}
            <span className="font-medium">
              {order.sales_rep_username || 'N/A'}
            </span>
          </p>
          {/* Vehicle number is not directly on on_demand_orders, but could be passed if needed */}
          {/* {order.vehicle_number && (
            <p>
              Vehicle No:{' '}
              <span className="font-medium">{order.vehicle_number}</span>
            </p>
          )} */}
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Items:</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300">
              <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">
                Product
              </th>
              <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">
                Quantity (kg)
              </th>
              <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">
                Unit Price (Rs)
              </th>
              <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">
                Total (Rs)
              </th>
            </tr>
          </thead>
          <tbody>
            {order.product_details?.map((item) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-2 px-4 text-sm">{item.products.name}</td>
                <td className="text-right py-2 px-4 text-sm">{item.sold_quantity}</td>
                <td className="text-right py-2 px-4 text-sm">
                  {order.selling_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="text-right py-2 px-4 text-sm">
                  {(item.sold_quantity * order.selling_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50">
              <td
                colSpan={3}
                className="text-right py-3 px-4 text-base font-semibold"
              >
                Grand Total:
              </td>
              <td className="text-right py-3 px-4 text-base font-bold">
                Rs {getTotalAmount().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-600 pt-4 border-t">
        <p>Thank you for your business!</p>
        <p>Weehena Farm, [Your Address], [Your Phone Number]</p>
      </div>
    </div>
  );
};