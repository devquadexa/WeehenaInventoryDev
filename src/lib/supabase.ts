import { createClient } from '@supabase/supabase-js'

let supabase: any = null
let supabaseInitError: string | null = null

try {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    const errorMessage = 'Missing Supabase environment variables. Please check your .env file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_SERVICE_ROLE_KEY) are set correctly.'
    console.error('Missing Supabase environment variables:', {
      url: supabaseUrl ? 'Present' : 'Missing',
      key: supabaseKey ? 'Present' : 'Missing'
    })
    throw new Error(errorMessage)
  }

  // Validate URL format
  try {
    new URL(supabaseUrl)
  } catch (error) {
    const errorMessage = `Invalid Supabase URL format: ${supabaseUrl}. Please ensure VITE_SUPABASE_URL is a valid URL (e.g., https://your-project-ref.supabase.co)`
    console.error('Invalid Supabase URL:', supabaseUrl)
    throw new Error(errorMessage)
  }

  // Validate API key format (basic check)
  if (supabaseKey.length < 100) {
    const errorMessage = `Invalid Supabase API key format. Expected 100+ characters, got ${supabaseKey.length}. Please ensure your Supabase key is correct.`
    console.error('Invalid Supabase API key length:', supabaseKey.length)
    console.error('Expected length: 100+ characters, got:', supabaseKey.length)
    console.error('Current key starts with:', supabaseKey.substring(0, 20) + '...')
    throw new Error(errorMessage)
  }

  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce'
    },
    global: {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    },
    db: {
      schema: 'public'
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    },
  })

} catch (error) {
  console.error('Failed to initialize Supabase client:', error)
  supabaseInitError = error instanceof Error ? error.message : 'Unknown error occurred during Supabase initialization'
  supabase = null
}

export { supabase, supabaseInitError }

// =======================
// === Type Interfaces ===
// =======================

export interface Product {
  id: string
  product_id?: string
  name: string
  category: string
  category_id?: string
  sku: string
  quantity: number
  // REMOVED: price, price_threshold, threshold_price
  // ADDED: New price structure based on customer category and payment type
  price_dealer_cash: number // New
  price_dealer_credit: number // New
  price_hotel_cash: number // New
  price_hotel_credit: number // New
  threshold: number
  created_at: string
}

export interface Category {
  category_id: string
  category_name: string
  category_display_id: string
  category_code: string
  description: string
  status: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  customer_display_id: string
  address: string
  email?: string
  phone_number: string
  type: 'Cash' | 'Credit'
  created_at: string
  customer_category: 'Dealer' | 'Hotel' | 'Other'
  vat_status: 'VAT' | 'Non-VAT'
  tin_number?: string | null
}

export interface ContactPerson {
  id: string
  customer_id: string
  name: string
  phone_number: string
  created_at: string
}

export interface Order {
  id: string
  customer_id: string
  order_display_id: string
  purchase_order_id?: string | null
  status:
    | 'Pending'
    | 'Assigned'
    | 'Products Loaded'
    | 'Security Check Incomplete'
    | 'Security Checked'
    | 'Departed Farm'
    | 'Delivered'
    | 'Cancelled'
    | 'Completed'
    | 'Security Check Bypassed Due to Off Hours'
  created_by: string
  created_at: string
  completed_at?: string
  assigned_to: string | null
  completed_by: string | null
  security_check_status: 'pending' | 'completed' | 'incomplete' | 'bypassed'
  security_check_notes: string | null
  vehicle_number: string | null
  payment_method?: 'Net' | 'Cash' | null
  receipt_no?: string | null

  // ✅ Payment fields
  payment_status?: 'fully_paid' | 'partially_paid' | 'unpaid'
  collected_amount?: number | null

  // ✅ Updated and new VAT-related fields
  total_amount: number // Changed from optional to required
  vat_amount: number // New
  is_vat_applicable: boolean // New
}

export interface OrderItem {
  id: string
  order_id: string
  item_id: string
  quantity: number
  price: number
  discount: number
}

export interface User {
  id: string
  username: string
  password_hash: string
  role: 'Super Admin' | 'Admin' | 'Sales Rep' | 'Security Guard' | 'Order Manager' | 'Finance Admin'
  device_id: string
  first_login: boolean
  created_at: string
  email?: string
  title: 'Mr' | 'Mrs' | 'Ms' | 'Dr'
  first_name: string
  last_name: string
  employee_id?: string
  phone_number: string
}

export interface BatchRecord {
  id: string
  product_id: string
  batch_number: string
  quantity: number
  expiry_date?: string
  created_at: string
}

export interface PriceHistory {
  id: string
  product_id: string
  old_price: number
  new_price: number
  changed_by: string
  changed_at: string
}

export interface OnDemandAssignment {
  id: string
  sales_rep_id: string
  assigned_by: string
  assignment_date: string
  notes: string
  status: 'active' | 'completed' | 'cancelled'
  vehicle_number: string | null
  assignment_type: 'admin_assigned' | 'sales_rep_requested'
  created_at: string
  updated_at: string
  sales_rep?: {
    username: string
  }
  assigned_by_user?: {
    username: string
  }
  assignment_items?: OnDemandAssignmentItem[]
}

export interface OnDemandAssignmentItem {
  id: string
  on_demand_assignment_id: string
  product_id: string
  assigned_quantity: number
  sold_quantity: number
  returned_quantity: number
  created_at: string
  products?: Product
  on_demand_orders?: OnDemandOrder[]
}

export interface OnDemandOrder {
  id: string
  on_demand_assignment_item_id: string
  sales_rep_id: string
  customer_name: string
  customer_phone?: string
  customer_type: 'existing' | 'walk-in'
  existing_customer_id?: string
  quantity_sold: number
  selling_price: number
  total_amount: number
  sale_date: string
  on_demand_order_display_id: string
  notes: string
  created_at: string
  customers?: Customer
  payment_method?: 'Net' | 'Cash' | null
  receipt_no?: string | null
}

export interface Vehicle {
  id: string
  vehicle_number: string
  vehicle_type: string
  capacity_cbm: number
  status: 'Available' | 'In Use' | 'Maintenance'
  sales_rep_id?: string | null
  created_at: string
  updated_at: string
}

export interface SystemSettings {
  id: string;
  vat_rate: number; // Stored as decimal, e.g., 0.18
  customer_categories: string[]; // Array of strings, e.g., ['Dealer', 'Hotel', 'Other']
  created_at: string;
  updated_at: string;
}