// src/components/SystemSettings.tsx
import React, { useState, useEffect } from 'react';
import { supabase, SystemSettings as SystemSettingsInterface } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Settings as SettingsIcon, Save, Plus, Trash2, AlertCircle } from 'lucide-react';

export const SystemSettings: React.FC = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettingsInterface | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vatRateInput, setVatRateInput] = useState<string>('');
  const [customerCategoriesInput, setCustomerCategoriesInput] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState<string>('');

  useEffect(() => {
    if (user?.role === 'Super Admin') {
      fetchSettings();
    }
  }, [user]);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();

      if (error) throw error;

      setSettings(data);
      setVatRateInput((data.vat_rate * 100).toFixed(2)); // Convert to percentage for display
      setCustomerCategoriesInput(data.customer_categories || []);
    } catch (err: any) {
      console.error('Error fetching system settings:', err);
      setError(err.message || 'Failed to fetch system settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const parsedVatRate = parseFloat(vatRateInput);
      if (isNaN(parsedVatRate) || parsedVatRate < 0 || parsedVatRate > 100) {
        throw new Error('VAT Rate must be a number between 0 and 100.');
      }

      const uniqueCategories = Array.from(new Set(customerCategoriesInput.map(cat => cat.trim()).filter(cat => cat !== '')));
      if (uniqueCategories.length === 0) {
        throw new Error('At least one customer category is required.');
      }

      const updatedSettings = {
        vat_rate: parsedVatRate / 100, // Convert back to decimal for storage
        customer_categories: uniqueCategories,
      };

      if (settings?.id) {
        const { error } = await supabase
          .from('system_settings')
          .update(updatedSettings)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // If no settings exist, insert a new row (should ideally only happen once)
        const { error } = await supabase
          .from('system_settings')
          .insert([updatedSettings]);

        if (error) throw error;
      }

      alert('System settings saved successfully!');
      fetchSettings(); // Re-fetch to ensure UI is updated with latest data
    } catch (err: any) {
      console.error('Error saving system settings:', err);
      setError(err.message || 'Failed to save system settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !customerCategoriesInput.includes(newCategory.trim())) {
      setCustomerCategoriesInput([...customerCategoriesInput, newCategory.trim()]);
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (categoryToRemove: string) => {
    setCustomerCategoriesInput(customerCategoriesInput.filter(cat => cat !== categoryToRemove));
  };

  if (user?.role !== 'Super Admin') {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <SettingsIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only Super Admins can manage system settings.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading system settings...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">System Settings</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* VAT Rate */}
          <div>
            <label htmlFor="vatRate" className="block text-sm font-medium text-gray-700 mb-1">
              VAT Rate (%)
            </label>
            <div className="relative mt-1 rounded-md shadow-sm">
              <input
                type="number"
                id="vatRate"
                value={vatRateInput}
                onChange={(e) => setVatRateInput(e.target.value)}
                className="block w-full pr-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                placeholder="e.g., 18.00"
                step="0.01"
                min="0"
                max="100"
                required
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <span className="text-gray-500 sm:text-sm">%</span>
              </div>
            </div>
          </div>

          {/* Customer Categories */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Categories
            </label>
            <div className="space-y-2">
              {customerCategoriesInput.map((category, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded-md border border-gray-200">
                  <span className="text-gray-800">{category}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCategory(category)}
                    className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex mt-3 space-x-2">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                placeholder="Add new category"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                'Saving...'
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};