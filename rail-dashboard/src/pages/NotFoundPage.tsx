import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Train, Home } from 'lucide-react';
import { Button } from '../components/common';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center mb-4 shadow-xs">
        <Train className="w-7 h-7" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">Track Section Not Found (404)</h1>
      <p className="text-xs text-slate-500 max-w-sm mb-6">
        The operational route or resource you requested does not exist or has been relocated.
      </p>
      <Button
        variant="primary"
        size="sm"
        onClick={() => navigate('/dashboard')}
        leftIcon={<Home className="w-4 h-4" />}
      >
        Return to Dashboard
      </Button>
    </div>
  );
};
