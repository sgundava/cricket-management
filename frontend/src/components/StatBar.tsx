interface StatBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  color?: 'green' | 'blue' | 'red' | 'yellow' | 'purple';
  size?: 'sm' | 'md';
}

const colorClasses = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
};

export const StatBar = ({
  value,
  max = 100,
  label,
  showValue = true,
  color = 'blue',
  size = 'md',
}: StatBarProps) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-400">{label}</span>
          {showValue && <span className="text-gray-300">{value}</span>}
        </div>
      )}
      <div className={`w-full bg-gray-700 rounded-full ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
        <div
          className={`${colorClasses[color]} rounded-full transition-all duration-300 ${
            size === 'sm' ? 'h-1.5' : 'h-2'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
