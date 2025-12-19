interface FormIndicatorProps {
  form: number; // -20 to +20
  size?: 'sm' | 'md' | 'lg';
}

export const FormIndicator = ({ form, size = 'md' }: FormIndicatorProps) => {
  const getFormColor = () => {
    if (form >= 10) return 'text-green-400 bg-green-900/30';
    if (form >= 5) return 'text-green-300 bg-green-900/20';
    if (form >= 0) return 'text-gray-300 bg-gray-700/30';
    if (form >= -5) return 'text-yellow-300 bg-yellow-900/20';
    if (form >= -10) return 'text-orange-300 bg-orange-900/20';
    return 'text-red-400 bg-red-900/30';
  };

  const getFormLabel = () => {
    if (form >= 10) return 'Hot';
    if (form >= 5) return 'Good';
    if (form >= 0) return 'OK';
    if (form >= -5) return 'Dip';
    if (form >= -10) return 'Poor';
    return 'Bad';
  };

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span className={`rounded-md font-medium ${getFormColor()} ${sizeClasses[size]}`}>
      {form >= 0 ? '+' : ''}{form}
    </span>
  );
};
