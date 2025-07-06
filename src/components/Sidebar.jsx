import React, { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, LayoutDashboard, Calendar, Users, Wrench, DollarSign, Settings, Building, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Sidebar = ({ open, setOpen }) => {
  const location = useLocation();
  const { t } = useTranslation();

  const navigation = [
    { name: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('nav.bookings'), href: '/bookings', icon: Calendar },
    { name: t('nav.customers'), href: '/customers', icon: Users },
    { name: t('nav.services'), href: '/services', icon: Wrench },
    { name: t('nav.payments'), href: '/payments', icon: DollarSign },
    { name: t('nav.clientPortal'), href: '/share', icon: Share2 },
    { name: t('nav.settings'), href: '/settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile sidebar backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setOpen(false)} />
        </div>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <div className="flex items-center">
            <Building className="h-8 w-8 text-blue-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">BizBoard</span>
          </div>
          <button
            type="button"
            className="p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-5 px-2 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon
                  className={`mr-3 h-6 w-6 ${
                    isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                  }`}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center">
            © 2024 BizBoard. All rights reserved.
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;